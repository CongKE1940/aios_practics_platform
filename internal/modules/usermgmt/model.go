package usermgmt

import (
	"context"
	"errors"
	"time"
)

const (
	UserStatusActive   = "active"
	UserStatusDisabled = "disabled"
	CodeInvalidInput   = 40000
	CodeForbidden      = 40300
	CodeNotFound       = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
	ErrNotFound     = errors.New("resource not found")
)

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type User struct {
	ID                 int64     `json:"id"`
	TenantID           int64     `json:"tenant_id"`
	Username           string    `json:"username"`
	Phone              string    `json:"phone,omitempty"`
	Email              string    `json:"email,omitempty"`
	AvatarURL          string    `json:"avatar_url,omitempty"`
	PasswordHash       string    `json:"-"`
	DisplayName        string    `json:"display_name"`
	UserType           string    `json:"user_type"`
	Status             string    `json:"status"`
	MustChangePassword bool      `json:"must_change_password"`
	InitialPassword    string    `json:"initial_password,omitempty"`
	RoleIDs            []int64   `json:"role_ids,omitempty"`
	CreatedAt          time.Time `json:"created_at,omitempty"`
	UpdatedAt          time.Time `json:"updated_at,omitempty"`
}

type RoleSummary struct {
	ID              int64    `json:"id"`
	TenantID        int64    `json:"tenant_id"`
	Code            string   `json:"code"`
	Name            string   `json:"name"`
	Status          string   `json:"status"`
	PermissionCodes []string `json:"-"`
}

type Scope struct {
	TenantID    int64
	UserType    string
	Permissions []string
}

type UserInput struct {
	Username    string  `json:"username" binding:"required"`
	DisplayName string  `json:"display_name" binding:"required"`
	UserType    string  `json:"user_type" binding:"required"`
	Phone       string  `json:"phone"`
	Email       string  `json:"email"`
	AvatarURL   string  `json:"avatar_url"`
	Password    string  `json:"password"`
	RoleIDs     []int64 `json:"role_ids"`
}

type UserRolesInput struct {
	RoleIDs []int64 `json:"role_ids" binding:"required"`
}

type ResetPasswordInput struct {
	NewPassword string `json:"new_password"`
}

type ProfileInput struct {
	DisplayName string `json:"display_name" binding:"required"`
	Phone       string `json:"phone"`
	Email       string `json:"email"`
	AvatarURL   string `json:"avatar_url"`
}

type ChangePasswordInput struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

type UserListFilter struct {
	UserType string
	Keyword  string
	Page     int
	PageSize int
}

type Repository interface {
	ListUsers(ctx context.Context, tenantID int64, filter UserListFilter) (PageResult[User], error)
	GetUser(ctx context.Context, tenantID int64, id int64) (User, error)
	CreateUser(ctx context.Context, user User, passwordHash string) (User, error)
	UpdateUser(ctx context.Context, user User) (User, error)
	UpdateProfile(ctx context.Context, user User) (User, error)
	AssignRoles(ctx context.Context, tenantID int64, userID int64, roleIDs []int64) (User, error)
	DisableUser(ctx context.Context, tenantID int64, userID int64) (User, error)
	ResetPassword(ctx context.Context, tenantID int64, userID int64, passwordHash string, mustChangePassword bool) (User, error)
	ListRoles(ctx context.Context, tenantID int64) ([]RoleSummary, error)
}

type PasswordHasher interface {
	Hash(password string) (string, error)
	Verify(passwordHash string, password string) bool
}
