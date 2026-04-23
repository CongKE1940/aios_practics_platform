package exam

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
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
INSERT INTO exams (tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, total_score, assembly_rule_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	ruleJSON, err := encodePaperRules(input.PaperRules)
	if err != nil {
		return ExamDetail{}, err
	}
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
		ruleJSON,
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
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at, assembly_rule_json
FROM exams
WHERE id = ? AND tenant_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, scope.TenantID)
	item, ruleJSON, err := scanExamDetailScanner(row)
	if err != nil {
		return ExamDetail{}, wrapExamNotFound(err)
	}
	paperRules, err := decodePaperRules(ruleJSON)
	if err != nil {
		return ExamDetail{}, err
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
		PaperRules:     paperRules,
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
SET name = ?, exam_mode = ?, start_time = ?, end_time = ?, duration_minutes = ?, total_score = ?, assembly_rule_json = ?
WHERE id = ? AND tenant_id = ?
`
	ruleJSON, err := encodePaperRules(input.PaperRules)
	if err != nil {
		return ExamDetail{}, err
	}
	result, err := tx.ExecContext(
		ctx,
		query,
		input.Name,
		input.ExamMode,
		input.StartTime,
		input.EndTime,
		input.DurationMinutes,
		formatExamScore(totalScore(input.FixedQuestions)),
		ruleJSON,
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
	if current.ExamMode == ExamModeFixed && len(current.FixedQuestions) == 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	if current.ExamMode == ExamModeRandom && len(current.PaperRules) == 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	if current.ExamMode != ExamModeFixed && current.ExamMode != ExamModeRandom {
		return ExamDetail{}, ErrInvalidInput
	}
	paperQuestions := current.FixedQuestions
	if current.ExamMode == ExamModeRandom {
		paperQuestions, err = repo.drawRandomQuestions(ctx, current.TenantID, current.PaperRules)
		if err != nil {
			return ExamDetail{}, err
		}
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
	paperType := ExamPaperTypeFixed
	if current.ExamMode == ExamModeRandom {
		paperType = ExamPaperTypeRandomRule
	}
	result, err := tx.ExecContext(ctx, paperQuery, id, paperType, current.Name, formatExamScore(current.totalPublishScore()))
	if err != nil {
		return ExamDetail{}, err
	}
	paperID, err := result.LastInsertId()
	if err != nil {
		return ExamDetail{}, err
	}
	switch current.ExamMode {
	case ExamModeFixed:
		if err := repo.insertPaperQuestions(ctx, tx, paperID, paperQuestions); err != nil {
			return ExamDetail{}, err
		}
	case ExamModeRandom:
		if err := repo.insertPaperRules(ctx, tx, paperID, current.PaperRules); err != nil {
			return ExamDetail{}, err
		}
		if err := repo.insertPaperQuestions(ctx, tx, paperID, paperQuestions); err != nil {
			return ExamDetail{}, err
		}
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

func (repo *MySQLRepository) insertPaperRules(ctx context.Context, tx *sql.Tx, paperID int64, rules []ExamPaperRule) error {
	const query = `
INSERT INTO exam_paper_question_rules (paper_id, question_type, score_per_question, question_count, knowledge_tag_ids_json, bank_scope_json, course_id, difficulty_range_json, per_knowledge_count_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	for _, rule := range rules {
		if _, err := tx.ExecContext(
			ctx,
			query,
			paperID,
			rule.QuestionType,
			formatExamScore(rule.ScorePerQuestion),
			rule.QuestionCount,
			jsonOrNull(rule.KnowledgeTagIDs),
			bankScopeJSON(rule.BankIDs),
			nullableInt64(rule.CourseID),
			jsonOrNull(rule.DifficultyRange),
			jsonOrNull(rule.PerKnowledgeCount),
		); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) drawRandomQuestions(ctx context.Context, tenantID int64, rules []ExamPaperRule) ([]ExamFixedQuestion, error) {
	items := make([]ExamFixedQuestion, 0)
	for _, rule := range rules {
		available, err := repo.countRandomQuestionCandidates(ctx, tenantID, rule)
		if err != nil {
			return nil, err
		}
		if available < rule.QuestionCount {
			return nil, ErrQuestionPoolInsufficient
		}
		drawn, err := repo.listRandomQuestionCandidates(ctx, tenantID, rule)
		if err != nil {
			return nil, err
		}
		for _, item := range drawn {
			item.Score = rule.ScorePerQuestion
			item.DisplayOrder = len(items) + 1
			items = append(items, item)
		}
	}
	return items, nil
}

func (repo *MySQLRepository) countRandomQuestionCandidates(ctx context.Context, tenantID int64, rule ExamPaperRule) (int, error) {
	query, args := randomQuestionCandidateQuery("COUNT(*)", tenantID, rule)
	var count int
	if err := repo.db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (repo *MySQLRepository) listRandomQuestionCandidates(ctx context.Context, tenantID int64, rule ExamPaperRule) ([]ExamFixedQuestion, error) {
	query, args := randomQuestionCandidateQuery("q.id, q.current_version_id", tenantID, rule)
	query += " ORDER BY RAND() LIMIT ?"
	args = append(args, rule.QuestionCount)
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamFixedQuestion, 0)
	for rows.Next() {
		var item ExamFixedQuestion
		if err := rows.Scan(&item.QuestionID, &item.QuestionVersionID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func randomQuestionCandidateQuery(selectClause string, tenantID int64, rule ExamPaperRule) (string, []any) {
	query := fmt.Sprintf(`
SELECT %s
FROM questions q
WHERE q.tenant_id = ? AND q.deleted_at IS NULL AND q.status = 'active' AND q.current_version_id IS NOT NULL AND q.question_type = ?
`, selectClause)
	args := []any{tenantID, rule.QuestionType}
	if len(rule.BankIDs) > 0 {
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq WHERE qbq.question_id = q.id AND qbq.question_bank_id IN (" + placeholders(len(rule.BankIDs)) + "))"
		args = appendInt64Args(args, rule.BankIDs)
	}
	if rule.CourseID != nil {
		query += `
 AND EXISTS (
  SELECT 1
  FROM question_bank_questions qbq
  JOIN question_banks qb ON qb.id = qbq.question_bank_id
  WHERE qbq.question_id = q.id AND qb.tenant_id = q.tenant_id AND qb.deleted_at IS NULL AND qb.course_id = ?
 )
`
		args = append(args, *rule.CourseID)
	}
	if len(rule.KnowledgeTagIDs) > 0 {
		query += " AND EXISTS (SELECT 1 FROM question_tags qt WHERE qt.question_id = q.id AND qt.tag_id IN (" + placeholders(len(rule.KnowledgeTagIDs)) + "))"
		args = appendInt64Args(args, rule.KnowledgeTagIDs)
	}
	if len(rule.DifficultyRange) > 0 {
		query += " AND q.difficulty IN (" + placeholders(len(rule.DifficultyRange)) + ")"
		for _, difficulty := range rule.DifficultyRange {
			args = append(args, difficulty)
		}
	}
	return query, args
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

func scanExamDetailScanner(scanner interface{ Scan(dest ...any) error }) (Exam, sql.NullString, error) {
	var item Exam
	var ruleJSON sql.NullString
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
		&ruleJSON,
	)
	if err != nil {
		return Exam{}, sql.NullString{}, err
	}
	return item, ruleJSON, nil
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

func (detail ExamDetail) totalPublishScore() float64 {
	if detail.ExamMode == ExamModeRandom {
		total := 0.0
		for _, rule := range detail.PaperRules {
			total += rule.ScorePerQuestion * float64(rule.QuestionCount)
		}
		return total
	}
	return totalPublishedScore(detail.FixedQuestions)
}

func formatExamScore(value float64) string {
	return fmt.Sprintf("%.2f", value)
}

func encodePaperRules(rules []ExamPaperRule) (any, error) {
	if len(rules) == 0 {
		return nil, nil
	}
	raw, err := json.Marshal(rules)
	if err != nil {
		return nil, err
	}
	return string(raw), nil
}

func decodePaperRules(raw sql.NullString) ([]ExamPaperRule, error) {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return []ExamPaperRule{}, nil
	}
	var rules []ExamPaperRule
	if err := json.Unmarshal([]byte(raw.String), &rules); err != nil {
		return nil, err
	}
	return rules, nil
}

func jsonOrNull(value any) any {
	raw, err := json.Marshal(value)
	if err != nil || string(raw) == "null" || string(raw) == "{}" || string(raw) == "[]" {
		return nil
	}
	return string(raw)
}

func bankScopeJSON(bankIDs []int64) any {
	if len(bankIDs) == 0 {
		return nil
	}
	return jsonOrNull(map[string][]int64{"bank_ids": bankIDs})
}

func nullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func placeholders(count int) string {
	if count <= 0 {
		return ""
	}
	values := make([]string, count)
	for index := range values {
		values[index] = "?"
	}
	return strings.Join(values, ",")
}

func appendInt64Args(args []any, values []int64) []any {
	for _, value := range values {
		args = append(args, value)
	}
	return args
}
