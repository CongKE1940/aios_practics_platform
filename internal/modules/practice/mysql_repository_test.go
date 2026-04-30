package practice

import (
	"context"
	"database/sql"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestMySQLPracticeRepositoryCourseExistsUsesTenantAndActiveConditions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id
FROM courses
WHERE tenant_id = ? AND id = ? AND status = 'active' AND deleted_at IS NULL
LIMIT 1
`)).
		WithArgs(int64(7), int64(99)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(99))

	ok, err := repo.CourseExists(context.Background(), 7, 99)
	if err != nil {
		t.Fatalf("CourseExists() error = %v", err)
	}
	if !ok {
		t.Fatalf("CourseExists() = false, want true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLPracticeRepositoryCourseExistsMapsMissingRowsToFalse(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id
FROM courses
WHERE tenant_id = ? AND id = ? AND status = 'active' AND deleted_at IS NULL
LIMIT 1
`)).
		WithArgs(int64(7), int64(404)).
		WillReturnError(sql.ErrNoRows)

	ok, err := repo.CourseExists(context.Background(), 7, 404)
	if err != nil {
		t.Fatalf("CourseExists() error = %v", err)
	}
	if ok {
		t.Fatalf("CourseExists() = true, want false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}
