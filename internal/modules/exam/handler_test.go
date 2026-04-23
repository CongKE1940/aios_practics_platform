package exam

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

func TestHandler_CreateExamSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"exam:publish"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamJSONRequest(router, http.MethodPost, "/api/v1/exams", map[string]any{
		"name":             "期中模拟",
		"exam_mode":        "fixed",
		"start_time":       "2026-04-23T09:00:00+08:00",
		"end_time":         "2026-04-23T11:00:00+08:00",
		"duration_minutes": 90,
		"targets": []map[string]any{
			{"target_type": "class", "target_id": 101},
			{"target_type": "user", "target_id": 202},
		},
		"fixed_questions": []map[string]any{
			{"question_id": 11, "question_version_id": 111, "score": 5, "display_order": 1},
			{"question_id": 12, "question_version_id": 112, "score": 10, "display_order": 2},
		},
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[ExamDetail]
	decodeExamBody(t, rec, &payload)
	if payload.Data.ID == 0 {
		t.Fatal("created exam id should not be zero")
	}
	if payload.Data.Status != ExamStatusDraft {
		t.Fatalf("status = %q", payload.Data.Status)
	}
	if payload.Data.CreatorID != 7 {
		t.Fatalf("creator_id = %d", payload.Data.CreatorID)
	}
	if len(payload.Data.Targets) != 2 {
		t.Fatalf("targets len = %d", len(payload.Data.Targets))
	}
	if len(payload.Data.FixedQuestions) != 2 {
		t.Fatalf("fixed_questions len = %d", len(payload.Data.FixedQuestions))
	}
	if payload.Data.FixedQuestions[1].QuestionVersionID != 112 {
		t.Fatalf("question_version_id = %d", payload.Data.FixedQuestions[1].QuestionVersionID)
	}
}

func TestHandler_CreateRandomAssemblyExamSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"exam:publish"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamJSONRequest(router, http.MethodPost, "/api/v1/exams", map[string]any{
		"name":             "随机组卷模拟",
		"exam_mode":        "random_assembly",
		"start_time":       "2026-04-23T09:00:00+08:00",
		"end_time":         "2026-04-23T11:00:00+08:00",
		"duration_minutes": 90,
		"targets": []map[string]any{
			{"target_type": "class", "target_id": 101},
		},
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[ExamDetail]
	decodeExamBody(t, rec, &payload)
	if payload.Data.ExamMode != ExamModeRandom {
		t.Fatalf("exam_mode = %q", payload.Data.ExamMode)
	}
	if len(payload.Data.FixedQuestions) != 0 {
		t.Fatalf("fixed_questions len = %d", len(payload.Data.FixedQuestions))
	}
}

func TestHandler_ExamEndpointsRequirePublishPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamAuthorizedRequest(router, http.MethodGet, "/api/v1/exams", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetExamDetailSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created, err := repo.CreateExam(context.Background(), Scope{TenantID: 1, UserID: 7}, ExamInput{
		Name:            "单元测试卷",
		ExamMode:        ExamModeFixed,
		StartTime:       mustParseExamTime(t, "2026-04-23T09:00:00+08:00"),
		EndTime:         mustParseExamTime(t, "2026-04-23T10:30:00+08:00"),
		DurationMinutes: 90,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeCourse, TargetID: 301},
		},
		FixedQuestions: []ExamFixedQuestionInput{
			{QuestionID: 51, QuestionVersionID: 151, Score: 8, DisplayOrder: 1},
		},
	})
	if err != nil {
		t.Fatalf("CreateExam() error = %v", err)
	}

	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"exam:publish"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamAuthorizedRequest(router, http.MethodGet, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10), nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[ExamDetail]
	decodeExamBody(t, rec, &payload)
	if payload.Data.ID != created.ID {
		t.Fatalf("id = %d", payload.Data.ID)
	}
	if len(payload.Data.FixedQuestions) != 1 || payload.Data.FixedQuestions[0].QuestionID != 51 {
		t.Fatalf("fixed_questions = %+v", payload.Data.FixedQuestions)
	}
}

