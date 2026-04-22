package rbac

import "context"

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
	return service.repo.CreateRole(ctx, Role{
		TenantID:      tenantID,
		Code:          input.Code,
		Name:          input.Name,
		RoleType:      input.RoleType,
		DataScopeType: input.DataScopeType,
		Status:        RoleStatusActive,
		Remark:        input.Remark,
	})
}

func (service *AdminService) UpdateRole(ctx context.Context, tenantID int64, id int64, input RoleInput) (Role, error) {
	current, err := service.repo.GetRole(ctx, tenantID, id)
	if err != nil {
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
	return service.repo.AssignRolePermissions(ctx, tenantID, roleID, input.PermissionIDs)
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
