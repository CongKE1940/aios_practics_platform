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
		"paper_rules": []map[string]any{
			{"question_type": "single_choice", "score_per_question": 2, "question_count": 5, "bank_ids": []int{11, 12}},
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
	if len(payload.Data.PaperRules) != 1 || payload.Data.PaperRules[0].QuestionType != "single_choice" {
		t.Fatalf("paper_rules = %+v", payload.Data.PaperRules)
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

func TestHandler_ListExamsAllowsStudentWithoutPublishPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created := mustCreatePublishedFixedExam(t, repo)
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:  1,
			UserID:    10001,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamAuthorizedRequest(router, http.MethodGet, "/api/v1/exams", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[PageResult[Exam]]
	decodeExamBody(t, rec, &payload)
	if len(payload.Data.Items) != 1 || payload.Data.Items[0].ID != created.ID {
		t.Fatalf("items = %+v", payload.Data.Items)
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

func TestHandler_PublishFixedExamSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created, err := repo.CreateExam(context.Background(), Scope{TenantID: 1, UserID: 7}, ExamInput{
		Name:            "待发布考试",
		ExamMode:        ExamModeFixed,
		StartTime:       mustParseExamTime(t, "2026-04-23T09:00:00+08:00"),
		EndTime:         mustParseExamTime(t, "2026-04-23T10:00:00+08:00"),
		DurationMinutes: 60,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeClass, TargetID: 1001},
		},
		FixedQuestions: []ExamFixedQuestionInput{
			{QuestionID: 91, QuestionVersionID: 191, Score: 10, DisplayOrder: 1},
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

	rec := performExamAuthorizedRequest(router, http.MethodPost, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10)+"/publish", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[ExamDetail]
	decodeExamBody(t, rec, &payload)
	if payload.Data.Status != ExamStatusPublished {
		t.Fatalf("status = %q", payload.Data.Status)
	}
}

func TestHandler_PublishFixedExamWithoutQuestionsReturnsBadRequest(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created, err := repo.CreateExam(context.Background(), Scope{TenantID: 1, UserID: 7}, ExamInput{
		Name:            "空题考试",
		ExamMode:        ExamModeFixed,
		StartTime:       mustParseExamTime(t, "2026-04-23T09:00:00+08:00"),
		EndTime:         mustParseExamTime(t, "2026-04-23T10:00:00+08:00"),
		DurationMinutes: 60,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeClass, TargetID: 1001},
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

	rec := performExamAuthorizedRequest(router, http.MethodPost, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10)+"/publish", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_PublishPublishedExamReturnsForbidden(t *testing.T) {
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
			{QuestionID: 91, QuestionVersionID: 191, Score: 10, DisplayOrder: 1},
		},
	})
	if err != nil {
		t.Fatalf("CreateExam() error = %v", err)
	}
	current := repo.items[created.ID]
	current.Status = ExamStatusPublished
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

	rec := performExamAuthorizedRequest(router, http.MethodPost, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10)+"/publish", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_StartAttemptReturnsExistingAttempt(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created := mustCreatePublishedFixedExam(t, repo)
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:  1,
			UserID:    10001,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	first := performExamAuthorizedRequest(router, http.MethodPost, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10)+"/attempts", nil, "token")
	if first.Code != http.StatusOK {
		t.Fatalf("first status = %d, body = %s", first.Code, first.Body.String())
	}
	second := performExamAuthorizedRequest(router, http.MethodPost, "/api/v1/exams/"+strconv.FormatInt(created.ID, 10)+"/attempts", nil, "token")
	if second.Code != http.StatusOK {
		t.Fatalf("second status = %d, body = %s", second.Code, second.Body.String())
	}

	var firstPayload examEnvelope[ExamAttemptDetail]
	var secondPayload examEnvelope[ExamAttemptDetail]
	decodeExamBody(t, first, &firstPayload)
	decodeExamBody(t, second, &secondPayload)
	if firstPayload.Data.Attempt.ID == 0 || firstPayload.Data.Attempt.ID != secondPayload.Data.Attempt.ID {
		t.Fatalf("attempt ids = %d/%d", firstPayload.Data.Attempt.ID, secondPayload.Data.Attempt.ID)
	}
	if len(firstPayload.Data.Questions) != 1 {
		t.Fatalf("questions len = %d", len(firstPayload.Data.Questions))
	}
	if firstPayload.Data.Questions[0].QuestionType != "single_choice" {
		t.Fatalf("question_type = %q", firstPayload.Data.Questions[0].QuestionType)
	}
	stem, _ := firstPayload.Data.Questions[0].Content["stem"].(map[string]any)
	if stem["text"] != "1+1等于几？" {
		t.Fatalf("content = %+v", firstPayload.Data.Questions[0].Content)
	}
}

func TestHandler_SaveAttemptAnswerIsIdempotent(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created := mustCreatePublishedFixedExam(t, repo)
	scope := Scope{TenantID: 1, UserID: 10001}
	attempt, err := repo.StartAttempt(context.Background(), scope, created.ID)
	if err != nil {
		t.Fatalf("StartAttempt() error = %v", err)
	}
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:  1,
			UserID:    10001,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))
	body := map[string]any{
		"display_order": 1,
		"answer":        map[string]any{"selected_keys": []string{"A"}},
	}
	first := performExamJSONRequest(router, http.MethodPost, "/api/v1/exam-attempts/"+strconv.FormatInt(attempt.Attempt.ID, 10)+"/answers", body)
	if first.Code != http.StatusOK {
		t.Fatalf("first status = %d, body = %s", first.Code, first.Body.String())
	}
	body["answer"] = map[string]any{"selected_keys": []string{"B"}}
	second := performExamJSONRequest(router, http.MethodPost, "/api/v1/exam-attempts/"+strconv.FormatInt(attempt.Attempt.ID, 10)+"/answers", body)
	if second.Code != http.StatusOK {
		t.Fatalf("second status = %d, body = %s", second.Code, second.Body.String())
	}

	stored, err := repo.GetAttempt(context.Background(), scope, attempt.Attempt.ID)
	if err != nil {
		t.Fatalf("GetAttempt() error = %v", err)
	}
	if len(stored.Answers) != 1 || stored.Answers[0].Answer["selected_keys"] == nil {
		t.Fatalf("answers = %+v", stored.Answers)
	}
}

func TestHandler_SubmitAttemptScoresAndKeepsMasteredUnchanged(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryExamRepository()
	created := mustCreatePublishedFixedExam(t, repo)
	scope := Scope{TenantID: 1, UserID: 10001}
	attempt, err := repo.StartAttempt(context.Background(), scope, created.ID)
	if err != nil {
		t.Fatalf("StartAttempt() error = %v", err)
	}
	if _, err := repo.SaveAttemptAnswer(context.Background(), scope, attempt.Attempt.ID, SaveAttemptAnswerInput{
		DisplayOrder: 1,
		Answer:       map[string]any{"selected_keys": []string{"B"}},
	}); err != nil {
		t.Fatalf("SaveAttemptAnswer() error = %v", err)
	}
	handler := NewHandler(NewService(repo), fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:  1,
			UserID:    10001,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := performExamAuthorizedRequest(router, http.MethodPost, "/api/v1/exam-attempts/"+strconv.FormatInt(attempt.Attempt.ID, 10)+"/submit", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload examEnvelope[ExamAttemptResult]
	decodeExamBody(t, rec, &payload)
	if payload.Data.Attempt.Status != ExamAttemptStatusSubmitted {
		t.Fatalf("status = %q", payload.Data.Attempt.Status)
	}
	if payload.Data.FinalScore != 0 || repo.examWrongCount[91] != 1 {
		t.Fatalf("final_score = %.2f, wrong_count = %d", payload.Data.FinalScore, repo.examWrongCount[91])
	}
	if repo.markedMastered {
		t.Fatal("exam submit should not mark mastered")
	}

	resultRec := performExamAuthorizedRequest(router, http.MethodGet, "/api/v1/exam-attempts/"+strconv.FormatInt(attempt.Attempt.ID, 10)+"/result", nil, "token")
	if resultRec.Code != http.StatusOK {
		t.Fatalf("result status = %d, body = %s", resultRec.Code, resultRec.Body.String())
	}
	var resultPayload examEnvelope[ExamAttemptResult]
	decodeExamBody(t, resultRec, &resultPayload)
	if resultPayload.Data.Attempt.Status != ExamAttemptStatusSubmitted {
		t.Fatalf("result status = %q", resultPayload.Data.Attempt.Status)
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

func mustCreatePublishedFixedExam(t *testing.T, repo *memoryExamRepository) ExamDetail {
	t.Helper()
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
			{QuestionID: 91, QuestionVersionID: 191, Score: 10, DisplayOrder: 1},
		},
	})
	if err != nil {
		t.Fatalf("CreateExam() error = %v", err)
	}
	current := repo.items[created.ID]
	current.Status = ExamStatusPublished
	repo.items[created.ID] = current
	return current
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
	nextID         int64
	nextAttemptID  int64
	items          map[int64]ExamDetail
	attempts       map[int64]ExamAttemptDetail
	examAttempts   map[int64]int64
	correctAnswers map[int64]map[string]any
	examWrongCount map[int64]int
	markedMastered bool
}

func newMemoryExamRepository() *memoryExamRepository {
	return &memoryExamRepository{
		nextID:         1,
		nextAttemptID:  1,
		items:          map[int64]ExamDetail{},
		attempts:       map[int64]ExamAttemptDetail{},
		examAttempts:   map[int64]int64{},
		correctAnswers: map[int64]map[string]any{},
		examWrongCount: map[int64]int{},
	}
}

func (repo *memoryExamRepository) ListExams(_ context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	items := make([]Exam, 0, len(repo.items))
	for _, item := range repo.items {
		if item.TenantID != scope.TenantID {
			continue
		}
		if !containsPermission(scope.Permissions, "exam:publish") && item.Status != ExamStatusPublished {
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
		PaperRules:     append([]ExamPaperRule{}, input.PaperRules...),
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
		repo.correctAnswers[question.QuestionID] = map[string]any{
			"judge_mode":   "by_option_key",
			"correct_keys": []any{"A"},
		}
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
	current.PaperRules = current.PaperRules[:0]
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
	current.PaperRules = append(current.PaperRules, input.PaperRules...)
	repo.items[id] = current
	return current, nil
}

func (repo *memoryExamRepository) PublishExam(_ context.Context, scope Scope, id int64) (ExamDetail, error) {
	current, ok := repo.items[id]
	if !ok || current.TenantID != scope.TenantID {
		return ExamDetail{}, ErrNotFound
	}
	if current.Status != ExamStatusDraft {
		return ExamDetail{}, ErrForbidden
	}
	if current.ExamMode != ExamModeFixed || len(current.FixedQuestions) == 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	current.Status = ExamStatusPublished
	repo.items[id] = current
	return current, nil
}

func (repo *memoryExamRepository) StartAttempt(_ context.Context, scope Scope, examID int64) (ExamAttemptDetail, error) {
	if attemptID, ok := repo.examAttempts[examID]; ok {
		return repo.GetAttempt(context.Background(), scope, attemptID)
	}
	exam, ok := repo.items[examID]
	if !ok || exam.TenantID != scope.TenantID || exam.Status != ExamStatusPublished {
		return ExamAttemptDetail{}, ErrNotFound
	}
	now := time.Date(2026, 4, 23, 9, 0, 0, 0, time.FixedZone("CST", 8*3600))
	detail := ExamAttemptDetail{
		Attempt: ExamAttempt{
			ID:        repo.nextAttemptID,
			ExamID:    examID,
			PaperID:   1,
			TenantID:  scope.TenantID,
			UserID:    scope.UserID,
			StartAt:   &now,
			Status:    ExamAttemptStatusInProgress,
			CreatedAt: now,
			UpdatedAt: now,
		},
		Questions: make([]ExamAttemptQuestion, 0, len(exam.FixedQuestions)),
	}
	for _, question := range exam.FixedQuestions {
		detail.Questions = append(detail.Questions, ExamAttemptQuestion{
			QuestionID:        question.QuestionID,
			QuestionVersionID: question.QuestionVersionID,
			DisplayOrder:      question.DisplayOrder,
			Score:             question.Score,
			QuestionType:      "single_choice",
			Content: map[string]any{
				"stem": map[string]any{"text": "1+1等于几？"},
				"options": []any{
					map[string]any{"key": "A", "text": "2"},
					map[string]any{"key": "B", "text": "3"},
				},
			},
		})
	}
	repo.attempts[detail.Attempt.ID] = detail
	repo.examAttempts[examID] = detail.Attempt.ID
	repo.nextAttemptID++
	return detail, nil
}

func (repo *memoryExamRepository) GetAttempt(_ context.Context, scope Scope, attemptID int64) (ExamAttemptDetail, error) {
	detail, ok := repo.attempts[attemptID]
	if !ok || detail.Attempt.TenantID != scope.TenantID || detail.Attempt.UserID != scope.UserID {
		return ExamAttemptDetail{}, ErrNotFound
	}
	return detail, nil
}

func (repo *memoryExamRepository) SaveAttemptAnswer(_ context.Context, scope Scope, attemptID int64, input SaveAttemptAnswerInput) (ExamAttemptAnswer, error) {
	detail, ok := repo.attempts[attemptID]
	if !ok || detail.Attempt.TenantID != scope.TenantID || detail.Attempt.UserID != scope.UserID {
		return ExamAttemptAnswer{}, ErrNotFound
	}
	if detail.Attempt.Status != ExamAttemptStatusInProgress {
		return ExamAttemptAnswer{}, ErrForbidden
	}
	var matched ExamAttemptQuestion
	for _, question := range detail.Questions {
		if question.DisplayOrder == input.DisplayOrder {
			matched = question
			break
		}
	}
	if matched.QuestionID == 0 {
		return ExamAttemptAnswer{}, ErrNotFound
	}
	answer := ExamAttemptAnswer{
		AttemptID:         attemptID,
		QuestionID:        matched.QuestionID,
		QuestionVersionID: matched.QuestionVersionID,
		DisplayOrder:      input.DisplayOrder,
		Answer:            input.Answer,
	}
	replaced := false
	for index := range detail.Answers {
		if detail.Answers[index].DisplayOrder == input.DisplayOrder {
			detail.Answers[index] = answer
			replaced = true
			break
		}
	}
	if !replaced {
		detail.Answers = append(detail.Answers, answer)
	}
	repo.attempts[attemptID] = detail
	return answer, nil
}

func (repo *memoryExamRepository) SubmitAttempt(_ context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	detail, ok := repo.attempts[attemptID]
	if !ok || detail.Attempt.TenantID != scope.TenantID || detail.Attempt.UserID != scope.UserID {
		return ExamAttemptResult{}, ErrNotFound
	}
	if detail.Attempt.Status != ExamAttemptStatusInProgress {
		return repo.GetAttemptResult(context.Background(), scope, attemptID)
	}
	total := 0.0
	for index := range detail.Answers {
		correctAnswer := repo.correctAnswers[detail.Answers[index].QuestionID]
		isCorrect, err := judgeExamAnswer(correctAnswer, detail.Answers[index].Answer)
		if err != nil {
			return ExamAttemptResult{}, err
		}
		detail.Answers[index].IsCorrect = &isCorrect
		if isCorrect {
			for _, question := range detail.Questions {
				if question.DisplayOrder == detail.Answers[index].DisplayOrder {
					detail.Answers[index].Score = question.Score
					total += question.Score
					break
				}
			}
		} else {
			repo.examWrongCount[detail.Answers[index].QuestionID]++
		}
	}
	now := time.Date(2026, 4, 23, 9, 30, 0, 0, time.FixedZone("CST", 8*3600))
	detail.Attempt.Status = ExamAttemptStatusSubmitted
	detail.Attempt.SubmitAt = &now
	detail.Attempt.ObjectiveScore = total
	detail.Attempt.FinalScore = total
	repo.attempts[attemptID] = detail
	return repo.GetAttemptResult(context.Background(), scope, attemptID)
}

func (repo *memoryExamRepository) GetAttemptResult(_ context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	detail, ok := repo.attempts[attemptID]
	if !ok || detail.Attempt.TenantID != scope.TenantID || detail.Attempt.UserID != scope.UserID {
		return ExamAttemptResult{}, ErrNotFound
	}
	return ExamAttemptResult{
		Attempt:        detail.Attempt,
		Answers:        append([]ExamAttemptAnswer{}, detail.Answers...),
		ObjectiveScore: detail.Attempt.ObjectiveScore,
		FinalScore:     detail.Attempt.FinalScore,
	}, nil
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
