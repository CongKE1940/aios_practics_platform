package auth

import (
	"context"
	"database/sql"
	"errors"
)

type MySQLUserRepository struct {
	db *sql.DB
}

func NewMySQLUserRepository(db *sql.DB) *MySQLUserRepository {
	return &MySQLUserRepository{db: db}
}

func (repo *MySQLUserRepository) FindByTenantCodeAndUsername(ctx context.Context, tenantCode string, username string) (User, error) {
	const query = `
SELECT
  u.id,
  u.tenant_id,
  u.username,
  u.password_hash,
  u.display_name,
  u.user_type,
  u.status
FROM users u
JOIN tenants t ON t.id = u.tenant_id
WHERE t.code = ? AND u.username = ? AND u.deleted_at IS NULL AND t.deleted_at IS NULL
LIMIT 1
`

	var user User
	err := repo.db.QueryRowContext(ctx, query, tenantCode, username).Scan(
		&user.ID,
		&user.TenantID,
		&user.Username,
		&user.PasswordHash,
		&user.DisplayName,
		&user.UserType,
		&user.Status,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, err
	}

	roles, err := repo.findRoles(ctx, user.ID, user.TenantID)
	if err != nil {
		return User{}, err
	}
	permissions, err := repo.findPermissions(ctx, user.ID, user.TenantID)
	if err != nil {
		return User{}, err
	}
	user.Roles = roles
	user.Permissions = permissions

	return user, nil
}

func (repo *MySQLUserRepository) MarkLastLogin(ctx context.Context, userID int64) error {
	_, err := repo.db.ExecContext(ctx, "UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?", userID)
	return err
}

func (repo *MySQLUserRepository) findRoles(ctx context.Context, userID int64, tenantID int64) ([]string, error) {
	const query = `
SELECT r.code
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = ? AND ur.tenant_id = ? AND r.status = 'active'
ORDER BY r.code
`
	return repo.queryCodes(ctx, query, userID, tenantID)
}

func (repo *MySQLUserRepository) findPermissions(ctx context.Context, userID int64, tenantID int64) ([]string, error) {
	const query = `
SELECT p.code
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE ur.user_id = ? AND ur.tenant_id = ?
ORDER BY p.code
`
	return repo.queryCodes(ctx, query, userID, tenantID)
}

func (repo *MySQLUserRepository) queryCodes(ctx context.Context, query string, args ...any) ([]string, error) {
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	codes := make([]string, 0)
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		codes = append(codes, code)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return codes, nil
}
