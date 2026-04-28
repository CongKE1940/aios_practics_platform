package config

import "testing"

func TestLoadUsesDefaultsForLocalDevelopment(t *testing.T) {
	t.Setenv("AIOS_APP_ENV", "")
	t.Setenv("AIOS_HTTP_ADDR", "")
	t.Setenv("AIOS_PLATFORM_TENANT_ID", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.App.Name != "aios-practice-platform" {
		t.Fatalf("App.Name = %q", cfg.App.Name)
	}
	if cfg.App.Env != "local" {
		t.Fatalf("App.Env = %q", cfg.App.Env)
	}
	if cfg.HTTP.Addr != ":18081" {
		t.Fatalf("HTTP.Addr = %q", cfg.HTTP.Addr)
	}
	if cfg.PlatformTenantID != 1 {
		t.Fatalf("PlatformTenantID = %d", cfg.PlatformTenantID)
	}
}

func TestLoadRejectsInvalidPlatformTenantID(t *testing.T) {
	t.Setenv("AIOS_PLATFORM_TENANT_ID", "not-a-number")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid tenant id error")
	}
}

func TestLoadReadsAuthAndDatabaseSettings(t *testing.T) {
	t.Setenv("AIOS_MYSQL_DSN", "user:pass@tcp(127.0.0.1:3306)/aios")
	t.Setenv("AIOS_JWT_SECRET", "dev-secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Database.DSN != "user:pass@tcp(127.0.0.1:3306)/aios" {
		t.Fatalf("Database.DSN = %q", cfg.Database.DSN)
	}
	if cfg.Auth.JWTSecret != "dev-secret" {
		t.Fatalf("Auth.JWTSecret = %q", cfg.Auth.JWTSecret)
	}
	if cfg.Auth.AccessTokenTTLSeconds != 7200 {
		t.Fatalf("Auth.AccessTokenTTLSeconds = %d", cfg.Auth.AccessTokenTTLSeconds)
	}
}
