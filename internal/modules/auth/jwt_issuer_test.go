package auth

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestJWTIssuerIssuePairContainsTenantAndRoles(t *testing.T) {
	issuer := NewJWTIssuer(JWTConfig{
		Secret:           "dev-secret",
		AccessTokenTTL:   2 * time.Hour,
		RefreshTokenTTL:  7 * 24 * time.Hour,
		SigningAlgorithm: "HS256",
	})

	pair, err := issuer.IssuePair(context.Background(), User{
		ID:          7,
		TenantID:    1,
		Username:    "admin",
		DisplayName: "系统管理员",
		UserType:    "sys_admin",
		Roles:       []string{"sys_admin"},
		Permissions: []string{"tenant:manage"},
	})
	if err != nil {
		t.Fatalf("IssuePair() error = %v", err)
	}

	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatalf("token pair = %+v", pair)
	}
	if pair.ExpiresIn != 7200 {
		t.Fatalf("ExpiresIn = %d", pair.ExpiresIn)
	}

	token, err := jwt.ParseWithClaims(pair.AccessToken, &AccessClaims{}, func(_ *jwt.Token) (any, error) {
		return []byte("dev-secret"), nil
	})
	if err != nil {
		t.Fatalf("ParseWithClaims() error = %v", err)
	}
	if !token.Valid {
		t.Fatal("token.Valid = false")
	}

	claims := token.Claims.(*AccessClaims)
	if claims.UserID != 7 || claims.TenantID != 1 {
		t.Fatalf("claims = %+v", claims)
	}
	if claims.DisplayName != "系统管理员" {
		t.Fatalf("DisplayName = %q", claims.DisplayName)
	}
	if claims.Roles[0] != "sys_admin" {
		t.Fatalf("claims.Roles = %+v", claims.Roles)
	}
	if claims.TokenType != "access" {
		t.Fatalf("TokenType = %q", claims.TokenType)
	}
}

func TestJWTIssuerParseTokenRejectsWrongTokenType(t *testing.T) {
	issuer := NewJWTIssuer(JWTConfig{
		Secret:           "dev-secret",
		AccessTokenTTL:   2 * time.Hour,
		RefreshTokenTTL:  7 * 24 * time.Hour,
		SigningAlgorithm: "HS256",
	})

	pair, err := issuer.IssuePair(context.Background(), User{
		ID:          7,
		TenantID:    1,
		Username:    "admin",
		DisplayName: "系统管理员",
		UserType:    "sys_admin",
		Roles:       []string{"sys_admin"},
		Permissions: []string{"tenant:manage"},
	})
	if err != nil {
		t.Fatalf("IssuePair() error = %v", err)
	}

	if _, err := issuer.ParseToken(context.Background(), pair.RefreshToken, TokenTypeAccess); err != ErrInvalidToken {
		t.Fatalf("ParseToken() error = %v, want ErrInvalidToken", err)
	}

	claims, err := issuer.ParseToken(context.Background(), pair.RefreshToken, TokenTypeRefresh)
	if err != nil {
		t.Fatalf("ParseToken(refresh) error = %v", err)
	}
	if claims.UserID != 7 || claims.TokenType != TokenTypeRefresh {
		t.Fatalf("claims = %+v", claims)
	}
	if claims.DisplayName != "系统管理员" || claims.Permissions[0] != "tenant:manage" {
		t.Fatalf("claims = %+v", claims)
	}
}
