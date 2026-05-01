package importjob

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
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

func (repo *MySQLRepository) UpdateJobStatus(ctx context.Context, tenantID int64, id int64, status string, errorSummary string, startedAt *time.Time, finishedAt *time.Time) (ImportJob, error) {
	const query = `
UPDATE import_jobs
SET status = ?, error_summary = ?, started_at = COALESCE(?, started_at), finished_at = COALESCE(?, finished_at)
WHERE id = ? AND tenant_id = ?
`
	result, err := repo.db.ExecContext(ctx, query, status, nullString(errorSummary), nullTime(startedAt), nullTime(finishedAt), id, tenantID)
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
	return repo.GetJob(ctx, tenantID, id)
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

func (repo *MySQLRepository) UpsertOrgStructure(ctx context.Context, item ImportedOrgStructure) (ImportTarget, map[string]any, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	defer tx.Rollback()

	schoolID, err := repo.upsertSchoolTx(ctx, tx, item)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	target := ImportTarget{EntityType: TargetSchool, EntityID: schoolID}
	normalized := cloneNormalizedData(item.NormalizedData)
	normalized["school_id"] = schoolID

	if item.GradeCode != "" {
		gradeID, err := repo.upsertGradeTx(ctx, tx, item, schoolID)
		if err != nil {
			return ImportTarget{}, nil, err
		}
		target = ImportTarget{EntityType: TargetGrade, EntityID: gradeID}
		normalized["grade_id"] = gradeID
		if item.ClassCode != "" {
			classID, err := repo.upsertClassTx(ctx, tx, item, schoolID, gradeID)
			if err != nil {
				return ImportTarget{}, nil, err
			}
			target = ImportTarget{EntityType: TargetClass, EntityID: classID}
			normalized["class_id"] = classID
		}
	}
	if err := tx.Commit(); err != nil {
		return ImportTarget{}, nil, err
	}
	return target, normalized, nil
}

func (repo *MySQLRepository) UpsertCourse(ctx context.Context, item ImportedCourse) (ImportTarget, map[string]any, error) {
	const query = `
INSERT INTO courses (tenant_id, code, name, start_at, end_at, status, description)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE name = VALUES(name), start_at = VALUES(start_at), end_at = VALUES(end_at), status = VALUES(status), description = VALUES(description), deleted_at = NULL
`
	if _, err := repo.db.ExecContext(ctx, query, item.TenantID, item.Code, item.Name, nullTime(item.StartAt), nullTime(item.EndAt), item.Status, nullString(item.Description)); err != nil {
		return ImportTarget{}, nil, err
	}
	course, err := repo.findCourseByCode(ctx, item.TenantID, item.Code)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	normalized := cloneNormalizedData(item.NormalizedData)
	normalized["course_id"] = course.ID
	return ImportTarget{EntityType: TargetCourse, EntityID: course.ID}, normalized, nil
}

func (repo *MySQLRepository) FindRoleIDsByCodes(ctx context.Context, tenantID int64, codes []string) ([]int64, error) {
	codes = normalizeCodeList(codes)
	if len(codes) == 0 {
		return []int64{}, nil
	}
	query := fmt.Sprintf(`
SELECT code, id
FROM roles
WHERE tenant_id = ? AND status = 'active' AND code IN (%s)
`, placeholders(len(codes)))
	args := make([]any, 0, len(codes)+1)
	args = append(args, tenantID)
	for _, code := range codes {
		args = append(args, code)
	}
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	idByCode := make(map[string]int64, len(codes))
	for rows.Next() {
		var code string
		var id int64
		if err := rows.Scan(&code, &id); err != nil {
			return nil, err
		}
		idByCode[code] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(codes))
	for _, code := range codes {
		id, ok := idByCode[code]
		if !ok {
			return nil, ErrNotFound
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (repo *MySQLRepository) UpsertUser(ctx context.Context, user ImportedUser) (ImportTarget, map[string]any, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	defer tx.Rollback()

	userID, exists, err := repo.findUserIDByUsernameTx(ctx, tx, user.TenantID, user.Username)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	if exists {
		query := `UPDATE users SET phone = ?, email = ?, display_name = ?, user_type = ?, status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
		args := []any{nullString(user.Phone), nullString(user.Email), user.DisplayName, user.UserType, user.Status, userID, user.TenantID}
		if user.ResetPassword {
			query = `UPDATE users SET phone = ?, email = ?, display_name = ?, user_type = ?, status = ?, password_hash = ?, must_change_password = 1 WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
			args = []any{nullString(user.Phone), nullString(user.Email), user.DisplayName, user.UserType, user.Status, user.PasswordHash, userID, user.TenantID}
		}
		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return ImportTarget{}, nil, err
		}
	} else {
		result, err := tx.ExecContext(
			ctx,
			`INSERT INTO users (tenant_id, username, phone, email, password_hash, display_name, user_type, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
			user.TenantID,
			user.Username,
			nullString(user.Phone),
			nullString(user.Email),
			user.PasswordHash,
			user.DisplayName,
			user.UserType,
			user.Status,
		)
		if err != nil {
			return ImportTarget{}, nil, err
		}
		userID, err = result.LastInsertId()
		if err != nil {
			return ImportTarget{}, nil, err
		}
	}
	if !exists || len(user.RoleCodes) > 0 {
		if err := repo.syncUserRolesTx(ctx, tx, user.TenantID, userID, user.RoleIDs); err != nil {
			return ImportTarget{}, nil, err
		}
	}

	normalized := cloneNormalizedData(user.NormalizedData)
	normalized["user_id"] = userID
	normalized["user_type"] = user.UserType

	switch user.UserType {
	case "teacher":
		if err := repo.upsertTeacherProfileAndAssignmentsTx(ctx, tx, user, userID, normalized); err != nil {
			return ImportTarget{}, nil, err
		}
	case "student":
		if err := repo.upsertStudentProfileAndMembershipTx(ctx, tx, user, userID, normalized); err != nil {
			return ImportTarget{}, nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return ImportTarget{}, nil, err
	}
	return ImportTarget{EntityType: TargetUser, EntityID: userID}, normalized, nil
}

func (repo *MySQLRepository) UpsertExamPaperQuestion(ctx context.Context, item ImportedExamPaperQuestion) (ImportTarget, map[string]any, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	defer tx.Rollback()

	versionID, err := repo.resolveQuestionVersionIDTx(ctx, tx, item.TenantID, item.QuestionID, item.QuestionVersionID)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	paperID, err := repo.ensureExamPaperTx(ctx, tx, item)
	if err != nil {
		return ImportTarget{}, nil, err
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO exam_paper_questions (paper_id, question_id, question_version_id, score, order_no) VALUES (?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE question_id = VALUES(question_id), question_version_id = VALUES(question_version_id), score = VALUES(score)`,
		paperID,
		item.QuestionID,
		versionID,
		formatDecimal(item.Score),
		item.DisplayOrder,
	); err != nil {
		return ImportTarget{}, nil, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE exam_papers SET total_score = (SELECT COALESCE(SUM(score), 0) FROM exam_paper_questions WHERE paper_id = ?), status = ? WHERE id = ? AND tenant_id = ?`, paperID, item.Status, paperID, item.TenantID); err != nil {
		return ImportTarget{}, nil, err
	}
	if err := tx.Commit(); err != nil {
		return ImportTarget{}, nil, err
	}
	normalized := cloneNormalizedData(item.NormalizedData)
	normalized["paper_id"] = paperID
	normalized["question_version_id"] = versionID
	return ImportTarget{EntityType: TargetExamPaper, EntityID: paperID}, normalized, nil
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
	for _, tagName := range normalizeTagNames(question.SystemTags) {
		tagID, err := repo.ensureSystemTag(ctx, tx, question.TenantID, tagName)
		if err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)", questionID, tagID); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return questionID, nil
}

func (repo *MySQLRepository) RollbackJob(ctx context.Context, tenantID int64, id int64, rows []ImportJobRow) (ImportJob, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportJob{}, err
	}
	defer tx.Rollback()

	for index := len(rows) - 1; index >= 0; index-- {
		row := rows[index]
		if row.TargetEntityID == nil {
			continue
		}
		switch row.TargetEntityType {
		case TargetQuestion:
			if _, err := tx.ExecContext(ctx, `UPDATE questions SET status = 'disabled', deleted_at = NOW(3) WHERE id = ? AND tenant_id = ? AND source_type = ? AND deleted_at IS NULL`, *row.TargetEntityID, tenantID, SourceTypeImport); err != nil {
				return ImportJob{}, err
			}
		case TargetQuestionBank:
			if _, err := tx.ExecContext(ctx, `UPDATE question_banks SET status = 'disabled', deleted_at = NOW(3) WHERE id = ? AND tenant_id = ? AND source_type = ? AND deleted_at IS NULL`, *row.TargetEntityID, tenantID, SourceTypeImport); err != nil {
				return ImportJob{}, err
			}
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE import_jobs SET status = ?, finished_at = NOW(3) WHERE id = ? AND tenant_id = ?`, StatusRolledBack, id, tenantID)
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
	if err := tx.Commit(); err != nil {
		return ImportJob{}, err
	}
	return repo.GetJob(ctx, tenantID, id)
}

func (repo *MySQLRepository) ensureSystemTag(ctx context.Context, tx *sql.Tx, tenantID int64, name string) (int64, error) {
	const selectQuery = `
SELECT id
FROM tags
WHERE tenant_id = ? AND tag_type = 'system' AND owner_user_id IS NULL AND name = ? AND status = 'active'
LIMIT 1
`
	var id int64
	err := tx.QueryRowContext(ctx, selectQuery, tenantID, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	const insertQuery = `
INSERT INTO tags (tenant_id, tag_type, owner_user_id, name, status)
VALUES (?, 'system', NULL, ?, 'active')
`
	result, err := tx.ExecContext(ctx, insertQuery, tenantID, name)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (repo *MySQLRepository) upsertSchoolTx(ctx context.Context, tx *sql.Tx, item ImportedOrgStructure) (int64, error) {
	const query = `
INSERT INTO schools (tenant_id, object_type, code, name, status)
VALUES (?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE object_type = VALUES(object_type), name = VALUES(name), status = VALUES(status), deleted_at = NULL
`
	if _, err := tx.ExecContext(ctx, query, item.TenantID, item.ObjectType, item.SchoolCode, item.SchoolName, item.Status); err != nil {
		return 0, err
	}
	return repo.findSchoolIDByCodeTx(ctx, tx, item.TenantID, item.SchoolCode)
}

func (repo *MySQLRepository) upsertGradeTx(ctx context.Context, tx *sql.Tx, item ImportedOrgStructure, schoolID int64) (int64, error) {
	const query = `
INSERT INTO grades (tenant_id, school_id, code, name, grade_level, school_year, status)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE name = VALUES(name), grade_level = VALUES(grade_level), school_year = VALUES(school_year), status = VALUES(status), deleted_at = NULL
`
	if _, err := tx.ExecContext(ctx, query, item.TenantID, schoolID, item.GradeCode, item.GradeName, item.GradeLevel, nullString(item.SchoolYear), item.Status); err != nil {
		return 0, err
	}
	return repo.findGradeIDByCodeTx(ctx, tx, item.TenantID, schoolID, item.GradeCode)
}

func (repo *MySQLRepository) upsertClassTx(ctx context.Context, tx *sql.Tx, item ImportedOrgStructure, schoolID int64, gradeID int64) (int64, error) {
	const query = `
INSERT INTO classes (tenant_id, school_id, grade_id, code, name, class_no, status)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), name = VALUES(name), class_no = VALUES(class_no), status = VALUES(status), deleted_at = NULL
`
	if _, err := tx.ExecContext(ctx, query, item.TenantID, schoolID, gradeID, item.ClassCode, item.ClassName, nullInt(item.ClassNo), item.Status); err != nil {
		return 0, err
	}
	return repo.findClassIDByCodeTx(ctx, tx, item.TenantID, gradeID, item.ClassCode)
}

func (repo *MySQLRepository) upsertTeacherProfileAndAssignmentsTx(ctx context.Context, tx *sql.Tx, user ImportedUser, userID int64, normalized map[string]any) error {
	schoolID, err := repo.findSchoolIDByCodeTx(ctx, tx, user.TenantID, user.SchoolCode)
	if err != nil {
		return err
	}
	normalized["school_id"] = schoolID
	employmentStatus := "active"
	if user.Status == "disabled" {
		employmentStatus = "left"
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO teacher_profiles (user_id, tenant_id, school_id, teacher_no, employment_status, hired_at) VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), teacher_no = VALUES(teacher_no), employment_status = VALUES(employment_status), hired_at = COALESCE(VALUES(hired_at), hired_at)`,
		userID,
		user.TenantID,
		schoolID,
		user.TeacherNo,
		employmentStatus,
		nullTime(user.EffectiveAt),
	); err != nil {
		return err
	}
	if user.ClassCode == "" && user.CourseCode == "" && !user.IsHeadTeacher {
		return nil
	}
	gradeID, err := repo.findGradeIDByCodeTx(ctx, tx, user.TenantID, schoolID, user.GradeCode)
	if err != nil {
		return err
	}
	classID, err := repo.findClassIDByCodeTx(ctx, tx, user.TenantID, gradeID, user.ClassCode)
	if err != nil {
		return err
	}
	normalized["grade_id"] = gradeID
	normalized["class_id"] = classID
	effectiveAt := time.Now()
	if user.EffectiveAt != nil {
		effectiveAt = *user.EffectiveAt
	}
	if user.CourseCode != "" {
		course, err := repo.findCourseByCodeTx(ctx, tx, user.TenantID, user.CourseCode)
		if err != nil {
			return err
		}
		normalized["course_id"] = course.ID
		if err := repo.ensureTeacherCourseAssignmentTx(ctx, tx, user.TenantID, userID, schoolID, gradeID, classID, course.ID, effectiveAt); err != nil {
			return err
		}
	}
	if user.IsHeadTeacher {
		if err := repo.ensureHeadTeacherAssignmentTx(ctx, tx, user.TenantID, userID, schoolID, gradeID, classID, effectiveAt); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) upsertStudentProfileAndMembershipTx(ctx context.Context, tx *sql.Tx, user ImportedUser, userID int64, normalized map[string]any) error {
	schoolID, err := repo.findSchoolIDByCodeTx(ctx, tx, user.TenantID, user.SchoolCode)
	if err != nil {
		return err
	}
	gradeID, err := repo.findGradeIDByCodeTx(ctx, tx, user.TenantID, schoolID, user.GradeCode)
	if err != nil {
		return err
	}
	classID, err := repo.findClassIDByCodeTx(ctx, tx, user.TenantID, gradeID, user.ClassCode)
	if err != nil {
		return err
	}
	normalized["school_id"] = schoolID
	normalized["grade_id"] = gradeID
	normalized["class_id"] = classID
	enrollmentStatus := "active"
	if user.Status == "disabled" {
		enrollmentStatus = "left"
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO student_profiles (user_id, tenant_id, school_id, student_no, enrollment_status, entered_at) VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), student_no = VALUES(student_no), enrollment_status = VALUES(enrollment_status), entered_at = COALESCE(VALUES(entered_at), entered_at)`,
		userID,
		user.TenantID,
		schoolID,
		user.StudentNo,
		enrollmentStatus,
		nullTime(user.EffectiveAt),
	); err != nil {
		return err
	}
	joinedAt := time.Now()
	if user.EffectiveAt != nil {
		joinedAt = *user.EffectiveAt
	}
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE student_class_memberships SET is_current = 0, status = 'inactive', left_at = COALESCE(left_at, ?) WHERE tenant_id = ? AND student_id = ? AND is_current = 1 AND status = 'active' AND class_id <> ?`,
		joinedAt,
		user.TenantID,
		userID,
		classID,
	); err != nil {
		return err
	}
	var membershipID int64
	err = tx.QueryRowContext(
		ctx,
		`SELECT id FROM student_class_memberships WHERE tenant_id = ? AND student_id = ? AND class_id = ? AND is_current = 1 AND status = 'active' LIMIT 1`,
		user.TenantID,
		userID,
		classID,
	).Scan(&membershipID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO student_class_memberships (tenant_id, student_id, school_id, grade_id, class_id, is_current, status, joined_at, created_by) VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?)`,
		user.TenantID,
		userID,
		schoolID,
		gradeID,
		classID,
		joinedAt,
		nil,
	)
	return err
}

func (repo *MySQLRepository) ensureTeacherCourseAssignmentTx(ctx context.Context, tx *sql.Tx, tenantID int64, teacherID int64, schoolID int64, gradeID int64, classID int64, courseID int64, effectiveAt time.Time) error {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		`SELECT id FROM teacher_class_course_assignments WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ? AND is_current = 1 AND status = 'active' LIMIT 1`,
		tenantID,
		teacherID,
		classID,
		courseID,
	).Scan(&id)
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO teacher_class_course_assignments (tenant_id, teacher_id, school_id, grade_id, class_id, course_id, is_current, status, effective_from) VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?)`,
		tenantID,
		teacherID,
		schoolID,
		gradeID,
		classID,
		courseID,
		effectiveAt,
	)
	return err
}

func (repo *MySQLRepository) ensureHeadTeacherAssignmentTx(ctx context.Context, tx *sql.Tx, tenantID int64, teacherID int64, schoolID int64, gradeID int64, classID int64, effectiveAt time.Time) error {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		`SELECT id FROM class_head_teacher_assignments WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND is_current = 1 AND status = 'active' LIMIT 1`,
		tenantID,
		teacherID,
		classID,
	).Scan(&id)
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO class_head_teacher_assignments (tenant_id, teacher_id, school_id, grade_id, class_id, is_current, status, effective_from) VALUES (?, ?, ?, ?, ?, 1, 'active', ?)`,
		tenantID,
		teacherID,
		schoolID,
		gradeID,
		classID,
		effectiveAt,
	)
	return err
}

