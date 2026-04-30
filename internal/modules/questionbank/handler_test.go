package questionbank

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_QuestionBankLifecycleAndVisibility(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"question_bank:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	createRec := performQuestionBankRequest(router, http.MethodPost, "/api/v1/question-banks", map[string]any{
		"name":        "高一数学基础题库",
		"course_id":   10,
		"description": "代数基础",
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create question bank status = %d, body = %s", createRec.Code, createRec.Body.String())
	}

	var created envelope[QuestionBank]
	decodeQuestionBankBody(t, createRec, &created)
	if created.Code != 0 {
		t.Fatalf("create code = %d", created.Code)
	}
	if created.Data.TenantID != 1 {
		t.Fatalf("tenant_id = %d", created.Data.TenantID)
	}
	if created.Data.OwnerOrgType != OwnerOrgTypeSchool {
		t.Fatalf("owner_org_type = %q", created.Data.OwnerOrgType)
	}
	if created.Data.CreatorID != 1 {
		t.Fatalf("creator_id = %d", created.Data.CreatorID)
	}
	if created.Data.Status != StatusDraft {
		t.Fatalf("status = %q", created.Data.Status)
	}
	if created.Data.SourceType != SourceTypeManual {
		t.Fatalf("source_type = %q", created.Data.SourceType)
	}

	listRec := performQuestionBankRequest(
		router,
		http.MethodGet,
		"/api/v1/question-banks?keyword=高一&status=draft&course_id=10",
		nil,
		"token",
	)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list question banks status = %d", listRec.Code)
	}
	var listed envelope[PageResult[QuestionBank]]
	decodeQuestionBankBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("question bank count = %d", len(listed.Data.Items))
	}

	updateRec := performQuestionBankRequest(router, http.MethodPut, "/api/v1/question-banks/"+strconv.FormatInt(created.Data.ID, 10), map[string]any{
		"name":        "高一数学基础题库（修订）",
		"course_id":   11,
		"description": "代数基础与函数",
	}, "token")
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update question bank status = %d", updateRec.Code)
	}
	var updated envelope[QuestionBank]
	decodeQuestionBankBody(t, updateRec, &updated)
	if updated.Data.Name != "高一数学基础题库（修订）" {
		t.Fatalf("updated name = %q", updated.Data.Name)
	}
	if updated.Data.CourseID == nil || *updated.Data.CourseID != 11 {
		t.Fatalf("updated course_id = %+v", updated.Data.CourseID)
	}

	publishRec := performQuestionBankRequest(
		router,
		http.MethodPost,
		"/api/v1/question-banks/"+strconv.FormatInt(created.Data.ID, 10)+"/publish",
		nil,
		"token",
	)
	if publishRec.Code != http.StatusOK {
		t.Fatalf("publish question bank status = %d", publishRec.Code)
	}
	var published envelope[QuestionBank]
	decodeQuestionBankBody(t, publishRec, &published)
	if published.Data.Status != StatusActive {
		t.Fatalf("published status = %q", published.Data.Status)
	}

	visibilityRec := performQuestionBankRequest(
		router,
		http.MethodPost,
		"/api/v1/question-banks/"+strconv.FormatInt(created.Data.ID, 10)+"/visibility",
		map[string]any{
			"grants": []map[string]any{
				{
					"grant_type":          "class",
					"target_type":         "class",
					"target_id":           301,
					"permission_type":     "practice",
					"inherit_to_children": false,
				},
				{
					"grant_type":          "grade",
					"target_type":         "grade",
					"target_id":           21,
					"permission_type":     "exam",
					"inherit_to_children": true,
				},
			},
		},
		"token",
	)
	if visibilityRec.Code != http.StatusOK {
		t.Fatalf("assign visibility status = %d", visibilityRec.Code)
	}

	grants := repo.visibility[created.Data.ID]
	if len(grants) != 2 {
		t.Fatalf("grant count = %d", len(grants))
	}
	if grants[0].PermissionType != "practice" {
		t.Fatalf("grant 0 permission_type = %q", grants[0].PermissionType)
	}
	if !grants[1].InheritToChildren {
		t.Fatalf("grant 1 inherit_to_children = %v", grants[1].InheritToChildren)
	}
}

