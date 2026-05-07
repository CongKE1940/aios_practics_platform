package rbac

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestMenuHandlerReturnsFilteredAdminMenus(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewMenuHandler(&fakeMenuTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Username:    "admin",
			DisplayName: "系统管理员",
			UserType:    "sys_admin",
			Roles:       []string{"sys_admin"},
			Permissions: []string{"org:manage", "user:manage", "notice:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/menus?app_type=admin", nil)
	req.Header.Set("Authorization", "Bearer access_token")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code int        `json:"code"`
		Data []MenuItem `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Code != 0 {
		t.Fatalf("Code = %d", body.Code)
	}
	if len(body.Data) != 13 {
		t.Fatalf("Data = %+v", body.Data)
	}
	if body.Data[0].Path != "/admin/workbench" {
		t.Fatalf("First menu path = %q", body.Data[0].Path)
	}
	if body.Data[1].Path != "/admin/org" {
		t.Fatalf("Second menu path = %q", body.Data[1].Path)
	}
	if body.Data[2].Path != "/admin/courses" {
		t.Fatalf("Third menu path = %q", body.Data[2].Path)
	}
	systemMenu := findMenuByPath(body.Data, "/admin/system")
	if systemMenu == nil || len(systemMenu.Children) == 0 {
		t.Fatalf("system children = %+v", systemMenu)
	}
	for _, child := range systemMenu.Children {
		switch child.Path {
		case "/admin/question-banks", "/admin/questions", "/admin/imports", "/admin/exams", "/admin/exam-papers", "/admin/exams/assembly", "/admin/challenges", "/admin/analytics":
			t.Fatalf("business menu should not be nested under system: %+v", child)
		}
	}
	for _, path := range []string{
		"/admin/question-banks",
		"/admin/questions",
		"/admin/imports",
		"/admin/exams",
		"/admin/exam-papers",
		"/admin/exams/assembly",
		"/admin/challenges",
		"/admin/analytics",
	} {
		if !containsTopLevelMenuPath(body.Data, path) {
			t.Fatalf("top-level business menu missing: %s | %+v", path, body.Data)
		}
	}
	if !containsMenuPath(body.Data, "/admin/system/config") {
		t.Fatalf("system config menu missing: %+v", body.Data)
	}
}

func TestMenuHandlerRejectsMissingBearerToken(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewMenuHandler(&fakeMenuTokenParser{})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/menus?app_type=admin", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rec.Code)
	}
}

type fakeMenuTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser *fakeMenuTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

func containsTopLevelMenuPath(menus []MenuItem, path string) bool {
	for _, menu := range menus {
		if menu.Path == path {
			return true
		}
	}
	return false
}

func findMenuByPath(menus []MenuItem, path string) *MenuItem {
	for index := range menus {
		if menus[index].Path == path {
			return &menus[index]
		}
	}
	return nil
}
