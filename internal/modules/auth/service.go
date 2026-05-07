package auth

import (
	"context"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials     = errors.New("invalid credentials")
	ErrUserDisabled           = errors.New("user disabled")
	ErrInvalidToken           = errors.New("invalid token")
	ErrPasswordChangeRequired = errors.New("password change required")
	ErrInvalidPassword        = errors.New("invalid password")
)

type UserRepository interface {
	FindByTenantCodeAndUsername(ctx context.Context, tenantCode string, username string) (User, error)
	ListLoginOrganizations(ctx context.Context) ([]LoginOrganization, error)
	MarkLastLogin(ctx context.Context, userID int64) error
	UpdatePassword(ctx context.Context, userID int64, passwordHash string, mustChangePassword bool) error
}

type PasswordVerifier interface {
	Verify(passwordHash string, password string) bool
	Hash(password string) (string, error)
}

type TokenIssuer interface {
	IssuePair(ctx context.Context, user User) (TokenPair, error)
	ParseToken(ctx context.Context, token string, tokenType string) (AccessClaims, error)
}

type Service struct {
	users    UserRepository
	password PasswordVerifier
	tokens   TokenIssuer
}

func NewService(users UserRepository, password PasswordVerifier, tokens TokenIssuer) *Service {
	return &Service{
		users:    users,
		password: password,
		tokens:   tokens,
	}
}

func (service *Service) Login(ctx context.Context, command LoginCommand) (LoginResult, error) {
	user, err := service.users.FindByTenantCodeAndUsername(ctx, command.TenantCode, command.Username)
	if err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}
	if user.Status != UserStatusActive {
		return LoginResult{}, ErrUserDisabled
	}
	if !service.password.Verify(user.PasswordHash, command.Password) {
		return LoginResult{}, ErrInvalidCredentials
	}
	if user.MustChangePassword {
		return LoginResult{}, ErrPasswordChangeRequired
	}

	pair, err := service.tokens.IssuePair(ctx, user)
	if err != nil {
		return LoginResult{}, err
	}
	if err := service.users.MarkLastLogin(ctx, user.ID); err != nil {
		return LoginResult{}, err
	}

	return LoginResult{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User: CurrentUser{
			ID:                 user.ID,
			TenantID:           user.TenantID,
			DisplayName:        user.DisplayName,
			AvatarURL:          user.AvatarURL,
			UserType:           user.UserType,
			MustChangePassword: user.MustChangePassword,
			Roles:              user.Roles,
			Permissions:        user.Permissions,
		},
	}, nil
}

func (service *Service) ChangeInitialPassword(ctx context.Context, command ChangeInitialPasswordCommand) error {
	if !isUsableNewPassword(command.OldPassword, command.NewPassword) {
		return ErrInvalidPassword
	}

	user, err := service.users.FindByTenantCodeAndUsername(ctx, command.TenantCode, command.Username)
	if err != nil {
		return ErrInvalidCredentials
	}
	if user.Status != UserStatusActive || !user.MustChangePassword {
		return ErrInvalidCredentials
	}
	if !service.password.Verify(user.PasswordHash, command.OldPassword) {
		return ErrInvalidCredentials
	}

	passwordHash, err := service.password.Hash(command.NewPassword)
	if err != nil {
		return err
	}
	return service.users.UpdatePassword(ctx, user.ID, passwordHash, false)
}

func (service *Service) ListLoginOrganizations(ctx context.Context) ([]LoginOrganization, error) {
	return service.users.ListLoginOrganizations(ctx)
}

func (service *Service) Refresh(ctx context.Context, command RefreshCommand) (LoginResult, error) {
	claims, err := service.tokens.ParseToken(ctx, command.RefreshToken, TokenTypeRefresh)
	if err != nil {
		return LoginResult{}, err
	}

	pair, err := service.tokens.IssuePair(ctx, userFromClaims(claims))
	if err != nil {
		return LoginResult{}, err
	}

	return LoginResult{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User:         currentUserFromClaims(claims),
	}, nil
}

func (service *Service) CurrentUser(ctx context.Context, accessToken string) (CurrentUser, error) {
	claims, err := service.tokens.ParseToken(ctx, accessToken, TokenTypeAccess)
	if err != nil {
		return CurrentUser{}, err
	}
	return currentUserFromClaims(claims), nil
}

func (service *Service) Logout(_ context.Context, _ string) error {
	return nil
}

type BcryptPasswordVerifier struct{}

func (BcryptPasswordVerifier) Verify(passwordHash string, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)) == nil
}

func (BcryptPasswordVerifier) Hash(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func isUsableNewPassword(oldPassword string, newPassword string) bool {
	normalized := strings.TrimSpace(newPassword)
	return len([]rune(normalized)) >= 8 && newPassword != oldPassword
}

func currentUserFromClaims(claims AccessClaims) CurrentUser {
	return CurrentUser{
		ID:                 claims.UserID,
		TenantID:           claims.TenantID,
		DisplayName:        claims.DisplayName,
		AvatarURL:          claims.AvatarURL,
		UserType:           claims.UserType,
		MustChangePassword: claims.MustChangePassword,
		Roles:              claims.Roles,
		Permissions:        claims.Permissions,
	}
}

func userFromClaims(claims AccessClaims) User {
	return User{
		ID:                 claims.UserID,
		TenantID:           claims.TenantID,
		Username:           claims.Username,
		DisplayName:        claims.DisplayName,
		AvatarURL:          claims.AvatarURL,
		UserType:           claims.UserType,
		MustChangePassword: claims.MustChangePassword,
		Roles:              claims.Roles,
		Permissions:        claims.Permissions,
		Status:             UserStatusActive,
	}
}
