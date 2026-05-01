package rbac

import (
	"context"
	"strings"
)

type AdminService struct {
	repo AdminRepository
}

func NewAdminService(repo AdminRepository) *AdminService {
	return &AdminService{repo: repo}
}

func (service *AdminService) ListRoles(ctx context.Context, tenantID int64, filter RoleListFilter) (PageResult[Role], error) {
	return service.repo.ListRoles(ctx, tenantID, normalizeRoleFilter(filter))
}

func (service *AdminService) CreateRole(ctx context.Context, tenantID int64, input RoleInput) (Role, error) {
	return service.CreateRoleWithScope(ctx, Scope{TenantID: tenantID, UserType: "sys_admin"}, input)
}

func (service *AdminService) CreateRoleWithScope(ctx context.Context, scope Scope, input RoleInput) (Role, error) {
	if err := ensureRoleInputAllowed(scope, input); err != nil {
		return Role{}, err
	}
	return service.repo.CreateRole(ctx, Role{
		TenantID:      scope.TenantID,
		Code:          input.Code,
		Name:          input.Name,
		RoleType:      input.RoleType,
		DataScopeType: input.DataScopeType,
		Status:        RoleStatusActive,
		Remark:        input.Remark,
	})
}

func (service *AdminService) UpdateRole(ctx context.Context, tenantID int64, id int64, input RoleInput) (Role, error) {
	return service.UpdateRoleWithScope(ctx, Scope{TenantID: tenantID, UserType: "sys_admin"}, id, input)
}

func (service *AdminService) UpdateRoleWithScope(ctx context.Context, scope Scope, id int64, input RoleInput) (Role, error) {
	tenantID := rbacLookupTenantID(scope)
	current, err := service.repo.GetRole(ctx, tenantID, id)
	if err != nil {
		return Role{}, err
	}
	if !canMutateRole(scope, current) {
		return Role{}, ErrForbidden
	}
	if err := ensureRoleInputAllowed(scope, input); err != nil {
		return Role{}, err
	}
	current.Code = input.Code
	current.Name = input.Name
	current.RoleType = input.RoleType
	current.DataScopeType = input.DataScopeType
	current.Remark = input.Remark
	return service.repo.UpdateRole(ctx, current)
}

func (service *AdminService) ListPermissions(ctx context.Context, filter PermissionListFilter) (PageResult[Permission], error) {
	return service.repo.ListPermissions(ctx, normalizePermissionFilter(filter))
}

func (service *AdminService) AssignRolePermissions(ctx context.Context, tenantID int64, roleID int64, input RolePermissionsInput) (Role, error) {
	return service.AssignRolePermissionsWithScope(ctx, Scope{TenantID: tenantID, UserType: "sys_admin"}, roleID, input)
}

func (service *AdminService) AssignRolePermissionsWithScope(ctx context.Context, scope Scope, roleID int64, input RolePermissionsInput) (Role, error) {
	tenantID := rbacLookupTenantID(scope)
	role, err := service.repo.GetRole(ctx, tenantID, roleID)
	if err != nil {
		return Role{}, err
	}
	if !canMutateRole(scope, role) {
		return Role{}, ErrForbidden
	}
	if !isSystemRBACManager(scope) {
		if err := service.ensureAssignablePermissions(ctx, scope, input.PermissionIDs); err != nil {
			return Role{}, err
		}
	}
	return service.repo.AssignRolePermissions(ctx, role.TenantID, roleID, input.PermissionIDs)
}

func (service *AdminService) ensureAssignablePermissions(ctx context.Context, scope Scope, permissionIDs []int64) error {
	if len(permissionIDs) == 0 {
		return nil
	}
	permissions, err := service.repo.ListPermissions(ctx, PermissionListFilter{Page: 1, PageSize: 1000})
	if err != nil {
		return err
	}
	permissionByID := make(map[int64]Permission, len(permissions.Items))
	for _, permission := range permissions.Items {
		permissionByID[permission.ID] = permission
	}
	scopePermissionSet := make(map[string]struct{}, len(scope.Permissions))
	for _, permissionCode := range scope.Permissions {
		scopePermissionSet[strings.TrimSpace(permissionCode)] = struct{}{}
	}
	for _, permissionID := range permissionIDs {
		permission, ok := permissionByID[permissionID]
		if !ok {
			return ErrInvalidInput
		}
		if isPermissionManagementPermission(permission) {
			return ErrForbidden
		}
		if _, ok := scopePermissionSet[permission.Code]; !ok {
			return ErrForbidden
		}
	}
	return nil
}

func normalizeRoleFilter(filter RoleListFilter) RoleListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizePermissionFilter(filter PermissionListFilter) PermissionListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func ensureRoleInputAllowed(scope Scope, input RoleInput) error {
	if isSystemRBACManager(scope) {
		return nil
	}
	if isPrivilegedRoleCode(input.Code) || input.RoleType != "custom" {
		return ErrForbidden
	}
	return nil
}

func canMutateRole(scope Scope, role Role) bool {
	return isSystemRBACManager(scope) || !isPrivilegedRoleCode(role.Code)
}

func rbacLookupTenantID(scope Scope) int64 {
	if isSystemRBACManager(scope) {
		return 0
	}
	return scope.TenantID
}

func isSystemRBACManager(scope Scope) bool {
	if scope.UserType == "sys_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" {
			return true
		}
	}
	return false
}

func isPrivilegedRoleCode(code string) bool {
	switch code {
	case "sys_admin", "school_admin", "tenant_admin":
		return true
	default:
		return false
	}
}

func isPermissionManagementPermission(permission Permission) bool {
	switch strings.TrimSpace(permission.Code) {
	case "system:manage", "tenant:manage", "role:manage":
		return true
	}
	switch strings.TrimSpace(permission.Module) {
	case "role", "permission", "menu":
		return true
	default:
		return false
	}
}

func normalizePage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizePageSize(pageSize int) int {
	if pageSize <= 0 {
		return 20
	}
	return pageSize
}
