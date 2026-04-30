package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func TestServiceLoginReturnsTokenPairAndUserContext(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword() error = %v", err)
	}

	repo := &fakeUserRepository{
		user: User{
			ID:           7,
			TenantID:     1,
			Username:     "admin",
			PasswordHash: string(hash),
			DisplayName:  "系统管理员",
			UserType:     "sys_admin",
			Status:       UserStatusActive,
			Roles:        []string{"sys_admin"},
			Permissions:  []string{"tenant:manage", "user:manage"},
		},
	}
	issuer := &fakeTokenIssuer{
		pair: TokenPair{
			AccessToken:  "access_token",
			RefreshToken: "refresh_token",
			ExpiresIn:    int64((2 * time.Hour).Seconds()),
		},
	}
	service := NewService(repo, BcryptPasswordVerifier{}, issuer)

	result, err := service.Login(context.Background(), LoginCommand{
		TenantCode: "platform",
		Username:   "admin",
		Password:   "secret123",
	})
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}

	if result.AccessToken != "access_token" {
		t.Fatalf("AccessToken = %q", result.AccessToken)
	}
	if result.RefreshToken != "refresh_token" {
		t.Fatalf("RefreshToken = %q", result.RefreshToken)
	}
	if result.ExpiresIn != 7200 {
		t.Fatalf("ExpiresIn = %d", result.ExpiresIn)
	}
	if result.User.ID != 7 || result.User.TenantID != 1 {
		t.Fatalf("User = %+v", result.User)
	}
	if result.User.Roles[0] != "sys_admin" {
		t.Fatalf("User.Roles = %+v", result.User.Roles)
	}
	if repo.lastLoginUserID != 7 {
		t.Fatalf("lastLoginUserID = %d", repo.lastLoginUserID)
	}
	if repo.lastTenantCode != "platform" {
		t.Fatalf("lastTenantCode = %q", repo.lastTenantCode)
	}
}

func TestServiceListLoginOrganizationsReturnsRepositoryResults(t *testing.T) {
	repo := &fakeUserRepository{
		loginOrganizations: []LoginOrganization{
			{TenantID: 1, TenantCode: "platform", TenantName: "平台管理", TenantType: "platform", IsDefault: true},
			{TenantID: 2, TenantCode: "demo_school", TenantName: "演示学校", TenantType: "school"},
		},
	}
	service := NewService(repo, BcryptPasswordVerifier{}, &fakeTokenIssuer{})

	items, err := service.ListLoginOrganizations(context.Background())
	if err != nil {
		t.Fatalf("ListLoginOrganizations() error = %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("len(items) = %d", len(items))
	}
	if items[0].TenantCode != "platform" || !items[0].IsDefault {
		t.Fatalf("items[0] = %+v", items[0])
	}
}

func TestServiceLoginRejectsWrongPassword(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword() error = %v", err)
	}

	service := NewService(&fakeUserRepository{
		user: User{
			ID:           8,
			TenantID:     1,
			Username:     "admin",
			PasswordHash: string(hash),
			DisplayName:  "系统管理员",
			UserType:     "sys_admin",
			Status:       UserStatusActive,
		},
	}, BcryptPasswordVerifier{}, &fakeTokenIssuer{})

	_, err = service.Login(context.Background(), LoginCommand{
		TenantCode: "platform",
		Username:   "admin",
		Password:   "wrong-password",
	})
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("Login() error = %v, want ErrInvalidCredentials", err)
	}
}

