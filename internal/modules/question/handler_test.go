package question

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

func TestHandler_QuestionLifecycleAndVersions(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.questionBanks[11] = questionBankRef{ID: 11, TenantID: 1, CourseID: int64Ptr(10)}
	repo.questionBanks[12] = questionBankRef{ID: 12, TenantID: 1, CourseID: int64Ptr(10)}

	handler := NewHandler(NewService(repo), fakeTokenParser{
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

	createRec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions", map[string]any{
		"question_type": "single_choice",
		"difficulty":    "medium",
		"content": map[string]any{
			"stem": map[string]any{
				"content_type": "text",
				"text":         "1+1等于几？",
				"assets":       []any{},
			},
			"options": []map[string]any{
				{"key": "A", "content_type": "text", "text": "1", "assets": []any{}},
				{"key": "B", "content_type": "text", "text": "2", "assets": []any{}},
			},
			"option_order_randomizable": true,
			"ext":                       map[string]any{},
		},
		"answer": map[string]any{
			"judge_mode":   "by_option_key",
			"correct_keys": []string{"B"},
		},
		"analysis": map[string]any{
			"text": "基础算术",
		},
		"bank_ids":   []int64{11, 12},
		"course_ids": []int64{10},
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create question status = %d, body = %s", createRec.Code, createRec.Body.String())
	}

	var created envelope[Question]
	decodeQuestionBody(t, createRec, &created)
	if created.Code != 0 {
		t.Fatalf("create code = %d", created.Code)
	}
	if created.Data.Status != StatusActive {
		t.Fatalf("status = %q", created.Data.Status)
	}
	if created.Data.CurrentVersionID == nil || *created.Data.CurrentVersionID <= 0 {
		t.Fatalf("current_version_id = %+v", created.Data.CurrentVersionID)
	}
	if created.Data.CurrentVersionNo == nil || *created.Data.CurrentVersionNo != 1 {
		t.Fatalf("current_version_no = %+v", created.Data.CurrentVersionNo)
	}
	if len(created.Data.BankIDs) != 2 {
		t.Fatalf("bank_ids = %+v", created.Data.BankIDs)
	}
	if len(created.Data.CourseIDs) != 1 || created.Data.CourseIDs[0] != 10 {
		t.Fatalf("course_ids = %+v", created.Data.CourseIDs)
	}

	listRec := performQuestionRequest(
		router,
		http.MethodGet,
		"/api/v1/questions?question_type=single_choice&bank_id=11&course_id=10&status=active",
		nil,
		"token",
	)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list questions status = %d", listRec.Code)
	}
	var listed envelope[PageResult[Question]]
	decodeQuestionBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("question count = %d", len(listed.Data.Items))
	}

	updateRec := performQuestionRequest(
		router,
		http.MethodPut,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10),
		map[string]any{
			"difficulty": "hard",
			"status":     StatusDisabled,
			"bank_ids":   []int64{12},
			"course_ids": []int64{},
		},
		"token",
	)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update question status = %d", updateRec.Code)
	}
	var updated envelope[Question]
	decodeQuestionBody(t, updateRec, &updated)
	if updated.Data.Difficulty != "hard" {
		t.Fatalf("difficulty = %q", updated.Data.Difficulty)
	}
	if updated.Data.Status != StatusDisabled {
		t.Fatalf("status = %q", updated.Data.Status)
	}
	if len(updated.Data.BankIDs) != 1 || updated.Data.BankIDs[0] != 12 {
		t.Fatalf("updated bank_ids = %+v", updated.Data.BankIDs)
	}
	if len(updated.Data.CourseIDs) != 0 {
		t.Fatalf("updated course_ids = %+v", updated.Data.CourseIDs)
	}
	if updated.Data.CurrentVersionID == nil || created.Data.CurrentVersionID == nil || *updated.Data.CurrentVersionID != *created.Data.CurrentVersionID {
		t.Fatalf("current_version_id changed from %+v to %+v", created.Data.CurrentVersionID, updated.Data.CurrentVersionID)
	}

	versionsRec := performQuestionRequest(
		router,
		http.MethodGet,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10)+"/versions",
		nil,
		"token",
	)
	if versionsRec.Code != http.StatusOK {
		t.Fatalf("list versions status = %d", versionsRec.Code)
	}
	var versions envelope[[]QuestionVersion]
	decodeQuestionBody(t, versionsRec, &versions)
	if len(versions.Data) != 1 {
		t.Fatalf("version count = %d", len(versions.Data))
	}
	if versions.Data[0].VersionNo != 1 {
		t.Fatalf("version_no = %d", versions.Data[0].VersionNo)
	}

	createVersionRec := performQuestionRequest(
		router,
		http.MethodPost,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10)+"/versions",
		map[string]any{
			"content": map[string]any{
				"stem": map[string]any{
					"content_type": "text",
					"text":         "1+1=？",
					"assets":       []any{},
				},
				"options": []map[string]any{
					{"key": "A", "content_type": "text", "text": "1", "assets": []any{}},
					{"key": "B", "content_type": "text", "text": "2", "assets": []any{}},
				},
				"option_order_randomizable": true,
				"ext":                       map[string]any{},
			},
			"answer": map[string]any{
				"judge_mode":   "by_option_key",
				"correct_keys": []string{"B"},
			},
			"analysis": map[string]any{
				"text": "修正后的解析",
			},
			"change_summary": "修复题干文案",
		},
		"token",
	)
	if createVersionRec.Code != http.StatusOK {
		t.Fatalf("create version status = %d", createVersionRec.Code)
	}
	var versionCreated envelope[QuestionVersion]
	decodeQuestionBody(t, createVersionRec, &versionCreated)
	if versionCreated.Data.VersionNo != 2 {
		t.Fatalf("version_no = %d", versionCreated.Data.VersionNo)
	}
	if versionCreated.Data.ChangeSummary != "修复题干文案" {
		t.Fatalf("change_summary = %q", versionCreated.Data.ChangeSummary)
	}

	versionsRec = performQuestionRequest(
		router,
		http.MethodGet,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10)+"/versions",
		nil,
		"token",
	)
	decodeQuestionBody(t, versionsRec, &versions)
	if len(versions.Data) != 2 {
		t.Fatalf("version count after create = %d", len(versions.Data))
	}
	if versions.Data[0].VersionNo != 2 {
		t.Fatalf("latest version_no = %d", versions.Data[0].VersionNo)
	}
}

