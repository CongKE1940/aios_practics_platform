package exam

import (
	"context"
	"database/sql"
	"fmt"
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
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at
FROM exams
WHERE tenant_id = ?
ORDER BY id DESC
`
	rows, err := repo.db.QueryContext(ctx, query, scope.TenantID)
	if err != nil {
		return PageResult[Exam]{}, err
	}
	defer rows.Close()

	items := make([]Exam, 0)
	for rows.Next() {
		item, err := scanExam(rows)
		if err != nil {
			return PageResult[Exam]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Exam]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) CreateExam(ctx context.Context, scope Scope, input ExamInput) (ExamDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamDetail{}, err
	}
	defer tx.Rollback()

	const query = `
INSERT INTO exams (tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, total_score)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := tx.ExecContext(
		ctx,
		query,
		scope.TenantID,
		OwnerOrgTypeSchool,
		scope.TenantID,
		scope.UserID,
		input.Name,
		input.ExamMode,
		ExamStatusDraft,
		input.StartTime,
		input.EndTime,
		input.DurationMinutes,
		formatExamScore(totalScore(input.FixedQuestions)),
	)
	if err != nil {
		return ExamDetail{}, err
	}
	examID, err := result.LastInsertId()
	if err != nil {
		return ExamDetail{}, err
	}
	if err := repo.insertTargets(ctx, tx, examID, input.Targets); err != nil {
		return ExamDetail{}, err
	}
	if err := repo.insertFixedQuestions(ctx, tx, examID, input.FixedQuestions); err != nil {
		return ExamDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return ExamDetail{}, err
	}
	return repo.GetExam(ctx, scope, examID)
}

func (repo *MySQLRepository) GetExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	const query = `
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at
FROM exams
WHERE id = ? AND tenant_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, scope.TenantID)
	item, err := scanExamScanner(row)
	if err != nil {
		return ExamDetail{}, wrapExamNotFound(err)
	}
	targets, err := repo.listExamTargets(ctx, id)
	if err != nil {
		return ExamDetail{}, err
	}
	fixedQuestions, err := repo.listExamFixedQuestions(ctx, id)
	if err != nil {
		return ExamDetail{}, err
	}
	return ExamDetail{
		Exam:           item,
		Targets:        targets,
		FixedQuestions: fixedQuestions,
	}, nil
}

func (repo *MySQLRepository) UpdateExam(ctx context.Context, scope Scope, id int64, input ExamInput) (ExamDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	current, err := repo.GetExam(ctx, scope, id)
	if err != nil {
		return ExamDetail{}, err
	}
	if current.Status != ExamStatusDraft {
		return ExamDetail{}, ErrForbidden
	}
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamDetail{}, err
	}
	defer tx.Rollback()

	const query = `
UPDATE exams
SET name = ?, exam_mode = ?, start_time = ?, end_time = ?, duration_minutes = ?, total_score = ?
WHERE id = ? AND tenant_id = ?
`
	result, err := tx.ExecContext(
		ctx,
		query,
		input.Name,
		input.ExamMode,
		input.StartTime,
		input.EndTime,
		input.DurationMinutes,
		formatExamScore(totalScore(input.FixedQuestions)),
		id,
		scope.TenantID,
	)
	if err != nil {
		return ExamDetail{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return ExamDetail{}, err
	}
	if rowsAffected == 0 {
		return ExamDetail{}, ErrNotFound
	}
	if err := repo.replaceTargets(ctx, tx, id, input.Targets); err != nil {
		return ExamDetail{}, err
	}
	if err := repo.replaceFixedQuestions(ctx, tx, id, input.FixedQuestions); err != nil {
		return ExamDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return ExamDetail{}, err
	}
	return repo.GetExam(ctx, scope, id)
}

func (repo *MySQLRepository) PublishExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	current, err := repo.GetExam(ctx, scope, id)
	if err != nil {
		return ExamDetail{}, err
	}
	if current.Status != ExamStatusDraft {
		return ExamDetail{}, ErrForbidden
	}
	if current.ExamMode != ExamModeFixed || len(current.FixedQuestions) == 0 {
		return ExamDetail{}, ErrInvalidInput
	}

	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamDetail{}, err
	}
	defer tx.Rollback()

	const paperQuery = `
