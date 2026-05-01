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

func (repo *MySQLRepository) ListQuestionBanks(ctx context.Context, scope Scope, filter QuestionBankListFilter) (PageResult[QuestionBank], error) {
	query := `
SELECT qb.id, qb.tenant_id, qb.owner_org_type, qb.owner_org_id, qb.creator_id, qb.course_id, qb.name, qb.description, qb.status, qb.source_type, qb.created_at, qb.updated_at
FROM question_banks qb
WHERE qb.deleted_at IS NULL
`
	args := make([]any, 0, 5)
	if accessSQL, accessArgs := buildQuestionBankAccessCondition("qb", scope); accessSQL != "" {
		query += accessSQL
		args = append(args, accessArgs...)
	}
	if filter.CourseID != nil {
		query += " AND qb.course_id = ?"
		args = append(args, *filter.CourseID)
	}
	if filter.Status != "" {
		query += " AND qb.status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (qb.name LIKE ? OR qb.description LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword)
	}
	query += " ORDER BY qb.id DESC"

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

func (repo *MySQLRepository) GetQuestionBank(ctx context.Context, scope Scope, id int64) (QuestionBank, error) {
	query := `
SELECT qb.id, qb.tenant_id, qb.owner_org_type, qb.owner_org_id, qb.creator_id, qb.course_id, qb.name, qb.description, qb.status, qb.source_type, qb.created_at, qb.updated_at
FROM question_banks qb
WHERE qb.id = ? AND qb.deleted_at IS NULL
`
	args := []any{id}
	if accessSQL, accessArgs := buildQuestionBankAccessCondition("qb", scope); accessSQL != "" {
		query += accessSQL
		args = append(args, accessArgs...)
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
	return repo.GetQuestionBank(ctx, Scope{TenantID: questionBank.TenantID, UserID: questionBank.CreatorID, UserType: "sys_admin"}, id)
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
	return repo.GetQuestionBank(ctx, Scope{TenantID: questionBank.TenantID, UserID: questionBank.CreatorID, UserType: "sys_admin"}, questionBank.ID)
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
	return repo.GetQuestionBank(ctx, Scope{TenantID: tenantID, UserType: "sys_admin"}, id)
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

func buildQuestionBankAccessCondition(alias string, scope Scope) (string, []any) {
	if isSystemScope(scope) {
		return "", nil
	}

	allVisibleSQL := `
EXISTS (
  SELECT 1
  FROM question_bank_visibility qbv_all
  WHERE qbv_all.question_bank_id = ` + alias + `.id
    AND qbv_all.status = 'active'
    AND qbv_all.permission_type IN ('view', 'practice', 'share', 'manage', 'exam')
    AND qbv_all.target_type = 'all'
)
`
	if scope.TenantID <= 0 {
		return " AND (" + alias + ".creator_id = ? OR " + allVisibleSQL + ")", []any{scope.UserID}
	}

	if containsExactPermission(scope.Permissions, "question_bank:manage") {
		return " AND (" + alias + ".tenant_id = ? OR " + allVisibleSQL + ")", []any{scope.TenantID}
	}

	condition := `
 AND (
  ` + alias + `.creator_id = ?
  OR ` + allVisibleSQL + `
  OR (
    ` + alias + `.tenant_id = ?
    AND EXISTS (
      SELECT 1
      FROM question_bank_visibility qbv
      WHERE qbv.question_bank_id = ` + alias + `.id
        AND qbv.tenant_id = ` + alias + `.tenant_id
        AND qbv.status = 'active'
        AND qbv.permission_type IN ('view', 'practice', 'share', 'manage', 'exam')
        AND (
          (qbv.target_type = 'tenant' AND (qbv.target_id = 0 OR qbv.target_id = ?))
          OR (qbv.target_type = ? AND (qbv.target_id = 0 OR qbv.target_id = ?))
          OR (
            qbv.target_type = 'class'
            AND (
              EXISTS (
                SELECT 1
                FROM student_class_memberships scm
                WHERE scm.tenant_id = ` + alias + `.tenant_id
                  AND scm.student_id = ?
                  AND scm.class_id = qbv.target_id
                  AND scm.is_current = 1
                  AND scm.status = 'active'
              )
              OR EXISTS (
                SELECT 1
                FROM class_head_teacher_assignments chta
                WHERE chta.tenant_id = ` + alias + `.tenant_id
                  AND chta.teacher_id = ?
                  AND chta.class_id = qbv.target_id
                  AND chta.is_current = 1
                  AND chta.status = 'active'
              )
              OR (
                ` + alias + `.course_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM teacher_class_course_assignments tcca
                  WHERE tcca.tenant_id = ` + alias + `.tenant_id
                    AND tcca.teacher_id = ?
                    AND tcca.class_id = qbv.target_id
                    AND tcca.course_id = ` + alias + `.course_id
                    AND tcca.is_current = 1
                    AND tcca.status = 'active'
                )
              )
            )
          )
        )
    )
  )
)
`
	args := []any{
		scope.UserID,
		scope.TenantID,
		scope.TenantID,
		scope.UserType,
		scope.UserID,
		scope.UserID,
		scope.UserID,
		scope.UserID,
	}
	return condition, args
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
