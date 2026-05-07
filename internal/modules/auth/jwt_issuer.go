package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type JWTConfig struct {
	Secret           string
	AccessTokenTTL   time.Duration
	RefreshTokenTTL  time.Duration
	SigningAlgorithm string
}

type AccessClaims struct {
	UserID             int64    `json:"user_id"`
	TenantID           int64    `json:"tenant_id"`
	Username           string   `json:"username"`
	DisplayName        string   `json:"display_name"`
	AvatarURL          string   `json:"avatar_url,omitempty"`
	UserType           string   `json:"user_type"`
	MustChangePassword bool     `json:"must_change_password"`
	Roles              []string `json:"roles"`
	Permissions        []string `json:"permissions,omitempty"`
	TokenType          string   `json:"token_type"`
	jwt.RegisteredClaims
}

type JWTIssuer struct {
	config JWTConfig
}

func NewJWTIssuer(config JWTConfig) *JWTIssuer {
	if config.AccessTokenTTL == 0 {
		config.AccessTokenTTL = 2 * time.Hour
	}
	if config.RefreshTokenTTL == 0 {
		config.RefreshTokenTTL = 7 * 24 * time.Hour
	}
	if config.SigningAlgorithm == "" {
		config.SigningAlgorithm = "HS256"
	}
	return &JWTIssuer{config: config}
}

func (issuer *JWTIssuer) IssuePair(_ context.Context, user User) (TokenPair, error) {
	if issuer.config.Secret == "" {
		return TokenPair{}, errors.New("jwt secret is required")
	}

	now := time.Now()
	accessExpiresAt := now.Add(issuer.config.AccessTokenTTL)
	refreshExpiresAt := now.Add(issuer.config.RefreshTokenTTL)

	accessToken, err := issuer.sign(AccessClaims{
		UserID:             user.ID,
		TenantID:           user.TenantID,
		Username:           user.Username,
		DisplayName:        user.DisplayName,
		AvatarURL:          user.AvatarURL,
		UserType:           user.UserType,
		MustChangePassword: user.MustChangePassword,
		Roles:              user.Roles,
		Permissions:        user.Permissions,
		TokenType:          TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.Username,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(accessExpiresAt),
		},
	})
	if err != nil {
		return TokenPair{}, err
	}

	refreshToken, err := issuer.sign(AccessClaims{
		UserID:             user.ID,
		TenantID:           user.TenantID,
		Username:           user.Username,
		DisplayName:        user.DisplayName,
		AvatarURL:          user.AvatarURL,
		UserType:           user.UserType,
		MustChangePassword: user.MustChangePassword,
		Roles:              user.Roles,
		Permissions:        user.Permissions,
		TokenType:          TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.Username,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(refreshExpiresAt),
		},
	})
	if err != nil {
		return TokenPair{}, err
	}

	return TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(issuer.config.AccessTokenTTL.Seconds()),
	}, nil
}

func (issuer *JWTIssuer) sign(claims AccessClaims) (string, error) {
	method := jwt.GetSigningMethod(issuer.config.SigningAlgorithm)
	if method == nil {
		return "", errors.New("unsupported jwt signing algorithm")
	}

	token := jwt.NewWithClaims(method, claims)
	return token.SignedString([]byte(issuer.config.Secret))
}

func (issuer *JWTIssuer) ParseToken(_ context.Context, token string, tokenType string) (AccessClaims, error) {
	if token == "" {
		return AccessClaims{}, ErrInvalidToken
	}

	claims := &AccessClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if t.Method == nil || t.Method.Alg() != issuer.config.SigningAlgorithm {
			return nil, ErrInvalidToken
		}
		return []byte(issuer.config.Secret), nil
	})
	if err != nil || !parsed.Valid {
		return AccessClaims{}, ErrInvalidToken
	}
	if claims.TokenType != tokenType {
		return AccessClaims{}, ErrInvalidToken
	}
	return *claims, nil
}