func TestHandler_UpdateExamSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created, err := repo.CreateExam(context.Background(), Scope{TenantID: 1, UserID: 7}, ExamInput{
		Name:            "更新前考试",
		ExamMode:        ExamModeFixed,
		StartTime:       mustParseExamTime(t, "2026-04-23T09:00:00+08:00"),
		EndTime:         mustParseExamTime(t, "2026-04-23T10:00:00+08:00"),
		DurationMinutes: 60,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeClass, TargetID: 1001},
		},
		FixedQuestions: []ExamFixedQuestionInput{
			{QuestionID: 71, QuestionVersionID: 171, Score: 10, DisplayOrder: 1},
		},
	})
	if err != nil {
		t.Fatalf("CreateExam() error = %v", err)
	}

	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"exam:publish"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamJSONRequest(router, http.MethodPut, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10), map[string]any{
		"name":             "更新后考试",
		"exam_mode":        "fixed",
		"start_time":       "2026-04-24T09:00:00+08:00",
		"end_time":         "2026-04-24T11:00:00+08:00",
		"duration_minutes": 100,
		"targets": []map[string]any{
			{"target_type": "course", "target_id": 2001},
			{"target_type": "user", "target_id": 2002},
		},
		"fixed_questions": []map[string]any{
			{"question_id": 81, "question_version_id": 181, "score": 12, "display_order": 1},
			{"question_id": 82, "question_version_id": 182, "score": 18, "display_order": 2},
		},
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[ExamDetail]
	decodeExamBody(t, rec, &payload)
	if payload.Data.Name != "更新后考试" {
		t.Fatalf("name = %q", payload.Data.Name)
	}
	if len(payload.Data.Targets) != 2 || payload.Data.Targets[0].TargetType != TargetTypeCourse {
		t.Fatalf("targets = %+v", payload.Data.Targets)
	}
	if len(payload.Data.FixedQuestions) != 2 || payload.Data.FixedQuestions[1].QuestionID != 82 {
		t.Fatalf("fixed_questions = %+v", payload.Data.FixedQuestions)
	}
}

