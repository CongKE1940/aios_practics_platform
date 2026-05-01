package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	App              AppConfig
	HTTP             HTTPConfig
	Database         DatabaseConfig
	Redis            RedisConfig
	Auth             AuthConfig
	FileStorage      FileStorageConfig
	PlatformTenantID int64
}

type AppConfig struct {
	Name string
	Env  string
}

type HTTPConfig struct {
	Addr string
}

type DatabaseConfig struct {
	DSN string
}

type RedisConfig struct {
	Addr string
}

type AuthConfig struct {
	JWTSecret             string
	AccessTokenTTLSeconds int64
}

type FileStorageConfig struct {
	Dir string
}

func Load() (Config, error) {
	platformTenantID, err := int64FromEnv("AIOS_PLATFORM_TENANT_ID", 1)
	if err != nil {
		return Config{}, err
	}

	return Config{
		App: AppConfig{
			Name: getenvDefault("AIOS_APP_NAME", "aios-practice-platform"),
			Env:  getenvDefault("AIOS_APP_ENV", "local"),
		},
		HTTP: HTTPConfig{
			Addr: getenvDefault("AIOS_HTTP_ADDR", ":18081"),
		},
		Database: DatabaseConfig{
			DSN: os.Getenv("AIOS_MYSQL_DSN"),
		},
		Redis: RedisConfig{
			Addr: getenvDefault("AIOS_REDIS_ADDR", "127.0.0.1:6379"),
		},
		Auth: AuthConfig{
			JWTSecret:             getenvDefault("AIOS_JWT_SECRET", "local-dev-secret"),
			AccessTokenTTLSeconds: 7200,
		},
		FileStorage: FileStorageConfig{
			Dir: getenvDefault("AIOS_FILE_STORAGE_DIR", "data/file_assets"),
		},
		PlatformTenantID: platformTenantID,
	}, nil
}

func getenvDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func int64FromEnv(key string, fallback int64) (int64, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an int64: %w", key, err)
	}
	return parsed, nil
}
