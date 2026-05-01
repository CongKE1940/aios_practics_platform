package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHandlerLoginReturnsSuccessEnvelope(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{
		result: LoginResult{
			AccessToken:  "access_token",
			RefreshToken: "refresh_token",
			ExpiresIn:    7200,
			User: CurrentUser{
				ID:          1,
				TenantID:    1,
				DisplayName: "系统管理员",
				UserType:    "sys_admin",
				Roles:       []string{"sys_admin"},
			},
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"tenant_code":"platform","username":"admin","password":"secret123"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Request-Id", "req_login")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code      int `json:"code"`
		Data      LoginResult
		RequestID string `json:"request_id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Code != 0 {
		t.Fatalf("Code = %d", body.Code)
	}
	if body.Data.AccessToken != "access_token" {
		t.Fatalf("AccessToken = %q", body.Data.AccessToken)
	}
	if body.RequestID != "req_login" {
		t.Fatalf("RequestID = %q", body.RequestID)
	}
}

func TestHandlerListLoginOrganizationsReturnsSuccessEnvelope(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{
		loginOrganizations: []LoginOrganization{
			{TenantID: 1, TenantCode: "platform", TenantName: "平台管理", TenantType: "platform", IsDefault: true},
			{TenantID: 2, TenantCode: "demo_school", TenantName: "演示学校", TenantType: "school"},
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/login-organizations", nil)
	req.Header.Set("X-Request-Id", "req_orgs")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code      int                 `json:"code"`
		Data      []LoginOrganization `json:"data"`
		RequestID string              `json:"request_id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Code != 0 {
		t.Fatalf("Code = %d", body.Code)
	}
	if len(body.Data) != 2 {
		t.Fatalf("len(Data) = %d", len(body.Data))
	}
	if body.Data[0].TenantCode != "platform" || !body.Data[0].IsDefault {
		t.Fatalf("Data[0] = %+v", body.Data[0])
	}
	if body.RequestID != "req_orgs" {
		t.Fatalf("RequestID = %q", body.RequestID)
	}
}

func TestHandlerLoginMapsInvalidCredentials(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{err: ErrInvalidCredentials})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"tenant_code":"platform","username":"admin","password":"bad"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Code != CodeInvalidCredentials {
		t.Fatalf("Code = %d", body.Code)
	}
}

func TestHandlerLoginMapsPasswordChangeRequired(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{err: ErrPasswordChangeRequired})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"tenant_code":"demo_school","username":"admin","password":"Init@123456"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code int `json:"code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Code != CodePasswordChangeRequired {
		t.Fatalf("Code = %d", body.Code)
	}
}

func TestHandlerChangeInitialPasswordReturnsTrue(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/change-initial-password", bytes.NewBufferString(`{"tenant_code":"demo_school","username":"admin","old_password":"Init@123456","new_password":"Safe@123456"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Data bool `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if !body.Data {
		t.Fatal("Data = false")
	}
}

func TestHandlerRefreshReturnsNewTokenPair(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{
		result: LoginResult{
			AccessToken:  "new_access_token",
			RefreshToken: "new_refresh_token",
			ExpiresIn:    7200,
			User:         CurrentUser{ID: 1, TenantID: 1, Roles: []string{"sys_admin"}},
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", bytes.NewBufferString(`{"refresh_token":"refresh_token"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code int `json:"code"`
		Data LoginResult
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Data.AccessToken != "new_access_token" {
		t.Fatalf("AccessToken = %q", body.Data.AccessToken)
	}
}

func TestHandlerMeReturnsCurrentUserFromBearerToken(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{
		user: CurrentUser{ID: 1, TenantID: 1, DisplayName: "系统管理员", Roles: []string{"sys_admin"}},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer access_token")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code int         `json:"code"`
		Data CurrentUser `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if body.Data.ID != 1 || body.Data.Roles[0] != "sys_admin" {
		t.Fatalf("Data = %+v", body.Data)
	}
}

func TestHandlerLogoutReturnsTrue(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Data bool `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if !body.Data {
		t.Fatal("Data = false")
	}
}

func TestHandlerLoginRejectsMissingTenantCode(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	handler := NewHandler(&fakeLoginService{})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"username":"admin","password":"secret123"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
}

type fakeLoginService struct {
	result             LoginResult
	user               CurrentUser
	err                error
	loginOrganizations []LoginOrganization
}

func (service *fakeLoginService) ListLoginOrganizations(_ context.Context) ([]LoginOrganization, error) {
	return service.loginOrganizations, service.err
}

func (service *fakeLoginService) Login(_ context.Context, command LoginCommand) (LoginResult, error) {
	if command.TenantCode == "" || command.Username == "" || command.Password == "" {
		return LoginResult{}, errors.New("missing command")
	}
	return service.result, service.err
}

func (service *fakeLoginService) ChangeInitialPassword(_ context.Context, command ChangeInitialPasswordCommand) error {
	if command.TenantCode == "" || command.Username == "" || command.OldPassword == "" || command.NewPassword == "" {
		return errors.New("missing command")
	}
	return service.err
}

func (service *fakeLoginService) Refresh(_ context.Context, command RefreshCommand) (LoginResult, error) {
	if command.RefreshToken == "" {
		return LoginResult{}, errors.New("missing refresh token")
	}
	return service.result, service.err
}

func (service *fakeLoginService) CurrentUser(_ context.Context, accessToken string) (CurrentUser, error) {
	if accessToken == "" {
		return CurrentUser{}, errors.New("missing access token")
	}
	return service.user, service.err
}

func (service *fakeLoginService) Logout(_ context.Context, accessToken string) error {
	return service.err
}