func TestHandler_UpdatePublishedExamReturnsForbidden(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created, err := repo.CreateExam(context.Background(), Scope{TenantID: 1, UserID: 7}, ExamInput{
		Name:            "已发布考试",
		ExamMode:        ExamModeFixed,
		StartTime:       mustParseExamTime(t, "2026-04-23T09:00:00+08:00"),
		EndTime:         mustParseExamTime(t, "2026-04-23T10:00:00+08:00"),
		DurationMinutes: 60,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeClass, TargetID: 1001},
		},
		FixedQuestions: []ExamFixedQuestionInput{
			{QuestionID: 71, QuestionVersionID: 171, Score: 10, DisplayOrder: 1},
		},
	})
	if err != nil {
		t.Fatalf("CreateExam() error = %v", err)
	}
	current := repo.items[created.ID]
	current.Status = "published"
	repo.items[created.ID] = current

	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"exam:publish"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamJSONRequest(router, http.MethodPut, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10), map[string]any{
		"name":             "更新后考试",
		"exam_mode":        "fixed",
		"start_time":       "2026-04-24T09:00:00+08:00",
		"end_time":         "2026-04-24T11:00:00+08:00",
		"duration_minutes": 100,
		"targets": []map[string]any{
			{"target_type": "course", "target_id": 2001},
		},
		"fixed_questions": []map[string]any{
			{"question_id": 81, "question_version_id": 181, "score": 12, "display_order": 1},
		},
	})

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ListExamsRequiresAuthorization(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	parser := fakeExamTokenParser{}
	handler := NewHandler(NewService(newMemoryExamRepository()), parser)

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/exams", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

type examEnvelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeExamTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeExamTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type memoryExamRepository struct {
	nextID int64
	items  map[int64]ExamDetail
}

func newMemoryExamRepository() *memoryExamRepository {
	return &memoryExamRepository{
		nextID: 1,
		items:  map[int64]ExamDetail{},
	}
}

func (repo *memoryExamRepository) ListExams(_ context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	items := make([]Exam, 0, len(repo.items))
	for _, item := range repo.items {
		if item.TenantID != scope.TenantID {
			continue
		}
		items = append(items, item.Exam)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryExamRepository) CreateExam(_ context.Context, scope Scope, input ExamInput) (ExamDetail, error) {
	now := time.Date(2026, 4, 23, 8, 0, 0, 0, time.FixedZone("CST", 8*3600))
	item := ExamDetail{
		Exam: Exam{
			ID:              repo.nextID,
			TenantID:        scope.TenantID,
			OwnerOrgType:    OwnerOrgTypeSchool,
			OwnerOrgID:      scope.TenantID,
			CreatorID:       scope.UserID,
			Name:            input.Name,
			ExamMode:        input.ExamMode,
			Status:          ExamStatusDraft,
			StartTime:       input.StartTime,
			EndTime:         input.EndTime,
			DurationMinutes: input.DurationMinutes,
			CreatedAt:       now,
			UpdatedAt:       now,
		},
		Targets:        make([]ExamTarget, 0, len(input.Targets)),
		FixedQuestions: make([]ExamFixedQuestion, 0, len(input.FixedQuestions)),
	}
	for _, target := range input.Targets {
		item.Targets = append(item.Targets, ExamTarget{
			TargetType: target.TargetType,
			TargetID:   target.TargetID,
		})
	}
	for _, question := range input.FixedQuestions {
		item.FixedQuestions = append(item.FixedQuestions, ExamFixedQuestion{
			QuestionID:        question.QuestionID,
			QuestionVersionID: question.QuestionVersionID,
			Score:             question.Score,
			DisplayOrder:      question.DisplayOrder,
			CreatedAt:         now,
		})
	}
	repo.items[item.ID] = item
	repo.nextID++
	return item, nil
}

func (repo *memoryExamRepository) GetExam(_ context.Context, scope Scope, id int64) (ExamDetail, error) {
	item, ok := repo.items[id]
	if !ok || item.TenantID != scope.TenantID {
		return ExamDetail{}, ErrNotFound
	}
	return item, nil
}

func (repo *memoryExamRepository) UpdateExam(_ context.Context, scope Scope, id int64, input ExamInput) (ExamDetail, error) {
	current, ok := repo.items[id]
	if !ok || current.TenantID != scope.TenantID {
		return ExamDetail{}, ErrNotFound
	}
	if current.Status != ExamStatusDraft {
		return ExamDetail{}, ErrForbidden
	}
	current.Name = input.Name
	current.ExamMode = input.ExamMode
	current.StartTime = input.StartTime
	current.EndTime = input.EndTime
	current.DurationMinutes = input.DurationMinutes
	current.Targets = current.Targets[:0]
	current.FixedQuestions = current.FixedQuestions[:0]
	for _, target := range input.Targets {
		current.Targets = append(current.Targets, ExamTarget{
			TargetType: target.TargetType,
			TargetID:   target.TargetID,
		})
	}
	for _, question := range input.FixedQuestions {
		current.FixedQuestions = append(current.FixedQuestions, ExamFixedQuestion{
			QuestionID:        question.QuestionID,
			QuestionVersionID: question.QuestionVersionID,
			Score:             question.Score,
			DisplayOrder:      question.DisplayOrder,
			CreatedAt:         current.CreatedAt,
		})
	}
	repo.items[id] = current
	return current, nil
}

func performExamJSONRequest(router http.Handler, method string, path string, body any) *httptest.ResponseRecorder {
	return performExamAuthorizedRequest(router, method, path, body, "token")
}

func performExamAuthorizedRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var requestBody []byte
	if body != nil {
		var err error
		requestBody, err = json.Marshal(body)
		if err != nil {
			panic(err)
		}
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeExamBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}

func mustParseExamTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("time.Parse() error = %v", err)
	}
	return parsed
}
