package exam

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_ListExamsRequiresAuthorization(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	parser := &fakeExamTokenParser{}
	handler := NewHandler(NewService(&MySQLRepository{}), parser)

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/exams", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if parser.called {
		t.Fatalf("token parser should not be called without authorization header")
	}
}

func TestHandler_ListExamsReturnsDataFromRepository(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := &fakeExamRepository{
		listResult: PageResult[Exam]{
			Items: []Exam{
				{ID: 101, Name: "七年级数学周测"},
			},
			Page:     1,
			PageSize: 20,
			Total:    1,
		},
	}
	parser := &fakeExamTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"exam:publish"},
		},
	}
	handler := NewHandler(NewService(repo), parser)

	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/exams?page=1&page_size=20", nil)
	req.Header.Set("Authorization", "Bearer token")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !repo.called {
		t.Fatal("repository should be called")
	}
	if parser.called != true {
		t.Fatal("token parser should be called")
	}
}

func TestHandler_ListExamsReturnsServiceErrorWhenDependenciesMissing(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := &Handler{}
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/exams", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

type fakeExamTokenParser struct {
	called bool
	claims auth.AccessClaims
}

func (parser *fakeExamTokenParser) ParseToken(_ context.Context, _ string, _ string) (auth.AccessClaims, error) {
	parser.called = true
	return parser.claims, nil
}

type fakeExamRepository struct {
	called     bool
	listFilter ExamListFilter
	listScope  Scope
	listResult PageResult[Exam]
}

func (repo *fakeExamRepository) ListExams(_ context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	repo.called = true
	repo.listScope = scope
	repo.listFilter = filter
	return repo.listResult, nil
}
