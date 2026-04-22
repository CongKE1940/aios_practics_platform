package analytics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_TeacherClassPracticeSummaryReturnsOverviewAndStudents(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.summary = ClassPracticeSummary{
		ClassID:                  101,
		ClassName:                "一班",
		CourseID:                 12,
		CourseName:               "数学",
		StudentCount:             2,
		ParticipatedStudentCount: 1,
		SessionCount:             2,
		AnsweredCount:            5,
		CorrectCount:             4,
		WrongCount:               1,
		Accuracy:                 0.8,
		WrongQuestionCount:       1,
		ConfusedQuestionCount:    1,
	}
	repo.students = []ClassPracticeStudentItem{
		{
			StudentID:             7001,
			StudentName:           "张三",
			StudentNo:             strPtr("S001"),
			SessionCount:          2,
			AnsweredCount:         5,
			CorrectCount:          4,
			WrongCount:            1,
			Accuracy:              0.8,
			WrongQuestionCount:    1,
			ConfusedQuestionCount: 1,
		},
		{
			StudentID:             7002,
			StudentName:           "李四",
			StudentNo:             strPtr("S002"),
			SessionCount:          0,
			AnsweredCount:         0,
			CorrectCount:          0,
			WrongCount:            0,
			Accuracy:              0,
			WrongQuestionCount:    0,
			ConfusedQuestionCount: 0,
		},
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12&page=1&page_size=20", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[ClassPracticeSummaryResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.Summary.ClassName != "一班" || body.Data.Summary.Accuracy != 0.8 {
		t.Fatalf("summary = %+v", body.Data.Summary)
	}
	if len(body.Data.Students.Items) != 2 {
		t.Fatalf("student count = %d", len(body.Data.Students.Items))
	}
	if body.Data.Students.Items[0].StudentName != "张三" {
		t.Fatalf("first student = %+v", body.Data.Students.Items[0])
	}
}

func TestHandler_TeacherCannotViewUnassignedClassCourse(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = false
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_AdminCanViewTenantClassCourse(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.summary = ClassPracticeSummary{ClassID: 101, ClassName: "一班", CourseID: 12, CourseName: "数学"}
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      1,
			UserType:    "sys_admin",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_RejectsMissingAnalyticsPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"practice:use"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_RejectsMissingClassOrCourseID(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?course_id=12", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestService_RejectsTimeRangeLongerThan366Days(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	service := NewService(repo)

	startAt := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	endAt := startAt.AddDate(1, 1, 2)
	_, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
	}, ClassPracticeSummaryQuery{
		TenantID: 1,
		ClassID:  101,
		CourseID: 12,
		StartAt:  &startAt,
		EndAt:    &endAt,
		Page:     1,
		PageSize: 20,
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_ReturnsZeroAccuracyWhenNoAnswers(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.summary = ClassPracticeSummary{
		ClassID:       101,
		ClassName:     "一班",
		CourseID:      12,
		CourseName:    "数学",
		AnsweredCount: 0,
		CorrectCount:  0,
		WrongCount:    0,
		Accuracy:      0,
		StudentCount:  2,
		SessionCount:  0,
	}
	repo.students = []ClassPracticeStudentItem{
		{StudentID: 7001, StudentName: "张三", Accuracy: 0},
	}

	service := NewService(repo)
	result, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, ClassPracticeSummaryQuery{
		TenantID: 1,
		ClassID:  101,
		CourseID: 12,
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if result.Summary.Accuracy != 0 {
		t.Fatalf("accuracy = %v", result.Summary.Accuracy)
	}
}

func TestService_UsesDefaultRecent30DayRangeAndNormalizesPagination(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.summary = ClassPracticeSummary{ClassID: 101, ClassName: "一班", CourseID: 12, CourseName: "数学"}
	service := NewService(repo)
	fixedNow := time.Date(2024, 4, 22, 15, 4, 5, 0, time.UTC)
	service.now = func() time.Time {
		return fixedNow
	}

	_, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, ClassPracticeSummaryQuery{
		TenantID: 1,
		ClassID:  101,
		CourseID: 12,
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if repo.lastQuery.Page != 1 || repo.lastQuery.PageSize != 20 {
		t.Fatalf("pagination = page %d size %d", repo.lastQuery.Page, repo.lastQuery.PageSize)
	}
	if repo.lastQuery.StartAt == nil || repo.lastQuery.EndAt == nil {
		t.Fatalf("time range = %+v", repo.lastQuery)
	}
	if !repo.lastQuery.EndAt.Equal(fixedNow) {
		t.Fatalf("end at = %v", repo.lastQuery.EndAt)
	}
	if !repo.lastQuery.StartAt.Equal(fixedNow.AddDate(0, 0, -30)) {
		t.Fatalf("start at = %v", repo.lastQuery.StartAt)
	}
}

type analyticsEnvelope[T any] struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      T      `json:"data"`
	RequestID string `json:"request_id,omitempty"`
}

type fakeAnalyticsParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeAnalyticsParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

func newAnalyticsTestRouter(repo *memoryAnalyticsRepository, parser fakeAnalyticsParser) http.Handler {
	handler := NewHandler(NewService(repo), parser)
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)
	return router
}

type memoryAnalyticsRepository struct {
	classCourseExists bool
	teacherAllowed    bool
	summary           ClassPracticeSummary
	students          []ClassPracticeStudentItem
	lastQuery         ClassPracticeSummaryQuery
}

func newMemoryAnalyticsRepository() *memoryAnalyticsRepository {
	return &memoryAnalyticsRepository{}
}

func (repo *memoryAnalyticsRepository) ClassCourseExists(_ context.Context, _ int64, _ int64, _ int64) (bool, error) {
	return repo.classCourseExists, nil
}

func (repo *memoryAnalyticsRepository) TeacherCanViewClassCourse(_ context.Context, _ int64, _ int64, _ int64, _ int64) (bool, error) {
	return repo.teacherAllowed, nil
}

func (repo *memoryAnalyticsRepository) GetClassPracticeSummary(_ context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error) {
	repo.lastQuery = query
	return repo.summary, nil
}

func (repo *memoryAnalyticsRepository) ListClassPracticeStudents(_ context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error) {
	repo.lastQuery = query
	return pageOf(repo.students, query.Page, query.PageSize), nil
}

func performAnalyticsRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodeAnalyticsBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func strPtr(value string) *string {
	return &value
}