func TestServiceRefreshReissuesTokenPairFromRefreshToken(t *testing.T) {
	tokens := &fakeTokenIssuer{
		claims: AccessClaims{
			UserID:      7,
			TenantID:    1,
			Username:    "admin",
			DisplayName: "系统管理员",
			UserType:    "sys_admin",
			Roles:       []string{"sys_admin"},
			Permissions: []string{"tenant:manage"},
			TokenType:   TokenTypeRefresh,
		},
		pair: TokenPair{
			AccessToken:  "new_access_token",
			RefreshToken: "new_refresh_token",
			ExpiresIn:    7200,
		},
	}
	service := NewService(nil, BcryptPasswordVerifier{}, tokens)

	result, err := service.Refresh(context.Background(), RefreshCommand{RefreshToken: "refresh_token"})
	if err != nil {
		t.Fatalf("Refresh() error = %v", err)
	}

	if result.AccessToken != "new_access_token" {
		t.Fatalf("AccessToken = %q", result.AccessToken)
	}
	if result.User.TenantID != 1 || result.User.Roles[0] != "sys_admin" {
		t.Fatalf("User = %+v", result.User)
	}
	if result.User.DisplayName != "系统管理员" {
		t.Fatalf("DisplayName = %q", result.User.DisplayName)
	}
	if result.User.Permissions[0] != "tenant:manage" {
		t.Fatalf("Permissions = %+v", result.User.Permissions)
	}
	if tokens.lastTokenType != TokenTypeRefresh {
		t.Fatalf("lastTokenType = %q", tokens.lastTokenType)
	}
}

func TestServiceCurrentUserUsesAccessTokenClaims(t *testing.T) {
	service := NewService(nil, BcryptPasswordVerifier{}, &fakeTokenIssuer{
		claims: AccessClaims{
			UserID:      7,
			TenantID:    1,
			Username:    "admin",
			DisplayName: "系统管理员",
			UserType:    "sys_admin",
			Roles:       []string{"sys_admin"},
			Permissions: []string{"tenant:manage"},
			TokenType:   TokenTypeAccess,
		},
	})

	user, err := service.CurrentUser(context.Background(), "access_token")
	if err != nil {
		t.Fatalf("CurrentUser() error = %v", err)
	}

	if user.ID != 7 || user.TenantID != 1 {
		t.Fatalf("user = %+v", user)
	}
	if user.DisplayName != "系统管理员" {
		t.Fatalf("DisplayName = %q", user.DisplayName)
	}
	if user.Permissions[0] != "tenant:manage" {
		t.Fatalf("Permissions = %+v", user.Permissions)
	}
}

type fakeUserRepository struct {
	user               User
	err                error
	lastLoginUserID    int64
	lastTenantCode     string
	loginOrganizations []LoginOrganization
}

func (repo *fakeUserRepository) FindByTenantCodeAndUsername(_ context.Context, tenantCode string, username string) (User, error) {
	if repo.err != nil {
		return User{}, repo.err
	}
	repo.lastTenantCode = tenantCode
	if repo.user.Username != username {
		return User{}, ErrInvalidCredentials
	}
	return repo.user, nil
}

func (repo *fakeUserRepository) ListLoginOrganizations(_ context.Context) ([]LoginOrganization, error) {
	if repo.err != nil {
		return nil, repo.err
	}
	return repo.loginOrganizations, nil
}

func (repo *fakeUserRepository) MarkLastLogin(_ context.Context, userID int64) error {
	repo.lastLoginUserID = userID
	return nil
}

type fakeTokenIssuer struct {
	pair          TokenPair
	claims        AccessClaims
	err           error
	lastTokenType string
}

func (issuer *fakeTokenIssuer) IssuePair(_ context.Context, user User) (TokenPair, error) {
	if issuer.err != nil {
		return TokenPair{}, issuer.err
	}
	if user.ID == 0 {
		return TokenPair{}, errors.New("missing user")
	}
	return issuer.pair, nil
}

func (issuer *fakeTokenIssuer) ParseToken(_ context.Context, token string, tokenType string) (AccessClaims, error) {
	issuer.lastTokenType = tokenType
	if issuer.err != nil {
		return AccessClaims{}, issuer.err
	}
	if token == "" {
		return AccessClaims{}, ErrInvalidToken
	}
	return issuer.claims, nil
}
