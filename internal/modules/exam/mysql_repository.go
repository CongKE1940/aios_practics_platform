package exam

import (
	"context"
	"database/sql"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListExams(ctx context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	if repo == nil || repo.db == nil {
		return PageResult[Exam]{}, ErrRepositoryUnavailable
	}
	const query = `
SELECT id, tenant_id, name, status, created_at, updated_at
FROM exams
WHERE tenant_id = ? AND deleted_at IS NULL
ORDER BY id DESC
`
	rows, err := repo.db.QueryContext(ctx, query, scope.TenantID)
	if err != nil {
		return PageResult[Exam]{}, err
	}
	defer rows.Close()

	items := make([]Exam, 0)
	for rows.Next() {
		var item Exam
		if err := rows.Scan(&item.ID, &item.TenantID, &item.Name, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return PageResult[Exam]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Exam]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}
