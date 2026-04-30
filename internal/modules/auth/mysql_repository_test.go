package auth

import (
	"context"
	"database/sql"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestMySQLUserRepositoryFindByTenantCodeAndUsername(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLUserRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
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
`)).
		WithArgs("platform", "admin").
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "username", "password_hash", "display_name", "user_type", "status"}).
			AddRow(1, 1, "admin", "hash", "系统管理员", "sys_admin", "active"))

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT r.code
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = ? AND ur.tenant_id = ? AND r.status = 'active'
ORDER BY r.code
`)).
		WithArgs(int64(1), int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"code"}).AddRow("sys_admin"))

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT p.code
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE ur.user_id = ? AND ur.tenant_id = ?
ORDER BY p.code
`)).
		WithArgs(int64(1), int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"code"}).AddRow("tenant:manage").AddRow("user:manage"))

	user, err := repo.FindByTenantCodeAndUsername(context.Background(), "platform", "admin")
	if err != nil {
		t.Fatalf("FindByTenantCodeAndUsername() error = %v", err)
	}

	if user.ID != 1 || user.TenantID != 1 {
		t.Fatalf("user = %+v", user)
	}
	if user.Roles[0] != "sys_admin" {
		t.Fatalf("Roles = %+v", user.Roles)
	}
	if len(user.Permissions) != 2 {
		t.Fatalf("Permissions = %+v", user.Permissions)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLUserRepositoryListLoginOrganizations(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLUserRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, code, name, tenant_type
FROM tenants
WHERE status = 'active' AND deleted_at IS NULL
ORDER BY CASE WHEN code = 'platform' THEN 0 ELSE 1 END, id
`)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "tenant_type"}).
			AddRow(1, "platform", "平台管理", "platform").
			AddRow(2, "demo_school", "演示学校", "school"))

	items, err := repo.ListLoginOrganizations(context.Background())
	if err != nil {
		t.Fatalf("ListLoginOrganizations() error = %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("len(items) = %d", len(items))
	}
	if items[0].TenantCode != "platform" || !items[0].IsDefault {
		t.Fatalf("items[0] = %+v", items[0])
	}
	if items[1].TenantName != "演示学校" {
		t.Fatalf("items[1] = %+v", items[1])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLUserRepositoryMapsMissingUserToInvalidCredentials(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLUserRepository(db)

	mock.ExpectQuery("SELECT").
		WithArgs("platform", "missing").
		WillReturnError(sql.ErrNoRows)

	_, err = repo.FindByTenantCodeAndUsername(context.Background(), "platform", "missing")
	if err != ErrInvalidCredentials {
		t.Fatalf("error = %v, want ErrInvalidCredentials", err)
	}
}
