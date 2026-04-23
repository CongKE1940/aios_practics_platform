package exam

import (
	"context"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var _ Repository = (*MySQLRepository)(nil)

func TestNewMySQLRepository(t *testing.T) {
	repo := NewMySQLRepository(nil)
	if repo == nil {
		t.Fatal("repo is nil")
	}
}

func TestMySQLRepositoryListExamsUsesTenantConditionAndScansRows(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	createdAt := time.Date(2026, 4, 22, 12, 0, 0, 0, time.UTC)
	updatedAt := createdAt.Add(time.Minute)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, tenant_id, name, status, created_at, updated_at
FROM exams
WHERE tenant_id = ? AND deleted_at IS NULL
ORDER BY id DESC
`)).
		WithArgs(int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "name", "status", "created_at", "updated_at"}).
			AddRow(int64(101), int64(7), "七年级数学周测", "draft", createdAt, updatedAt).
			AddRow(int64(102), int64(7), "七年级英语周测", "published", createdAt.Add(time.Hour), updatedAt.Add(time.Hour)))

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7}, ExamListFilter{Page: 1, PageSize: 1})
	if err != nil {
		t.Fatalf("ListExams() error = %v", err)
	}
	if result.Page != 1 || result.PageSize != 1 || result.Total != 2 {
		t.Fatalf("page result = %+v", result)
	}
	if len(result.Items) != 1 {
		t.Fatalf("items len = %d", len(result.Items))
	}
	if result.Items[0].ID != 101 || result.Items[0].TenantID != 7 || result.Items[0].Name != "七年级数学周测" || result.Items[0].Status != "draft" {
		t.Fatalf("first item = %+v", result.Items[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListExamsReturnsExplicitErrorWhenDBMissing(t *testing.T) {
	var repo *MySQLRepository

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7}, ExamListFilter{Page: 1, PageSize: 20})
	if !errors.Is(err, ErrRepositoryUnavailable) {
		t.Fatalf("error = %v", err)
	}
	if len(result.Items) != 0 || result.Total != 0 {
		t.Fatalf("result = %+v", result)
	}
}

func TestMySQLRepositoryListExamsMapsSqlNoRowsToEmptyResult(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, tenant_id, name, status, created_at, updated_at
FROM exams
WHERE tenant_id = ? AND deleted_at IS NULL
ORDER BY id DESC
`)).
		WithArgs(int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "name", "status", "created_at", "updated_at"}))

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7}, ExamListFilter{Page: 2, PageSize: 20})
	if err != nil {
		t.Fatalf("ListExams() error = %v", err)
	}
	if len(result.Items) != 0 || result.Total != 0 || result.Page != 2 || result.PageSize != 20 {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}
