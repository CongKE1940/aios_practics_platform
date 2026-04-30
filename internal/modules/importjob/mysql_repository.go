package importjob

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

func (repo *MySQLRepository) CreateJob(ctx context.Context, job ImportJob) (ImportJob, error) {
	const query = `
INSERT INTO import_jobs (tenant_id, import_type, template_version, file_asset_id, file_url, status, operator_id, started_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.db.ExecContext(ctx, query, job.TenantID, job.ImportType, job.TemplateVersion, nullInt64(job.FileAssetID), job.FileURL, job.Status, job.OperatorID, job.StartedAt)
	if err != nil {
		return ImportJob{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return ImportJob{}, err
	}
	return repo.GetJob(ctx, job.TenantID, id)
}

func (repo *MySQLRepository) UpdateJobWithRows(ctx context.Context, job ImportJob, rows []ImportJobRow) (ImportJob, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportJob{}, err
	}
	defer tx.Rollback()

	const updateJob = `
UPDATE import_jobs
SET status = ?, total_rows = ?, success_rows = ?, failed_rows = ?, error_summary = ?, finished_at = ?
WHERE id = ? AND tenant_id = ?
`
	result, err := tx.ExecContext(ctx, updateJob, job.Status, job.TotalRows, job.SuccessRows, job.FailedRows, nullString(job.ErrorSummary), job.FinishedAt, job.ID, job.TenantID)
	if err != nil {
		return ImportJob{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return ImportJob{}, err
	}
	if affected == 0 {
		return ImportJob{}, ErrNotFound
	}

	const insertRow = `
INSERT INTO import_job_rows (
  job_id, row_no, raw_data_json, normalized_data_json, status, error_code, error_message, target_entity_type, target_entity_id
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	for _, row := range rows {
		rawJSON, err := json.Marshal(row.RawData)
		if err != nil {
			return ImportJob{}, err
		}
		normalizedJSON, err := nullableJSON(row.NormalizedData)
		if err != nil {
			return ImportJob{}, err
		}
		if _, err := tx.ExecContext(ctx, insertRow, job.ID, row.RowNo, rawJSON, normalizedJSON, row.Status, nullString(row.ErrorCode), nullString(row.ErrorMessage), nullString(row.TargetEntityType), nullInt64(row.TargetEntityID)); err != nil {
			return ImportJob{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return ImportJob{}, err
	}
	return repo.GetJob(ctx, job.TenantID, job.ID)
}

func (repo *MySQLRepository) ListJobs(ctx context.Context, tenantID int64, filter ImportJobListFilter) (PageResult[ImportJob], error) {
	query := `
SELECT id, tenant_id, import_type, template_version, file_asset_id, file_url, status, total_rows, success_rows, failed_rows, error_summary, operator_id, started_at, finished_at, created_at
FROM import_jobs
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.ImportType != "" {
		query += " AND import_type = ?"
		args = append(args, filter.ImportType)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY id DESC"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[ImportJob]{}, err
	}
	defer rows.Close()

	items := make([]ImportJob, 0)
	for rows.Next() {
		item, err := scanImportJob(rows)
		if err != nil {
			return PageResult[ImportJob]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[ImportJob]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetJob(ctx context.Context, tenantID int64, id int64) (ImportJob, error) {
	query := `
SELECT id, tenant_id, import_type, template_version, file_asset_id, file_url, status, total_rows, success_rows, failed_rows, error_summary, operator_id, started_at, finished_at, created_at
FROM import_jobs
WHERE id = ?
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	item, err := scanImportJobScanner(row)
	if err != nil {
		return ImportJob{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) ListRows(ctx context.Context, tenantID int64, jobID int64, filter ImportJobRowFilter) (PageResult[ImportJobRow], error) {
	if _, err := repo.GetJob(ctx, tenantID, jobID); err != nil {
		return PageResult[ImportJobRow]{}, err
	}
	query := `
SELECT id, job_id, row_no, raw_data_json, normalized_data_json, status, error_code, error_message, target_entity_type, target_entity_id, created_at
FROM import_job_rows
WHERE job_id = ?
`
	args := []any{jobID}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY row_no ASC"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[ImportJobRow]{}, err
	}
	defer rows.Close()

	items := make([]ImportJobRow, 0)
	for rows.Next() {
		item, err := scanImportJobRow(rows)
		if err != nil {
			return PageResult[ImportJobRow]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[ImportJobRow]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) FindCourseByName(ctx context.Context, tenantID int64, name string) (CourseRef, error) {
	const query = `
SELECT id, name
FROM courses
WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL
LIMIT 1
`
	var item CourseRef
	if err := repo.db.QueryRowContext(ctx, query, tenantID, name).Scan(&item.ID, &item.Name); err != nil {
		return CourseRef{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) FindQuestionBankByName(ctx context.Context, tenantID int64, name string) (QuestionBankRef, error) {
	const query = `
SELECT id, name, course_id
FROM question_banks
WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL
LIMIT 1
`
	var item QuestionBankRef
	var courseID sql.NullInt64
	if err := repo.db.QueryRowContext(ctx, query, tenantID, name).Scan(&item.ID, &item.Name, &courseID); err != nil {
		return QuestionBankRef{}, wrapNotFound(err)
	}
	if courseID.Valid {
		value := courseID.Int64
		item.CourseID = &value
	}
	return item, nil
}

func (repo *MySQLRepository) CreateQuestionBank(ctx context.Context, bank ImportedQuestionBank) (int64, error) {
	const query = `
INSERT INTO question_banks (tenant_id, owner_org_type, owner_org_id, creator_id, course_id, name, description, status, source_type)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.db.ExecContext(
		ctx,
		query,
		bank.TenantID,
		bank.OwnerOrgType,
		bank.OwnerOrgID,
		bank.CreatorID,
		nullInt64(bank.CourseID),
		bank.Name,
		nullString(bank.Description),
		bank.Status,
		bank.SourceType,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (repo *MySQLRepository) CreateQuestion(ctx context.Context, question ImportedQuestion) (int64, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	const insertQuestion = `
INSERT INTO questions (tenant_id, owner_org_type, owner_org_id, question_type, difficulty, status, source_type, creator_id)
VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
`
	result, err := tx.ExecContext(ctx, insertQuestion, question.TenantID, question.OwnerOrgType, question.OwnerOrgID, question.QuestionType, nullString(question.Difficulty), question.SourceType, question.CreatorID)
	if err != nil {
		return 0, err
	}
	questionID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	contentJSON, err := json.Marshal(question.Content)
	if err != nil {
		return 0, err
	}
	answerJSON, err := json.Marshal(question.Answer)
	if err != nil {
		return 0, err
	}
	analysisJSON, err := nullableJSON(question.Analysis)
	if err != nil {
		return 0, err
	}

	const insertVersion = `
INSERT INTO question_versions (question_id, version_no, content_json, answer_json, analysis_json, structure_hash, change_summary, is_published, created_by)
VALUES (?, 1, ?, ?, ?, ?, '导入创建', 1, ?)
`
	versionResult, err := tx.ExecContext(ctx, insertVersion, questionID, contentJSON, answerJSON, analysisJSON, question.StructureHash, question.CreatorID)
	if err != nil {
		return 0, err
	}
	versionID, err := versionResult.LastInsertId()
	if err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE questions SET current_version_id = ? WHERE id = ? AND tenant_id = ?", versionID, questionID, question.TenantID); err != nil {
		return 0, err
	}

	const insertBankQuestion = `
INSERT INTO question_bank_questions (question_bank_id, question_id)
VALUES (?, ?)
`
	for _, bankID := range question.BankIDs {
		if _, err := tx.ExecContext(ctx, insertBankQuestion, bankID, questionID); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return questionID, nil
}

func scanImportJob(rows *sql.Rows) (ImportJob, error) {
	return scanImportJobScanner(rows)
}

func scanImportJobScanner(scanner interface{ Scan(dest ...any) error }) (ImportJob, error) {
	var item ImportJob
	var fileAssetID sql.NullInt64
	var errorSummary sql.NullString
	var startedAt sql.NullTime
	var finishedAt sql.NullTime
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.ImportType,
		&item.TemplateVersion,
		&fileAssetID,
		&item.FileURL,
		&item.Status,
		&item.TotalRows,
		&item.SuccessRows,
		&item.FailedRows,
		&errorSummary,
		&item.OperatorID,
		&startedAt,
		&finishedAt,
		&item.CreatedAt,
	)
	if err != nil {
		return ImportJob{}, err
	}
	if fileAssetID.Valid {
		value := fileAssetID.Int64
		item.FileAssetID = &value
	}
	if errorSummary.Valid {
		item.ErrorSummary = errorSummary.String
	}
	if startedAt.Valid {
		value := startedAt.Time
		item.StartedAt = &value
	}
	if finishedAt.Valid {
		value := finishedAt.Time
		item.FinishedAt = &value
	}
	return item, nil
}

func scanImportJobRow(rows *sql.Rows) (ImportJobRow, error) {
	var item ImportJobRow
	var rawJSON []byte
	var normalizedJSON []byte
	var errorCode sql.NullString
	var errorMessage sql.NullString
	var targetEntityType sql.NullString
	var targetEntityID sql.NullInt64
	err := rows.Scan(
		&item.ID,
		&item.JobID,
		&item.RowNo,
		&rawJSON,
		&normalizedJSON,
		&item.Status,
		&errorCode,
		&errorMessage,
		&targetEntityType,
		&targetEntityID,
		&item.CreatedAt,
	)
	if err != nil {
		return ImportJobRow{}, err
	}
	if err := unmarshalJSONMap(rawJSON, &item.RawData); err != nil {
		return ImportJobRow{}, err
	}
	if len(normalizedJSON) > 0 {
		if err := unmarshalJSONMap(normalizedJSON, &item.NormalizedData); err != nil {
			return ImportJobRow{}, err
		}
	}
	if errorCode.Valid {
		item.ErrorCode = errorCode.String
	}
	if errorMessage.Valid {
		item.ErrorMessage = errorMessage.String
	}
	if targetEntityType.Valid {
		item.TargetEntityType = targetEntityType.String
	}
	if targetEntityID.Valid {
		value := targetEntityID.Int64
		item.TargetEntityID = &value
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
