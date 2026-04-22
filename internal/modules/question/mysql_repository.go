package question

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListQuestions(ctx context.Context, tenantID int64, filter QuestionListFilter) (PageResult[Question], error) {
	query := `
SELECT
  q.id,
  q.tenant_id,
  q.owner_org_type,
  q.owner_org_id,
  q.question_type,
  q.difficulty,
  q.current_version_id,
  q.status,
  q.source_type,
  q.creator_id,
  q.created_at,
  q.updated_at,
  qv.version_no
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.tenant_id = ? AND q.deleted_at IS NULL
`
	args := []any{tenantID}
	if filter.QuestionType != "" {
		query += " AND q.question_type = ?"
		args = append(args, filter.QuestionType)
	}
	if filter.Status != "" {
		query += " AND q.status = ?"
		args = append(args, filter.Status)
	}
	if filter.BankID != nil {
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq WHERE qbq.question_id = q.id AND qbq.question_bank_id = ?)"
		args = append(args, *filter.BankID)
	}
	if filter.CourseID != nil {
		query += `
 AND EXISTS (
  SELECT 1
  FROM question_bank_questions qbq
  JOIN question_banks qb ON qb.id = qbq.question_bank_id
  WHERE qbq.question_id = q.id AND qb.tenant_id = q.tenant_id AND qb.deleted_at IS NULL AND qb.course_id = ?
 )
`
		args = append(args, *filter.CourseID)
	}
	if filter.Keyword != "" {
		query += " AND JSON_UNQUOTE(JSON_EXTRACT(qv.content_json, '$.stem.text')) LIKE ?"
		args = append(args, "%"+filter.Keyword+"%")
	}
	query += " ORDER BY q.id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Question]{}, err
	}
	defer rows.Close()

	items := make([]Question, 0)
	for rows.Next() {
		item, err := scanQuestion(rows)
		if err != nil {
			return PageResult[Question]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Question]{}, err
	}

	if err := repo.fillBankIDs(ctx, items); err != nil {
		return PageResult[Question]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetQuestion(ctx context.Context, tenantID int64, id int64) (Question, error) {
	const query = `
SELECT
  q.id,
  q.tenant_id,
  q.owner_org_type,
  q.owner_org_id,
  q.question_type,
  q.difficulty,
  q.current_version_id,
  q.status,
  q.source_type,
  q.creator_id,
  q.created_at,
  q.updated_at,
  qv.version_no
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.id = ? AND q.tenant_id = ? AND q.deleted_at IS NULL
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, tenantID)
	item, err := scanQuestionScanner(row)
	if err != nil {
		return Question{}, wrapNotFound(err)
	}
	if err := repo.fillBankIDs(ctx, []Question{item}); err != nil {
		return Question{}, err
	}
	return repo.getQuestionWithBanks(ctx, tenantID, id)
}

func (repo *MySQLRepository) CreateQuestion(ctx context.Context, question Question, version QuestionVersion, bankIDs []int64) (Question, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return Question{}, err
	}
	defer tx.Rollback()

	const insertQuestion = `
INSERT INTO questions (tenant_id, owner_org_type, owner_org_id, question_type, difficulty, status, source_type, creator_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`
	questionResult, err := tx.ExecContext(
		ctx,
		insertQuestion,
		question.TenantID,
		question.OwnerOrgType,
		question.OwnerOrgID,
		question.QuestionType,
		nullString(question.Difficulty),
		question.Status,
		question.SourceType,
		question.CreatorID,
	)
	if err != nil {
		return Question{}, err
	}
	questionID, err := questionResult.LastInsertId()
	if err != nil {
		return Question{}, err
	}

	versionID, err := repo.insertVersion(ctx, tx, questionID, version, 1)
	if err != nil {
		return Question{}, err
	}

	if _, err := tx.ExecContext(ctx, "UPDATE questions SET current_version_id = ? WHERE id = ? AND tenant_id = ?", versionID, questionID, question.TenantID); err != nil {
		return Question{}, err
	}

	if err := repo.insertQuestionBanks(ctx, tx, questionID, bankIDs); err != nil {
		return Question{}, err
	}

	if err := tx.Commit(); err != nil {
		return Question{}, err
	}
	return repo.GetQuestion(ctx, question.TenantID, questionID)
}

func (repo *MySQLRepository) UpdateQuestion(ctx context.Context, question Question) (Question, error) {
	const query = `
UPDATE questions
SET difficulty = ?, status = ?
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	if err := repo.execAffectingOne(ctx, query, nullString(question.Difficulty), question.Status, question.ID, question.TenantID); err != nil {
		return Question{}, err
	}
	return repo.GetQuestion(ctx, question.TenantID, question.ID)
}

func (repo *MySQLRepository) ListVersions(ctx context.Context, tenantID int64, questionID int64) ([]QuestionVersion, error) {
	if _, err := repo.GetQuestion(ctx, tenantID, questionID); err != nil {
		return nil, err
	}

	const query = `
SELECT id, question_id, version_no, content_json, answer_json, analysis_json, structure_hash, change_summary, is_published, created_by, created_at
FROM question_versions
WHERE question_id = ?
ORDER BY version_no DESC, id DESC
`
	rows, err := repo.db.QueryContext(ctx, query, questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]QuestionVersion, 0)
	for rows.Next() {
		item, err := scanQuestionVersion(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) CreateVersion(ctx context.Context, tenantID int64, questionID int64, version QuestionVersion) (QuestionVersion, Question, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return QuestionVersion{}, Question{}, err
	}
	defer tx.Rollback()

	if _, err := repo.getQuestionForUpdate(ctx, tx, tenantID, questionID); err != nil {
		return QuestionVersion{}, Question{}, err
	}

	var currentVersionNo int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(version_no), 0) FROM question_versions WHERE question_id = ?", questionID).Scan(&currentVersionNo); err != nil {
		return QuestionVersion{}, Question{}, err
	}

	versionNo := currentVersionNo + 1
	versionID, err := repo.insertVersion(ctx, tx, questionID, version, versionNo)
	if err != nil {
		return QuestionVersion{}, Question{}, err
	}

	if _, err := tx.ExecContext(ctx, "UPDATE questions SET current_version_id = ? WHERE id = ? AND tenant_id = ?", versionID, questionID, tenantID); err != nil {
		return QuestionVersion{}, Question{}, err
	}

	if err := tx.Commit(); err != nil {
		return QuestionVersion{}, Question{}, err
	}

	createdVersion, err := repo.getVersionByID(ctx, versionID)
	if err != nil {
		return QuestionVersion{}, Question{}, err
	}
	updatedQuestion, err := repo.GetQuestion(ctx, tenantID, questionID)
	if err != nil {
		return QuestionVersion{}, Question{}, err
	}
	return createdVersion, updatedQuestion, nil
}

