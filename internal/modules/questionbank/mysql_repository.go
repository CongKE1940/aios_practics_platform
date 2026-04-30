package questionbank

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

func (repo *MySQLRepository) ListQuestionBanks(ctx context.Context, tenantID int64, filter QuestionBankListFilter) (PageResult[QuestionBank], error) {
	query := `
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, course_id, name, description, status, source_type, created_at, updated_at
FROM question_banks
WHERE deleted_at IS NULL
`
	args := make([]any, 0, 5)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.CourseID != nil {
		query += " AND course_id = ?"
		args = append(args, *filter.CourseID)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (name LIKE ? OR description LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword)
	}
	query += " ORDER BY id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[QuestionBank]{}, err
	}
	defer rows.Close()

	items := make([]QuestionBank, 0)
	for rows.Next() {
		item, err := scanQuestionBank(rows)
		if err != nil {
			return PageResult[QuestionBank]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[QuestionBank]{}, err
	}

	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetQuestionBank(ctx context.Context, tenantID int64, id int64) (QuestionBank, error) {
	query := `
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, course_id, name, description, status, source_type, created_at, updated_at
FROM question_banks
WHERE id = ? AND deleted_at IS NULL
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	item, err := scanQuestionBankScanner(row)
	if err != nil {
		return QuestionBank{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) CreateQuestionBank(ctx context.Context, questionBank QuestionBank) (QuestionBank, error) {
	const query = `
INSERT INTO question_banks (tenant_id, owner_org_type, owner_org_id, creator_id, course_id, name, description, status, source_type)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.db.ExecContext(
		ctx,
		query,
		questionBank.TenantID,
		questionBank.OwnerOrgType,
		questionBank.OwnerOrgID,
		questionBank.CreatorID,
		nullInt64(questionBank.CourseID),
		questionBank.Name,
		nullString(questionBank.Description),
		questionBank.Status,
		questionBank.SourceType,
	)
	if err != nil {
		return QuestionBank{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return QuestionBank{}, err
	}
	return repo.GetQuestionBank(ctx, questionBank.TenantID, id)
}

func (repo *MySQLRepository) UpdateQuestionBank(ctx context.Context, questionBank QuestionBank) (QuestionBank, error) {
	const query = `
UPDATE question_banks
SET course_id = ?, name = ?, description = ?, status = ?
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	if err := repo.execAffectingOne(
		ctx,
		query,
		nullInt64(questionBank.CourseID),
		questionBank.Name,
		nullString(questionBank.Description),
		questionBank.Status,
		questionBank.ID,
		questionBank.TenantID,
	); err != nil {
		return QuestionBank{}, err
	}
	return repo.GetQuestionBank(ctx, questionBank.TenantID, questionBank.ID)
}

func (repo *MySQLRepository) PublishQuestionBank(ctx context.Context, tenantID int64, id int64) (QuestionBank, error) {
	const query = `
UPDATE question_banks
SET status = ?
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	if err := repo.execAffectingOne(ctx, query, StatusActive, id, tenantID); err != nil {
		return QuestionBank{}, err
	}
	return repo.GetQuestionBank(ctx, tenantID, id)
}

func (repo *MySQLRepository) ReplaceVisibility(ctx context.Context, tenantID int64, questionBankID int64, grantedBy int64, grants []QuestionBankVisibilityGrant) error {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM question_bank_visibility WHERE question_bank_id = ? AND tenant_id = ?", questionBankID, tenantID); err != nil {
		return err
	}

	if len(grants) > 0 {
		const insertQuery = `
INSERT INTO question_bank_visibility (
  question_bank_id, tenant_id, grant_type, target_type, target_id, permission_type, inherit_to_children, granted_by, status
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
`
		for _, grant := range grants {
			if _, err := tx.ExecContext(
				ctx,
				insertQuery,
				questionBankID,
				tenantID,
				grant.GrantType,
				grant.TargetType,
				grant.TargetID,
				grant.PermissionType,
				grant.InheritToChildren,
				grantedBy,
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
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

func scanQuestionBank(rows *sql.Rows) (QuestionBank, error) {
	return scanQuestionBankScanner(rows)
}

func scanQuestionBankScanner(scanner interface{ Scan(dest ...any) error }) (QuestionBank, error) {
	var item QuestionBank
	var courseID sql.NullInt64
	var description sql.NullString
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.OwnerOrgType,
		&item.OwnerOrgID,
		&item.CreatorID,
		&courseID,
		&item.Name,
		&description,
		&item.Status,
		&item.SourceType,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return QuestionBank{}, err
	}
	if courseID.Valid {
		value := courseID.Int64
		item.CourseID = &value
	}
	if description.Valid {
		item.Description = description.String
	}
	return item, nil
}

func nullInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func wrapNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}