func (repo *MySQLRepository) findSchoolIDByCodeTx(ctx context.Context, tx *sql.Tx, tenantID int64, code string) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM schools WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1`, tenantID, code).Scan(&id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrMissingSchool
		}
		return 0, err
	}
	return id, nil
}

func (repo *MySQLRepository) findGradeIDByCodeTx(ctx context.Context, tx *sql.Tx, tenantID int64, schoolID int64, code string) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM grades WHERE tenant_id = ? AND school_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1`, tenantID, schoolID, code).Scan(&id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrMissingGrade
		}
		return 0, err
	}
	return id, nil
}

func (repo *MySQLRepository) findClassIDByCodeTx(ctx context.Context, tx *sql.Tx, tenantID int64, gradeID int64, code string) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM classes WHERE tenant_id = ? AND grade_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1`, tenantID, gradeID, code).Scan(&id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrMissingClass
		}
		return 0, err
	}
	return id, nil
}

func (repo *MySQLRepository) findCourseByCode(ctx context.Context, tenantID int64, code string) (CourseRef, error) {
	const query = `SELECT id, name FROM courses WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1`
	var item CourseRef
	if err := repo.db.QueryRowContext(ctx, query, tenantID, code).Scan(&item.ID, &item.Name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return CourseRef{}, ErrMissingCourse
		}
		return CourseRef{}, err
	}
	return item, nil
}

func (repo *MySQLRepository) findCourseByCodeTx(ctx context.Context, tx *sql.Tx, tenantID int64, code string) (CourseRef, error) {
	const query = `SELECT id, name FROM courses WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1`
	var item CourseRef
	if err := tx.QueryRowContext(ctx, query, tenantID, code).Scan(&item.ID, &item.Name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return CourseRef{}, ErrMissingCourse
		}
		return CourseRef{}, err
	}
	return item, nil
}

func (repo *MySQLRepository) findUserIDByUsernameTx(ctx context.Context, tx *sql.Tx, tenantID int64, username string) (int64, bool, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM users WHERE tenant_id = ? AND username = ? AND deleted_at IS NULL LIMIT 1`, tenantID, username).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	return 0, false, err
}

