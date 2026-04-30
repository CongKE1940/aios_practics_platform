package snapshot

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

func TestHandler_ListAuditLogsReturnsPagedItems(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := &memorySnapshotRepository{
		auditLogs: PageResult[AuditLog]{
			Items: []AuditLog{
				{
					ID:           1,
					TenantID:     1,
					ModuleName:   "snapshot",
					ActionName:   "student_transition",
					ResourceType: "student",
					Result:       AuditResultSuccess,
					CreatedAt:    time.Date(2026, 4, 23, 9, 0, 0, 0, time.UTC),
				},
			},
			Page:     1,
			PageSize: 20,
			Total:    1,
		},
	}

	router := newSnapshotTestRouter(repo, fakeSnapshotParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      1,
			UserType:    "sys_admin",
			Permissions: []string{"audit:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performSnapshotRequest(router, http.MethodGet, "/api/v1/audit-logs?module_name=snapshot&page=1&page_size=20", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body snapshotEnvelope[PageResult[AuditLog]]
	decodeSnapshotBody(t, rec, &body)
	if len(body.Data.Items) != 1 || body.Data.Items[0].ActionName != "student_transition" {
		t.Fatalf("body = %+v", body.Data)
	}
	if repo.lastAuditLogFilter.ModuleName != "snapshot" {
		t.Fatalf("filter = %+v", repo.lastAuditLogFilter)
	}
}

func TestHandler_RecordStudentTransitionReturnsCreatedItem(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	occurredAt := time.Date(2026, 4, 23, 10, 0, 0, 0, time.UTC)
	repo := &memorySnapshotRepository{
		studentTransition: StudentTransition{
			ID:             10,
			TenantID:       1,
			StudentID:      501,
			TransitionType: TransitionTypePromote,
			ToClassID:      int64Ptr(302),
			OccurredAt:     occurredAt,
			OperatorID:     1,
			Remark:         "升入新班级",
			CreatedAt:      occurredAt,
		},
	}
	router := newSnapshotTestRouter(repo, fakeSnapshotParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      1,
			UserType:    "sys_admin",
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performSnapshotRequest(router, http.MethodPost, "/api/v1/student-transitions", map[string]any{
		"student_id":      501,
		"transition_type": "promote",
		"to_class_id":     302,
		"occurred_at":     occurredAt.Format(time.RFC3339),
		"remark":          "升入新班级",
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body snapshotEnvelope[StudentTransition]
	decodeSnapshotBody(t, rec, &body)
	if body.Data.ID != 10 || body.Data.TransitionType != TransitionTypePromote {
		t.Fatalf("body = %+v", body.Data)
	}
	if repo.lastStudentTransitionInput.ToClassID != 302 {
		t.Fatalf("input = %+v", repo.lastStudentTransitionInput)
	}
}

func TestHandler_RecordTeacherAssignmentChangeReturnsCreatedItem(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	effectiveAt := time.Date(2026, 4, 23, 11, 0, 0, 0, time.UTC)
	repo := &memorySnapshotRepository{
		teacherAssignmentHistory: TeacherAssignmentHistory{
			ID:            20,
			TenantID:      1,
			TeacherID:     701,
			ClassID:       301,
			CourseID:      10,
			ChangeType:    TeacherAssignmentChangeAssign,
			EffectiveFrom: effectiveAt,
			OperatorID:    1,
			CreatedAt:     effectiveAt,
		},
	}
	router := newSnapshotTestRouter(repo, fakeSnapshotParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      1,
			UserType:    "sys_admin",
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performSnapshotRequest(router, http.MethodPost, "/api/v1/teacher-assignment-changes", map[string]any{
		"teacher_id":   701,
		"class_id":     301,
		"course_id":    10,
		"change_type":  "assign",
		"effective_at": effectiveAt.Format(time.RFC3339),
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body snapshotEnvelope[TeacherAssignmentHistory]
	decodeSnapshotBody(t, rec, &body)
	if body.Data.ID != 20 || body.Data.ChangeType != TeacherAssignmentChangeAssign {
		t.Fatalf("body = %+v", body.Data)
	}
	if repo.lastTeacherAssignmentInput.TeacherID != 701 {
		t.Fatalf("input = %+v", repo.lastTeacherAssignmentInput)
	}
}

func TestService_ListAuditLogsRejectsMissingPermission(t *testing.T) {
	service := NewService(&memorySnapshotRepository{})

	_, err := service.ListAuditLogs(context.Background(), Scope{
		TenantID: 1,
		UserID:   1,
		UserType: "school_admin",
	}, AuditLogListFilter{})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
}

type snapshotEnvelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeSnapshotParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeSnapshotParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type memorySnapshotRepository struct {
	auditLogs                  PageResult[AuditLog]
	entitySnapshots            PageResult[EntitySnapshot]
	studentTransitions         PageResult[StudentTransition]
	teacherAssignmentHistories PageResult[TeacherAssignmentHistory]
	studentTransition          StudentTransition
	teacherAssignmentHistory   TeacherAssignmentHistory
	lastAuditLogFilter         AuditLogListFilter
	lastStudentTransitionInput StudentTransitionInput
	lastTeacherAssignmentInput TeacherAssignmentChangeInput
}

func (repo *memorySnapshotRepository) ListAuditLogs(_ context.Context, _ int64, filter AuditLogListFilter) (PageResult[AuditLog], error) {
	repo.lastAuditLogFilter = filter
	return repo.auditLogs, nil
}

func (repo *memorySnapshotRepository) ListEntitySnapshots(_ context.Context, _ int64, _ EntitySnapshotListFilter) (PageResult[EntitySnapshot], error) {
	return repo.entitySnapshots, nil
}

func (repo *memorySnapshotRepository) ListStudentTransitions(_ context.Context, _ int64, _ StudentTransitionListFilter) (PageResult[StudentTransition], error) {
	return repo.studentTransitions, nil
}

func (repo *memorySnapshotRepository) ApplyStudentTransition(_ context.Context, _ int64, _ int64, input StudentTransitionInput) (StudentTransition, error) {
	repo.lastStudentTransitionInput = input
	return repo.studentTransition, nil
}

func (repo *memorySnapshotRepository) ListTeacherAssignmentHistories(
	_ context.Context,
	_ int64,
	_ TeacherAssignmentHistoryListFilter,
) (PageResult[TeacherAssignmentHistory], error) {
	return repo.teacherAssignmentHistories, nil
}

func (repo *memorySnapshotRepository) ApplyTeacherAssignmentChange(
	_ context.Context,
	_ int64,
	_ int64,
	input TeacherAssignmentChangeInput,
) (TeacherAssignmentHistory, error) {
	repo.lastTeacherAssignmentInput = input
	return repo.teacherAssignmentHistory, nil
}

func newSnapshotTestRouter(repo Repository, parser TokenParser) http.Handler {
	handler := NewHandler(NewService(repo), parser)
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)
	return router
}

func performSnapshotRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodeSnapshotBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}
