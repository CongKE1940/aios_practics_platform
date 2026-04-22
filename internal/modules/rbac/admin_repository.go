package rbac

import (
	"context"
	"database/sql"
)

type MySQLAdminRepository struct {
	db *sql.DB
}

func NewMySQLAdminRepository(db *sql.DB) *MySQLAdminRepository {
	return &MySQLAdminRepository{db: db}
}

func (repo *MySQLAdminRepository) ListRoles(ctx context.Context, tenantID int64, filter RoleListFilter) (PageResult[Role], error) {
	query := `
SELECT id, tenant_id, code, name, role_type, data_scope_type, status, remark, created_at, updated_at
FROM roles
WHERE tenant_id = ?
`
	args := []any{tenantID}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Role]{}, err
	}
	defer rows.Close()

	items := make([]Role, 0)
	for rows.Next() {
		role, err := scanRole(rows)
		if err != nil {
			return PageResult[Role]{}, err
		}
		role.PermissionIDs, err = repo.listRolePermissionIDs(ctx, role.ID)
		if err != nil {
			return PageResult[Role]{}, err
		}
		items = append(items, role)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Role]{}, err
	}
	return paginateRoles(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLAdminRepository) GetRole(ctx context.Context, tenantID int64, id int64) (Role, error) {
	const query = `
SELECT id, tenant_id, code, name, role_type, data_scope_type, status, remark, created_at, updated_at
FROM roles
WHERE id = ? AND tenant_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, tenantID)
	role, err := scanRoleScanner(row)
	if err != nil {
		return Role{}, wrapRBACNotFound(err)
	}
	role.PermissionIDs, err = repo.listRolePermissionIDs(ctx, role.ID)
	if err != nil {
		return Role{}, err
	}
	return role, nil
}

func (repo *MySQLAdminRepository) CreateRole(ctx context.Context, role Role) (Role, error) {
	const query = `
INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark)
VALUES (?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.db.ExecContext(ctx, query, role.TenantID, role.Code, role.Name, role.RoleType, role.DataScopeType, role.Status, nullString(role.Remark))
	if err != nil {
		return Role{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Role{}, err
	}
	return repo.GetRole(ctx, role.TenantID, id)
}

func (repo *MySQLAdminRepository) UpdateRole(ctx context.Context, role Role) (Role, error) {
	const query = `
UPDATE roles
SET code = ?, name = ?, role_type = ?, data_scope_type = ?, status = ?, remark = ?
WHERE id = ? AND tenant_id = ?
`
	if err := repo.execAffectingOne(ctx, query, role.Code, role.Name, role.RoleType, role.DataScopeType, role.Status, nullString(role.Remark), role.ID, role.TenantID); err != nil {
		return Role{}, err
	}
	return repo.GetRole(ctx, role.TenantID, role.ID)
}

func (repo *MySQLAdminRepository) ListPermissions(ctx context.Context, filter PermissionListFilter) (PageResult[Permission], error) {
	query := `
SELECT id, code, module, action_name, resource_type, name, description, created_at
FROM permissions
WHERE 1 = 1
`
	args := make([]any, 0)
	if filter.Module != "" {
		query += " AND module = ?"
		args = append(args, filter.Module)
	}
	query += " ORDER BY id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Permission]{}, err
	}
	defer rows.Close()

	items := make([]Permission, 0)
	for rows.Next() {
		permission, err := scanPermission(rows)
		if err != nil {
			return PageResult[Permission]{}, err
		}
		items = append(items, permission)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Permission]{}, err
	}
	return paginateRoles(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLAdminRepository) AssignRolePermissions(ctx context.Context, tenantID int64, roleID int64, permissionIDs []int64) (Role, error) {
	if _, err := repo.GetRole(ctx, tenantID, roleID); err != nil {
		return Role{}, err
	}
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return Role{}, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM role_permissions WHERE role_id = ?", roleID); err != nil {
		return Role{}, err
	}
	for _, permissionID := range permissionIDs {
		if _, err := tx.ExecContext(ctx, "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", roleID, permissionID); err != nil {
			return Role{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Role{}, err
	}
	return repo.GetRole(ctx, tenantID, roleID)
}

func (repo *MySQLAdminRepository) listRolePermissionIDs(ctx context.Context, roleID int64) ([]int64, error) {
	rows, err := repo.db.QueryContext(ctx, "SELECT permission_id FROM role_permissions WHERE role_id = ? ORDER BY permission_id", roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]int64, 0)
	for rows.Next() {
		var permissionID int64
		if err := rows.Scan(&permissionID); err != nil {
			return nil, err
		}
		items = append(items, permissionID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLAdminRepository) execAffectingOne(ctx context.Context, query string, args ...any) error {
	result, err := repo.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func scanRole(rows *sql.Rows) (Role, error) {
	return scanRoleScanner(rows)
}

func scanRoleScanner(scanner interface{ Scan(dest ...any) error }) (Role, error) {
	var role Role
	var remark sql.NullString
	err := scanner.Scan(&role.ID, &role.TenantID, &role.Code, &role.Name, &role.RoleType, &role.DataScopeType, &role.Status, &remark, &role.CreatedAt, &role.UpdatedAt)
	if err != nil {
		return Role{}, err
	}
	if remark.Valid {
		role.Remark = remark.String
	}
	return role, nil
}

func scanPermission(rows *sql.Rows) (Permission, error) {
	var permission Permission
	var resourceType sql.NullString
	var description sql.NullString
	err := rows.Scan(&permission.ID, &permission.Code, &permission.Module, &permission.ActionName, &resourceType, &permission.Name, &description, &permission.CreatedAt)
	if err != nil {
		return Permission{}, err
	}
	if resourceType.Valid {
		permission.ResourceType = resourceType.String
	}
	if description.Valid {
		permission.Description = description.String
	}
	return permission, nil
}

func paginateRoles[T any](items []T, page int, pageSize int) PageResult[T] {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	start := (page - 1) * pageSize
	if start > len(items) {
		start = len(items)
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return PageResult[T]{
		Items:    items[start:end],
		Page:     page,
		PageSize: pageSize,
		Total:    len(items),
	}
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func wrapRBACNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}