func TestHandler_QuestionRequiresPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository()), fakeTokenParser{
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

	rec := performQuestionRequest(router, http.MethodGet, "/api/v1/questions", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandler_StudentCanCreateQuestion(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.questionBanks[11] = questionBankRef{ID: 11, TenantID: 1, CourseID: int64Ptr(10)}
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:    21,
			TenantID:  1,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions", map[string]any{
		"question_type": "single_choice",
		"content": map[string]any{
			"stem": map[string]any{"content_type": "text", "text": "2+2=？"},
			"options": []map[string]any{
				{"key": "A", "content_type": "text", "text": "3"},
				{"key": "B", "content_type": "text", "text": "4"},
			},
		},
		"answer": map[string]any{
			"judge_mode":   "by_option_key",
			"correct_keys": []string{"B"},
		},
		"bank_ids":   []int64{11},
		"course_ids": []int64{10},
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var created envelope[Question]
	decodeQuestionBody(t, rec, &created)
	if created.Data.CreatorID != 21 || len(created.Data.BankIDs) != 1 {
		t.Fatalf("created question = %+v", created.Data)
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

type questionBankRef struct {
	ID       int64
	TenantID int64
	CourseID *int64
}

type memoryRepository struct {
	nextQuestionID  int64
	nextVersionID   int64
	questions       map[int64]Question
	versions        map[int64][]QuestionVersion
	questionBanks   map[int64]questionBankRef
	questionBankIDs map[int64][]int64
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextQuestionID:  1,
		nextVersionID:   1,
		questions:       map[int64]Question{},
		versions:        map[int64][]QuestionVersion{},
		questionBanks:   map[int64]questionBankRef{},
		questionBankIDs: map[int64][]int64{},
	}
}

func (repo *memoryRepository) ListQuestions(_ context.Context, scope Scope, filter QuestionListFilter) (PageResult[Question], error) {
	items := make([]Question, 0)
	tenantID := readTenantID(scope)
	for _, question := range repo.questions {
		if tenantID > 0 && question.TenantID != tenantID {
			continue
		}
		if filter.QuestionType != "" && question.QuestionType != filter.QuestionType {
			continue
		}
		if filter.Status != "" && question.Status != filter.Status {
			continue
		}
		if filter.BankID != nil && !containsInt64(question.BankIDs, *filter.BankID) {
			continue
		}
		if filter.CourseID != nil && !containsInt64(question.CourseIDs, *filter.CourseID) && !repo.matchesCourse(question.BankIDs, *filter.CourseID) {
			continue
		}
		items = append(items, question)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetQuestion(_ context.Context, scope Scope, id int64) (Question, error) {
	question, ok := repo.questions[id]
	tenantID := readTenantID(scope)
	if !ok || (tenantID > 0 && question.TenantID != tenantID) {
		return Question{}, ErrNotFound
	}
	return question, nil
}

func (repo *memoryRepository) CreateQuestion(_ context.Context, question Question, version QuestionVersion, bankIDs []int64, courseIDs []int64) (Question, error) {
	question.ID = repo.nextQuestionID
	repo.nextQuestionID++
	version.ID = repo.nextVersionID
	repo.nextVersionID++
	version.QuestionID = question.ID
	now := time.Date(2026, 4, 22, 11, 0, 0, 0, time.FixedZone("CST", 8*3600))
	question.CreatedAt = now
	question.UpdatedAt = now
	version.CreatedAt = now
	version.VersionNo = 1
	question.CurrentVersionID = &version.ID
	question.CurrentVersionNo = intPtr(1)
	question.BankIDs = append([]int64{}, bankIDs...)
	question.CourseIDs = append([]int64{}, courseIDs...)
	repo.questions[question.ID] = question
	repo.versions[question.ID] = []QuestionVersion{version}
	repo.questionBankIDs[question.ID] = append([]int64{}, bankIDs...)
	return question, nil
}

func (repo *memoryRepository) UpdateQuestion(_ context.Context, question Question, bankIDs []int64, courseIDs []int64) (Question, error) {
	current, ok := repo.questions[question.ID]
	if !ok || current.TenantID != question.TenantID {
		return Question{}, ErrNotFound
	}
	if bankIDs != nil {
		question.BankIDs = append([]int64{}, bankIDs...)
	} else {
		question.BankIDs = append([]int64{}, current.BankIDs...)
	}
	if courseIDs != nil {
		question.CourseIDs = append([]int64{}, courseIDs...)
	} else {
		question.CourseIDs = append([]int64{}, current.CourseIDs...)
	}
	question.CreatedAt = current.CreatedAt
	question.UpdatedAt = current.CreatedAt.Add(time.Hour)
	repo.questions[question.ID] = question
	return question, nil
}

func (repo *memoryRepository) ListVersions(_ context.Context, tenantID int64, questionID int64) ([]QuestionVersion, error) {
	question, ok := repo.questions[questionID]
	if !ok || question.TenantID != tenantID {
		return nil, ErrNotFound
	}
	versions := append([]QuestionVersion{}, repo.versions[questionID]...)
	return versions, nil
}

func (repo *memoryRepository) CreateVersion(_ context.Context, tenantID int64, questionID int64, version QuestionVersion) (QuestionVersion, Question, error) {
	question, ok := repo.questions[questionID]
	if !ok || question.TenantID != tenantID {
		return QuestionVersion{}, Question{}, ErrNotFound
	}
	version.ID = repo.nextVersionID
	repo.nextVersionID++
	version.QuestionID = questionID
	version.CreatedAt = question.CreatedAt.Add(2 * time.Hour)
	version.VersionNo = len(repo.versions[questionID]) + 1
	repo.versions[questionID] = append([]QuestionVersion{version}, repo.versions[questionID]...)
	question.CurrentVersionID = &version.ID
	question.CurrentVersionNo = intPtr(version.VersionNo)
	question.UpdatedAt = version.CreatedAt
	repo.questions[questionID] = question
	return version, question, nil
}

func (repo *memoryRepository) matchesCourse(bankIDs []int64, courseID int64) bool {
	for _, bankID := range bankIDs {
		bank, ok := repo.questionBanks[bankID]
		if !ok || bank.CourseID == nil {
			continue
		}
		if *bank.CourseID == courseID {
			return true
		}
	}
	return false
}

func performQuestionRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodeQuestionBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func int64Ptr(value int64) *int64 {
	return &value
}
