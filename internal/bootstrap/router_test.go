package bootstrap

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/config"
	"aios_practice_platform/internal/common/response"
)

func TestHealthzReturnsSuccessEnvelope(t *testing.T) {
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-Id", "req_health")
	rec := httptest.NewRecorder()

	NewRouter(cfg).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Code      int            `json:"code"`
		Message   string         `json:"message"`
		Data      map[string]any `json:"data"`
		RequestID string         `json:"request_id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if body.Code != 0 {
		t.Fatalf("Code = %d", body.Code)
	}
	if body.RequestID != "req_health" {
		t.Fatalf("RequestID = %q", body.RequestID)
	}
	if body.Data["status"] != "ok" {
		t.Fatalf("Data.status = %v", body.Data["status"])
	}
}

func TestRouterMountsAPIV1AuthRoutes(t *testing.T) {
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	rec := httptest.NewRecorder()

	NewRouter(cfg, WithAPIV1Routes(func(router gin.IRouter) {
		router.POST("/auth/login", func(ctx *gin.Context) {
			ctx.JSON(http.StatusOK, response.Success(true, ""))
		})
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}