INSERT INTO exam_papers (exam_id, paper_type, paper_name, total_score)
VALUES (?, ?, ?, ?)
`
	result, err := tx.ExecContext(ctx, paperQuery, id, ExamPaperTypeFixed, current.Name, formatExamScore(totalPublishedScore(current.FixedQuestions)))
	if err != nil {
		return ExamDetail{}, err
	}
	paperID, err := result.LastInsertId()
	if err != nil {
		return ExamDetail{}, err
	}
	if err := repo.insertPaperQuestions(ctx, tx, paperID, current.FixedQuestions); err != nil {
		return ExamDetail{}, err
	}
	statusResult, err := tx.ExecContext(ctx, `UPDATE exams SET status = ? WHERE id = ? AND tenant_id = ? AND status = ?`, ExamStatusPublished, id, scope.TenantID, ExamStatusDraft)
	if err != nil {
		return ExamDetail{}, err
	}
	rowsAffected, err := statusResult.RowsAffected()
	if err != nil {
		return ExamDetail{}, err
	}
	if rowsAffected == 0 {
		return ExamDetail{}, ErrForbidden
	}
	if err := tx.Commit(); err != nil {
		return ExamDetail{}, err
	}
	return repo.GetExam(ctx, scope, id)
}

func (repo *MySQLRepository) replaceTargets(ctx context.Context, tx *sql.Tx, examID int64, targets []ExamTargetInput) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM exam_targets WHERE exam_id = ?`, examID); err != nil {
		return err
	}
	return repo.insertTargets(ctx, tx, examID, targets)
}

func (repo *MySQLRepository) replaceFixedQuestions(ctx context.Context, tx *sql.Tx, examID int64, fixedQuestions []ExamFixedQuestionInput) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM exam_fixed_question_drafts WHERE exam_id = ?`, examID); err != nil {
		return err
	}
	return repo.insertFixedQuestions(ctx, tx, examID, fixedQuestions)
}

func (repo *MySQLRepository) insertTargets(ctx context.Context, tx *sql.Tx, examID int64, targets []ExamTargetInput) error {
	const query = `
INSERT INTO exam_targets (exam_id, target_type, target_id)
VALUES (?, ?, ?)
`
	for _, target := range targets {
		if _, err := tx.ExecContext(ctx, query, examID, target.TargetType, target.TargetID); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) insertFixedQuestions(ctx context.Context, tx *sql.Tx, examID int64, fixedQuestions []ExamFixedQuestionInput) error {
	const query = `
INSERT INTO exam_fixed_question_drafts (exam_id, question_id, question_version_id, score, display_order)
VALUES (?, ?, ?, ?, ?)
`
	for _, item := range fixedQuestions {
		if _, err := tx.ExecContext(ctx, query, examID, item.QuestionID, item.QuestionVersionID, formatExamScore(item.Score), item.DisplayOrder); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) insertPaperQuestions(ctx context.Context, tx *sql.Tx, paperID int64, fixedQuestions []ExamFixedQuestion) error {
	const query = `
INSERT INTO exam_paper_questions (paper_id, question_id, question_version_id, score, order_no)
VALUES (?, ?, ?, ?, ?)
`
	for _, item := range fixedQuestions {
		if _, err := tx.ExecContext(ctx, query, paperID, item.QuestionID, item.QuestionVersionID, formatExamScore(item.Score), item.DisplayOrder); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) listExamTargets(ctx context.Context, examID int64) ([]ExamTarget, error) {
	const query = `
SELECT target_type, target_id, created_at
FROM exam_targets
WHERE exam_id = ?
ORDER BY id ASC
`
	rows, err := repo.db.QueryContext(ctx, query, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamTarget, 0)
	for rows.Next() {
		var item ExamTarget
		if err := rows.Scan(&item.TargetType, &item.TargetID, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) listExamFixedQuestions(ctx context.Context, examID int64) ([]ExamFixedQuestion, error) {
	const query = `
SELECT question_id, question_version_id, score, display_order, created_at
FROM exam_fixed_question_drafts
WHERE exam_id = ?
ORDER BY display_order ASC, id ASC
`
	rows, err := repo.db.QueryContext(ctx, query, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamFixedQuestion, 0)
	for rows.Next() {
		var item ExamFixedQuestion
		if err := rows.Scan(&item.QuestionID, &item.QuestionVersionID, &item.Score, &item.DisplayOrder, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func scanExam(rows *sql.Rows) (Exam, error) {
	return scanExamScanner(rows)
}

func scanExamScanner(scanner interface{ Scan(dest ...any) error }) (Exam, error) {
	var item Exam
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.OwnerOrgType,
		&item.OwnerOrgID,
		&item.CreatorID,
		&item.Name,
		&item.ExamMode,
		&item.Status,
		&item.StartTime,
		&item.EndTime,
		&item.DurationMinutes,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return Exam{}, err
	}
	return item, nil
}

func wrapExamNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}

func totalScore(items []ExamFixedQuestionInput) float64 {
	total := 0.0
	for _, item := range items {
		total += item.Score
	}
	return total
}

func totalPublishedScore(items []ExamFixedQuestion) float64 {
	total := 0.0
	for _, item := range items {
		total += item.Score
	}
	return total
}

func formatExamScore(value float64) string {
	return fmt.Sprintf("%.2f", value)
}
