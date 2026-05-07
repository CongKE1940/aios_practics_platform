package fileasset

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_UploadImportAndGetDetail(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository(), newMemoryContentStore()), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"file:upload"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	uploadRec := performMultipartRequest(
		router,
		"/api/v1/files/upload",
		"token",
		"file",
		"questions.csv",
		[]byte("id,title\n1,示例题"),
		map[string]string{"usage": "import_file"},
	)
	if uploadRec.Code != http.StatusOK {
		t.Fatalf("upload status = %d", uploadRec.Code)
	}

	var uploaded envelope[FileAsset]
	decodeFileBody(t, uploadRec, &uploaded)
	if uploaded.Data.SourceType != SourceTypeUpload {
		t.Fatalf("source_type = %q", uploaded.Data.SourceType)
	}
	if uploaded.Data.FileSize <= 0 {
		t.Fatalf("file_size = %d", uploaded.Data.FileSize)
	}
	if !strings.Contains(uploaded.Data.ObjectKey, "tenant/1/import_file/") {
		t.Fatalf("object_key = %q", uploaded.Data.ObjectKey)
	}

	detailRec := performFileRequest(router, http.MethodGet, "/api/v1/files/"+strconv.FormatInt(uploaded.Data.ID, 10), nil, "token")
	if detailRec.Code != http.StatusOK {
		t.Fatalf("detail status = %d", detailRec.Code)
	}

	var detail envelope[FileAsset]
	decodeFileBody(t, detailRec, &detail)
	if detail.Data.OriginalFilename != "questions.csv" {
		t.Fatalf("original_filename = %q", detail.Data.OriginalFilename)
	}
	if detail.Data.URL == "" {
		t.Fatalf("url should not be empty")
	}

	contentRec := performFileRequest(router, http.MethodGet, "/api/v1/files/"+strconv.FormatInt(uploaded.Data.ID, 10)+"/content", nil, "token")
	if contentRec.Code != http.StatusOK {
		t.Fatalf("content status = %d", contentRec.Code)
	}
	if contentRec.Body.String() != "id,title\n1,示例题" {
		t.Fatalf("content body = %q", contentRec.Body.String())
	}

	importRec := performFileRequest(router, http.MethodPost, "/api/v1/files/import-url", map[string]any{
		"url":   "https://example.com/assets/question.png",
		"usage": "question_asset",
	}, "token")
	if importRec.Code != http.StatusOK {
		t.Fatalf("import status = %d", importRec.Code)
	}

	var imported envelope[FileAsset]
	decodeFileBody(t, importRec, &imported)
	if imported.Data.SourceType != SourceTypeRemoteURL {
		t.Fatalf("source_type = %q", imported.Data.SourceType)
	}
	if imported.Data.OriginalURL != "https://example.com/assets/question.png" {
		t.Fatalf("original_url = %q", imported.Data.OriginalURL)
	}

	redirectRec := performFileRequest(router, http.MethodGet, "/api/v1/files/"+strconv.FormatInt(imported.Data.ID, 10)+"/content", nil, "token")
	if redirectRec.Code != http.StatusFound {
		t.Fatalf("redirect status = %d", redirectRec.Code)
	}
	if redirectRec.Header().Get("Location") != "https://example.com/assets/question.png" {
		t.Fatalf("redirect location = %q", redirectRec.Header().Get("Location"))
	}
}

func TestHandler_RejectsFileOperationsWithoutPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository(), newMemoryContentStore()), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"user:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performMultipartRequest(
		router,
		"/api/v1/files/upload",
		"token",
		"file",
		"question.png",
		[]byte("fake-image"),
		map[string]string{"usage": "question_asset"},
	)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandler_AllowsCurrentUserAvatarUploadWithoutFilePermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository(), newMemoryContentStore()), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performMultipartRequest(
		router,
		"/api/v1/files/upload",
		"token",
		"file",
		"avatar.png",
		[]byte("fake-image"),
		map[string]string{"usage": "user_avatar"},
	)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload status = %d", rec.Code)
	}
}

type envelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type memoryRepository struct {
	nextID int64
	items  map[int64]FileAsset
}

type memoryContentStore struct {
	items map[string][]byte
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextID: 1,
		items:  map[int64]FileAsset{},
	}
}

func newMemoryContentStore() *memoryContentStore {
	return &memoryContentStore{items: map[string][]byte{}}
}

func (repo *memoryRepository) Create(_ context.Context, asset FileAsset) (FileAsset, error) {
	asset.ID = repo.nextID
	repo.nextID++
	if asset.Status == "" {
		asset.Status = StatusActive
	}
	repo.items[asset.ID] = asset
	return asset, nil
}

func (repo *memoryRepository) GetByID(_ context.Context, tenantID int64, id int64) (FileAsset, error) {
	item, ok := repo.items[id]
	if !ok || item.TenantID != tenantID {
		return FileAsset{}, ErrNotFound
	}
	return item, nil
}

func (store *memoryContentStore) Save(_ context.Context, objectKey string, content io.Reader, _ SaveOptions) error {
	payload, err := io.ReadAll(content)
	if err != nil {
		return err
	}
	store.items[objectKey] = append([]byte{}, payload...)
	return nil
}

func (store *memoryContentStore) Open(_ context.Context, objectKey string) (io.ReadCloser, error) {
	payload, ok := store.items[objectKey]
	if !ok {
		return nil, ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(payload)), nil
}

func performFileRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		reader = bytes.NewReader(payload)
	}

	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func performMultipartRequest(
	router http.Handler,
	path string,
	token string,
	fieldName string,
	filename string,
	content []byte,
	fields map[string]string,
) *httptest.ResponseRecorder {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			panic(err)
		}
	}
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		panic(err)
	}
	if _, err := part.Write(content); err != nil {
		panic(err)
	}
	if err := writer.Close(); err != nil {
		panic(err)
	}

	req := httptest.NewRequest(http.MethodPost, path, body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeFileBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}
