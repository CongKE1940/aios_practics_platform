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
	if len(body.Data) != 3 {
		t.Fatalf("Data = %+v", body.Data)
	}
	if body.Data[0].Path != "/admin/org" {
		t.Fatalf("First menu path = %q", body.Data[0].Path)
	}
	if body.Data[1].Path != "/admin/courses" {
		t.Fatalf("Second menu path = %q", body.Data[1].Path)
	}
	if len(body.Data[2].Children) != 2 {
		t.Fatalf("system children = %+v", body.Data[2].Children)
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
