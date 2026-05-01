package usermgmt

import (
	"context"
	"database/sql"
	"strings"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListUsers(ctx context.Context, tenantID int64, filter UserListFilter) (PageResult[User], error) {
	query := `
SELECT id, tenant_id, username, phone, email, password_hash, display_name, user_type, status, must_change_password, created_at, updated_at
FROM users
WHERE deleted_at IS NULL
`
	args := make([]any, 0, 5)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.UserType != "" {
		query += " AND user_type = ?"
		args = append(args, filter.UserType)
	}
	if filter.Keyword != "" {
		query += " AND (username LIKE ? OR display_name LIKE ? OR phone LIKE ? OR email LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword, keyword, keyword)
	}
	query += " ORDER BY id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[User]{}, err
	}
	defer rows.Close()

	items := make([]User, 0)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return PageResult[User]{}, err
		}
		user.RoleIDs, err = repo.listUserRoleIDs(ctx, user.TenantID, user.ID)
		if err != nil {
			return PageResult[User]{}, err
		}
		items = append(items, user)
	}
	if err := rows.Err(); err != nil {
		return PageResult[User]{}, err
	}
	return paginateUsers(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetUser(ctx context.Context, tenantID int64, id int64) (User, error) {
	query := `
SELECT id, tenant_id, username, phone, email, password_hash, display_name, user_type, status, must_change_password, created_at, updated_at
FROM users
`
	args := []any{id}
	query += "WHERE id = ? AND deleted_at IS NULL"
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	user, err := scanUserScanner(row)
	if err != nil {
		return User{}, wrapUserNotFound(err)
	}
	user.RoleIDs, err = repo.listUserRoleIDs(ctx, user.TenantID, user.ID)
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (repo *MySQLRepository) CreateUser(ctx context.Context, user User, passwordHash string) (User, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(
		ctx,
		`INSERT INTO users (tenant_id, username, phone, email, password_hash, display_name, user_type, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		user.TenantID,
		user.Username,
		nullString(user.Phone),
		nullString(user.Email),
		passwordHash,
		user.DisplayName,
		user.UserType,
		user.Status,
		user.MustChangePassword,
	)
	if err != nil {
		return User{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return User{}, err
	}
	if err := repo.syncUserRoles(ctx, tx, user.TenantID, id, user.RoleIDs); err != nil {
		return User{}, err
	}
	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return repo.GetUser(ctx, user.TenantID, id)
}

func (repo *MySQLRepository) UpdateUser(ctx context.Context, user User) (User, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(
		ctx,
		`UPDATE users SET username = ?, phone = ?, email = ?, display_name = ?, user_type = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
		user.Username,
		nullString(user.Phone),
		nullString(user.Email),
		user.DisplayName,
		user.UserType,
		user.ID,
		user.TenantID,
	)
	if err != nil {
		return User{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return User{}, err
	}
	if rowsAffected == 0 {
		return User{}, ErrNotFound
	}
	if err := repo.syncUserRoles(ctx, tx, user.TenantID, user.ID, user.RoleIDs); err != nil {
		return User{}, err
	}
	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return repo.GetUser(ctx, user.TenantID, user.ID)
}

func (repo *MySQLRepository) UpdateProfile(ctx context.Context, user User) (User, error) {
	if err := repo.execAffectingOne(
		ctx,
		`UPDATE users SET phone = ?, email = ?, display_name = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
		nullString(user.Phone),
		nullString(user.Email),
		user.DisplayName,
		user.ID,
		user.TenantID,
	); err != nil {
		return User{}, err
	}
	return repo.GetUser(ctx, user.TenantID, user.ID)
}

func (repo *MySQLRepository) AssignRoles(ctx context.Context, tenantID int64, userID int64, roleIDs []int64) (User, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	if err := repo.ensureUserExists(ctx, tx, tenantID, userID); err != nil {
		return User{}, err
	}
	if err := repo.syncUserRoles(ctx, tx, tenantID, userID, roleIDs); err != nil {
		return User{}, err
	}
	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return repo.GetUser(ctx, tenantID, userID)
}

func (repo *MySQLRepository) DisableUser(ctx context.Context, tenantID int64, userID int64) (User, error) {
	if err := repo.execAffectingOne(ctx, "UPDATE users SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", UserStatusDisabled, userID, tenantID); err != nil {
		return User{}, err
	}
	return repo.GetUser(ctx, tenantID, userID)
}

func (repo *MySQLRepository) ResetPassword(ctx context.Context, tenantID int64, userID int64, passwordHash string, mustChangePassword bool) (User, error) {
	if err := repo.execAffectingOne(ctx, "UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", passwordHash, mustChangePassword, userID, tenantID); err != nil {
		return User{}, err
	}
	return repo.GetUser(ctx, tenantID, userID)
}

func (repo *MySQLRepository) ListRoles(ctx context.Context, tenantID int64) ([]RoleSummary, error) {
	query := `
SELECT r.id, r.tenant_id, r.code, r.name, r.status, COALESCE(GROUP_CONCAT(DISTINCT p.code ORDER BY p.code SEPARATOR ','), '')
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE r.status = 'active'
`
	args := make([]any, 0, 1)
	if tenantID > 0 {
		query += " AND r.tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " GROUP BY r.id, r.tenant_id, r.code, r.name, r.status ORDER BY r.id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]RoleSummary, 0)
	for rows.Next() {
		var role RoleSummary
		var permissionCodes string
		if err := rows.Scan(&role.ID, &role.TenantID, &role.Code, &role.Name, &role.Status, &permissionCodes); err != nil {
			return nil, err
		}
		if permissionCodes != "" {
			role.PermissionCodes = strings.Split(permissionCodes, ",")
		}
		items = append(items, role)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) ensureUserExists(ctx context.Context, tx *sql.Tx, tenantID int64, userID int64) error {
	var id int64
	err := tx.QueryRowContext(ctx, "SELECT id FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", userID, tenantID).Scan(&id)
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}

func (repo *MySQLRepository) syncUserRoles(ctx context.Context, tx *sql.Tx, tenantID int64, userID int64, roleIDs []int64) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM user_roles WHERE tenant_id = ? AND user_id = ?", tenantID, userID); err != nil {
		return err
	}
	for _, roleID := range roleIDs {
		if _, err := tx.ExecContext(ctx, "INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES (?, ?, ?)", tenantID, userID, roleID); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) listUserRoleIDs(ctx context.Context, tenantID int64, userID int64) ([]int64, error) {
	rows, err := repo.db.QueryContext(ctx, "SELECT role_id FROM user_roles WHERE tenant_id = ? AND user_id = ? ORDER BY role_id", tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]int64, 0)
	for rows.Next() {
		var roleID int64
		if err := rows.Scan(&roleID); err != nil {
			return nil, err
		}
		items = append(items, roleID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) execAffectingOne(ctx context.Context, query string, args ...any) error {
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

func scanUser(rows *sql.Rows) (User, error) {
	return scanUserScanner(rows)
}

func scanUserScanner(scanner interface{ Scan(dest ...any) error }) (User, error) {
	var user User
	var phone sql.NullString
	var email sql.NullString
	err := scanner.Scan(&user.ID, &user.TenantID, &user.Username, &phone, &email, &user.PasswordHash, &user.DisplayName, &user.UserType, &user.Status, &user.MustChangePassword, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return User{}, err
	}
	if phone.Valid {
		user.Phone = phone.String
	}
	if email.Valid {
		user.Email = email.String
	}
	return user, nil
}

func paginateUsers[T any](items []T, page int, pageSize int) PageResult[T] {
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
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func wrapUserNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}