func (repo *MySQLRepository) insertVersion(ctx context.Context, tx *sql.Tx, questionID int64, version QuestionVersion, versionNo int) (int64, error) {
	contentJSON, err := json.Marshal(version.Content)
	if err != nil {
		return 0, err
	}
	answerJSON, err := json.Marshal(version.Answer)
	if err != nil {
		return 0, err
	}
	analysisJSON, err := nullableJSON(version.Analysis)
	if err != nil {
		return 0, err
	}

	const query = `
INSERT INTO question_versions (question_id, version_no, content_json, answer_json, analysis_json, structure_hash, change_summary, is_published, created_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := tx.ExecContext(
		ctx,
		query,
		questionID,
		versionNo,
		contentJSON,
		answerJSON,
		analysisJSON,
		version.StructureHash,
		nullString(version.ChangeSummary),
		version.IsPublished,
		version.CreatedBy,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (repo *MySQLRepository) insertQuestionBanks(ctx context.Context, tx *sql.Tx, questionID int64, bankIDs []int64) error {
	if len(bankIDs) == 0 {
		return nil
	}
	const query = `
INSERT INTO question_bank_questions (question_bank_id, question_id)
VALUES (?, ?)
`
	for _, bankID := range bankIDs {
		if _, err := tx.ExecContext(ctx, query, bankID, questionID); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) getQuestionForUpdate(ctx context.Context, tx *sql.Tx, tenantID int64, questionID int64) (Question, error) {
	const query = `
SELECT
  q.id,
  q.tenant_id,
  q.owner_org_type,
  q.owner_org_id,
  q.question_type,
  q.difficulty,
  q.current_version_id,
  q.status,
  q.source_type,
  q.creator_id,
  q.created_at,
  q.updated_at,
  qv.version_no
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.id = ? AND q.tenant_id = ? AND q.deleted_at IS NULL
FOR UPDATE
`
	row := tx.QueryRowContext(ctx, query, questionID, tenantID)
	item, err := scanQuestionScanner(row)
	if err != nil {
		return Question{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) getVersionByID(ctx context.Context, id int64) (QuestionVersion, error) {
	const query = `
SELECT id, question_id, version_no, content_json, answer_json, analysis_json, structure_hash, change_summary, is_published, created_by, created_at
FROM question_versions
WHERE id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id)
	item, err := scanQuestionVersionScanner(row)
	if err != nil {
		return QuestionVersion{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) getQuestionWithBanks(ctx context.Context, tenantID int64, id int64) (Question, error) {
	const query = `
SELECT
  q.id,
  q.tenant_id,
  q.owner_org_type,
  q.owner_org_id,
  q.question_type,
  q.difficulty,
  q.current_version_id,
  q.status,
  q.source_type,
  q.creator_id,
  q.created_at,
  q.updated_at,
  qv.version_no
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.id = ? AND q.tenant_id = ? AND q.deleted_at IS NULL
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, tenantID)
	item, err := scanQuestionScanner(row)
	if err != nil {
		return Question{}, wrapNotFound(err)
	}
	items := []Question{item}
	if err := repo.fillBankIDs(ctx, items); err != nil {
		return Question{}, err
	}
	return items[0], nil
}

func (repo *MySQLRepository) fillBankIDs(ctx context.Context, items []Question) error {
	if len(items) == 0 {
		return nil
	}

	questionIDs := make([]int64, 0, len(items))
	indexByID := make(map[int64]int, len(items))
	for index, item := range items {
		questionIDs = append(questionIDs, item.ID)
		indexByID[item.ID] = index
		items[index].BankIDs = []int64{}
	}

	query := `
SELECT question_id, question_bank_id
FROM question_bank_questions
WHERE question_id IN (` + placeholders(len(questionIDs)) + `)
ORDER BY id
`
	args := make([]any, 0, len(questionIDs))
	for _, questionID := range questionIDs {
		args = append(args, questionID)
	}

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var questionID int64
		var bankID int64
		if err := rows.Scan(&questionID, &bankID); err != nil {
			return err
		}
		if index, ok := indexByID[questionID]; ok {
			items[index].BankIDs = append(items[index].BankIDs, bankID)
		}
	}
	return rows.Err()
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

func scanQuestion(rows *sql.Rows) (Question, error) {
	return scanQuestionScanner(rows)
}

func scanQuestionScanner(scanner interface{ Scan(dest ...any) error }) (Question, error) {
	var item Question
	var difficulty sql.NullString
	var currentVersionID sql.NullInt64
	var currentVersionNo sql.NullInt64
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.OwnerOrgType,
		&item.OwnerOrgID,
		&item.QuestionType,
		&difficulty,
		&currentVersionID,
		&item.Status,
		&item.SourceType,
		&item.CreatorID,
		&item.CreatedAt,
		&item.UpdatedAt,
		&currentVersionNo,
	)
	if err != nil {
		return Question{}, err
	}
	if difficulty.Valid {
		item.Difficulty = difficulty.String
	}
	if currentVersionID.Valid {
		value := currentVersionID.Int64
		item.CurrentVersionID = &value
	}
	if currentVersionNo.Valid {
		value := int(currentVersionNo.Int64)
		item.CurrentVersionNo = &value
	}
	return item, nil
}

func scanQuestionVersion(rows *sql.Rows) (QuestionVersion, error) {
	return scanQuestionVersionScanner(rows)
}

func scanQuestionVersionScanner(scanner interface{ Scan(dest ...any) error }) (QuestionVersion, error) {
	var item QuestionVersion
	var contentJSON []byte
	var answerJSON []byte
	var analysisJSON []byte
	var changeSummary sql.NullString
	err := scanner.Scan(
		&item.ID,
		&item.QuestionID,
		&item.VersionNo,
		&contentJSON,
		&answerJSON,
		&analysisJSON,
		&item.StructureHash,
		&changeSummary,
		&item.IsPublished,
		&item.CreatedBy,
		&item.CreatedAt,
	)
	if err != nil {
		return QuestionVersion{}, err
	}
	if err := unmarshalJSONMap(contentJSON, &item.Content); err != nil {
		return QuestionVersion{}, err
	}
	if err := unmarshalJSONMap(answerJSON, &item.Answer); err != nil {
		return QuestionVersion{}, err
	}
	if len(analysisJSON) > 0 {
		if err := unmarshalJSONMap(analysisJSON, &item.Analysis); err != nil {
			return QuestionVersion{}, err
		}
	}
	if changeSummary.Valid {
		item.ChangeSummary = changeSummary.String
	}
	return item, nil
}

func nullableJSON(value map[string]any) (any, error) {
	if len(value) == 0 {
		return nil, nil
	}
	return json.Marshal(value)
}

func unmarshalJSONMap(payload []byte, target *map[string]any) error {
	if len(payload) == 0 {
		*target = map[string]any{}
		return nil
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return err
	}
	if *target == nil {
		*target = map[string]any{}
	}
	return nil
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

func placeholders(count int) string {
	parts := make([]string, count)
	for index := range parts {
		parts[index] = "?"
	}
	return strings.Join(parts, ", ")
}
