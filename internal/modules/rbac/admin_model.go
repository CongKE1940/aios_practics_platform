package rbac

import (
	"context"
	"errors"
	"time"
)

const (
	RoleStatusActive = "active"
	CodeInvalidInput = 40000
	CodeForbidden    = 40300
	CodeNotFound     = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrNotFound     = errors.New("resource not found")
)

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type Role struct {
	ID            int64     `json:"id"`
	TenantID      int64     `json:"tenant_id"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	RoleType      string    `json:"role_type"`
	DataScopeType string    `json:"data_scope_type"`
	Status        string    `json:"status"`
	Remark        string    `json:"remark,omitempty"`
	PermissionIDs []int64   `json:"permission_ids,omitempty"`
	CreatedAt     time.Time `json:"created_at,omitempty"`
	UpdatedAt     time.Time `json:"updated_at,omitempty"`
}

type Permission struct {
	ID           int64     `json:"id"`
	Code         string    `json:"code"`
	Module       string    `json:"module"`
	ActionName   string    `json:"action_name"`
	ResourceType string    `json:"resource_type,omitempty"`
	Name         string    `json:"name"`
	Description  string    `json:"description,omitempty"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
}

type RoleInput struct {
	Code          string `json:"code" binding:"required"`
	Name          string `json:"name" binding:"required"`
	RoleType      string `json:"role_type" binding:"required"`
	DataScopeType string `json:"data_scope_type" binding:"required"`
	Remark        string `json:"remark"`
}

type RolePermissionsInput struct {
	PermissionIDs []int64 `json:"permission_ids" binding:"required"`
}

type RoleListFilter struct {
	Status   string
	Page     int
	PageSize int
}

type PermissionListFilter struct {
	Module   string
	Page     int
	PageSize int
}

type AdminRepository interface {
	ListRoles(ctx context.Context, tenantID int64, filter RoleListFilter) (PageResult[Role], error)
	GetRole(ctx context.Context, tenantID int64, id int64) (Role, error)
	CreateRole(ctx context.Context, role Role) (Role, error)
	UpdateRole(ctx context.Context, role Role) (Role, error)
	ListPermissions(ctx context.Context, filter PermissionListFilter) (PageResult[Permission], error)
	AssignRolePermissions(ctx context.Context, tenantID int64, roleID int64, permissionIDs []int64) (Role, error)
}