func TestHandler_QuestionBankRequiresPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository()), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"question:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performQuestionBankRequest(router, http.MethodGet, "/api/v1/question-banks", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}

	var body envelope[any]
	decodeQuestionBankBody(t, rec, &body)
	if body.Code != CodeForbidden {
		t.Fatalf("code = %d", body.Code)
	}
}

func TestHandler_QuestionBankRejectsCrossTenantAccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	service := NewService(repo)
	if _, err := service.CreateQuestionBank(context.Background(), Scope{
		TenantID: 1,
		UserID:   1,
	}, QuestionBankInput{
		Name: "跨租户题库",
	}); err != nil {
		t.Fatalf("seed question bank: %v", err)
	}

	handler := NewHandler(service, fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      2,
			TenantID:    2,
			Permissions: []string{"question_bank:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performQuestionBankRequest(router, http.MethodPost, "/api/v1/question-banks/1/publish", nil, "token")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
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
	nextQuestionBankID int64
	questionBanks      map[int64]QuestionBank
	visibility         map[int64][]QuestionBankVisibilityGrant
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextQuestionBankID: 1,
		questionBanks:      map[int64]QuestionBank{},
		visibility:         map[int64][]QuestionBankVisibilityGrant{},
	}
}

func (repo *memoryRepository) ListQuestionBanks(_ context.Context, tenantID int64, filter QuestionBankListFilter) (PageResult[QuestionBank], error) {
	items := make([]QuestionBank, 0)
	for _, questionBank := range repo.questionBanks {
		if questionBank.TenantID != tenantID {
			continue
		}
		if filter.CourseID != nil {
			if questionBank.CourseID == nil || *questionBank.CourseID != *filter.CourseID {
				continue
			}
		}
		if filter.Status != "" && questionBank.Status != filter.Status {
			continue
		}
		if filter.Keyword != "" && !containsKeyword(questionBank.Name, questionBank.Description, filter.Keyword) {
			continue
		}
		items = append(items, questionBank)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetQuestionBank(_ context.Context, tenantID int64, id int64) (QuestionBank, error) {
	questionBank, ok := repo.questionBanks[id]
	if !ok || questionBank.TenantID != tenantID {
		return QuestionBank{}, ErrNotFound
	}
	return questionBank, nil
}

func (repo *memoryRepository) CreateQuestionBank(_ context.Context, questionBank QuestionBank) (QuestionBank, error) {
	questionBank.ID = repo.nextQuestionBankID
	repo.nextQuestionBankID++
	if questionBank.CreatedAt.IsZero() {
		questionBank.CreatedAt = time.Date(2026, 4, 22, 10, 0, 0, 0, time.FixedZone("CST", 8*3600))
	}
	questionBank.UpdatedAt = questionBank.CreatedAt
	repo.questionBanks[questionBank.ID] = questionBank
	return questionBank, nil
}

func (repo *memoryRepository) UpdateQuestionBank(_ context.Context, questionBank QuestionBank) (QuestionBank, error) {
	current, ok := repo.questionBanks[questionBank.ID]
	if !ok || current.TenantID != questionBank.TenantID {
		return QuestionBank{}, ErrNotFound
	}
	questionBank.CreatedAt = current.CreatedAt
	questionBank.UpdatedAt = current.CreatedAt.Add(time.Hour)
	repo.questionBanks[questionBank.ID] = questionBank
	return questionBank, nil
}

func (repo *memoryRepository) PublishQuestionBank(_ context.Context, tenantID int64, id int64) (QuestionBank, error) {
	questionBank, ok := repo.questionBanks[id]
	if !ok || questionBank.TenantID != tenantID {
		return QuestionBank{}, ErrNotFound
	}
	questionBank.Status = StatusActive
	questionBank.UpdatedAt = questionBank.CreatedAt.Add(2 * time.Hour)
	repo.questionBanks[id] = questionBank
	return questionBank, nil
}

func (repo *memoryRepository) ReplaceVisibility(_ context.Context, tenantID int64, questionBankID int64, _ int64, grants []QuestionBankVisibilityGrant) error {
	questionBank, ok := repo.questionBanks[questionBankID]
	if !ok || questionBank.TenantID != tenantID {
		return ErrNotFound
	}
	repo.visibility[questionBankID] = append([]QuestionBankVisibilityGrant{}, grants...)
	return nil
}

func performQuestionBankRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var requestBody []byte
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		requestBody = payload
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
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

func decodeQuestionBankBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}