func (repo *MySQLRepository) syncUserRolesTx(ctx context.Context, tx *sql.Tx, tenantID int64, userID int64, roleIDs []int64) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_roles WHERE tenant_id = ? AND user_id = ?`, tenantID, userID); err != nil {
		return err
	}
	for _, roleID := range roleIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES (?, ?, ?)`, tenantID, userID, roleID); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) resolveQuestionVersionIDTx(ctx context.Context, tx *sql.Tx, tenantID int64, questionID int64, versionID *int64) (int64, error) {
	if versionID != nil {
		var id int64
		err := tx.QueryRowContext(
			ctx,
			`SELECT qv.id FROM question_versions qv JOIN questions q ON q.id = qv.question_id WHERE q.tenant_id = ? AND q.id = ? AND qv.id = ? AND q.deleted_at IS NULL LIMIT 1`,
			tenantID,
			questionID,
			*versionID,
		).Scan(&id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return 0, ErrMissingQuestion
			}
			return 0, err
		}
		return id, nil
	}
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT current_version_id FROM questions WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL AND current_version_id IS NOT NULL LIMIT 1`, tenantID, questionID).Scan(&id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrMissingQuestion
		}
		return 0, err
	}
	return id, nil
}

func (repo *MySQLRepository) ensureExamPaperTx(ctx context.Context, tx *sql.Tx, item ImportedExamPaperQuestion) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM exam_papers WHERE tenant_id = ? AND paper_name = ? LIMIT 1`, item.TenantID, item.PaperName).Scan(&id)
	if err == nil {
		if _, err := tx.ExecContext(ctx, `UPDATE exam_papers SET paper_type = ?, source_type = ?, status = ? WHERE id = ? AND tenant_id = ?`, item.PaperType, SourceTypeImport, item.Status, id, item.TenantID); err != nil {
			return 0, err
		}
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	result, err := tx.ExecContext(
		ctx,
		`INSERT INTO exam_papers (tenant_id, creator_id, paper_type, paper_name, source_type, status, total_score) VALUES (?, ?, ?, ?, ?, ?, 0)`,
		item.TenantID,
		item.CreatorID,
		item.PaperType,
		item.PaperName,
		SourceTypeImport,
		item.Status,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func normalizeTagNames(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		name := strings.TrimSpace(value)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		result = append(result, name)
	}
	return result
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

func nullInt(value *int) any {
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

func nullTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}

func cloneNormalizedData(value map[string]any) map[string]any {
	result := make(map[string]any, len(value)+4)
	for key, item := range value {
		result[key] = item
	}
	return result
}

func normalizeCodeList(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		code := strings.TrimSpace(value)
		if code == "" {
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		result = append(result, code)
	}
	return result
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

func formatDecimal(value float64) string {
	return fmt.Sprintf("%.2f", value)
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
