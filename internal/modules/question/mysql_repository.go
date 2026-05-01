package question

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

type sqlExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type challengeReviewTarget struct {
	TenantID         int64
	QuestionID       int64
	ChallengerUserID int64
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListQuestions(ctx context.Context, scope Scope, filter QuestionListFilter) (PageResult[Question], error) {
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
  qv.version_no,
  qv.content_json
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.deleted_at IS NULL
`
	args := make([]any, 0, 8)
	if accessSQL, accessArgs := buildQuestionAccessCondition("q", scope); accessSQL != "" {
		query += accessSQL
		args = append(args, accessArgs...)
	}
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
 AND (
  EXISTS (
    SELECT 1
    FROM question_course_bindings qcb
    WHERE qcb.question_id = q.id AND qcb.tenant_id = q.tenant_id AND qcb.course_id = ?
  )
  OR EXISTS (
    SELECT 1
    FROM question_bank_questions qbq
    JOIN question_banks qb ON qb.id = qbq.question_bank_id
    WHERE qbq.question_id = q.id AND qb.tenant_id = q.tenant_id AND qb.deleted_at IS NULL AND qb.course_id = ?
  )
 )
`
		args = append(args, *filter.CourseID, *filter.CourseID)
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
	if err := repo.fillCourseIDs(ctx, items); err != nil {
		return PageResult[Question]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetQuestion(ctx context.Context, scope Scope, id int64) (Question, error) {
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
  qv.version_no,
  qv.content_json
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.id = ? AND q.deleted_at IS NULL
`
	args := []any{id}
	if accessSQL, accessArgs := buildQuestionAccessCondition("q", scope); accessSQL != "" {
		query += accessSQL
		args = append(args, accessArgs...)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	item, err := scanQuestionScanner(row)
	if err != nil {
		return Question{}, wrapNotFound(err)
	}
	return repo.getQuestionWithBanks(ctx, item.TenantID, id)
}

func (repo *MySQLRepository) CreateQuestion(ctx context.Context, question Question, version QuestionVersion, bankIDs []int64, courseIDs []int64) (Question, error) {
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

	if err := repo.insertQuestionBanks(ctx, tx, question.TenantID, questionID, bankIDs); err != nil {
		return Question{}, err
	}
	if err := repo.insertQuestionCourses(ctx, tx, question.TenantID, questionID, courseIDs); err != nil {
		return Question{}, err
	}

	if err := tx.Commit(); err != nil {
		return Question{}, err
	}
	return repo.GetQuestion(ctx, Scope{TenantID: question.TenantID, UserType: "sys_admin"}, questionID)
}

func (repo *MySQLRepository) UpdateQuestion(ctx context.Context, question Question, bankIDs []int64, courseIDs []int64) (Question, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return Question{}, err
	}
	defer tx.Rollback()

	const query = `
UPDATE questions
SET difficulty = ?, status = ?
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	result, err := tx.ExecContext(ctx, query, nullString(question.Difficulty), question.Status, question.ID, question.TenantID)
	if err != nil {
		return Question{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Question{}, err
	}
	if rowsAffected == 0 {
		return Question{}, ErrNotFound
	}
	if bankIDs != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM question_bank_questions WHERE question_id = ?`, question.ID); err != nil {
			return Question{}, err
		}
		if err := repo.insertQuestionBanks(ctx, tx, question.TenantID, question.ID, bankIDs); err != nil {
			return Question{}, err
		}
	}
	if courseIDs != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM question_course_bindings WHERE question_id = ? AND tenant_id = ?`, question.ID, question.TenantID); err != nil {
			return Question{}, err
		}
		if err := repo.insertQuestionCourses(ctx, tx, question.TenantID, question.ID, courseIDs); err != nil {
			return Question{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Question{}, err
	}
	return repo.GetQuestion(ctx, Scope{TenantID: question.TenantID, UserType: "sys_admin"}, question.ID)
}

func (repo *MySQLRepository) ListVersions(ctx context.Context, tenantID int64, questionID int64) ([]QuestionVersion, error) {
	if _, err := repo.GetQuestion(ctx, Scope{TenantID: tenantID, UserType: "sys_admin"}, questionID); err != nil {
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
	updatedQuestion, err := repo.GetQuestion(ctx, Scope{TenantID: tenantID, UserType: "sys_admin"}, questionID)
	if err != nil {
		return QuestionVersion{}, Question{}, err
	}
	return createdVersion, updatedQuestion, nil
}

func (repo *MySQLRepository) SetQuestionTags(ctx context.Context, tenantID int64, questionID int64, tagIDs []int64, tagNames []string) error {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := repo.getQuestionForUpdate(ctx, tx, tenantID, questionID); err != nil {
		return err
	}

	resolvedIDs := make([]int64, 0, len(tagIDs)+len(tagNames))
	if len(tagIDs) > 0 {
		if err := repo.ensureSystemTagIDs(ctx, tx, tenantID, tagIDs); err != nil {
			return err
		}
		resolvedIDs = append(resolvedIDs, tagIDs...)
	}
	for _, name := range tagNames {
		tagID, err := repo.ensureSystemTag(ctx, tx, tenantID, name)
		if err != nil {
			return err
		}
		resolvedIDs = append(resolvedIDs, tagID)
	}
	resolvedIDs = normalizeIDs(resolvedIDs)

	if _, err := tx.ExecContext(ctx, `DELETE FROM question_tags WHERE question_id = ?`, questionID); err != nil {
		return err
	}
	const insertQuery = `
INSERT INTO question_tags (question_id, tag_id)
VALUES (?, ?)
`
	for _, tagID := range resolvedIDs {
		if _, err := tx.ExecContext(ctx, insertQuery, questionID, tagID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (repo *MySQLRepository) CreateComment(ctx context.Context, tenantID int64, questionID int64, userID int64, input QuestionCommentInput) error {
	if err := repo.ensureQuestionVersion(ctx, questionID, input.QuestionVersionID); err != nil {
		return err
	}
	if input.ParentCommentID != nil {
		if err := repo.ensureParentComment(ctx, tenantID, questionID, *input.ParentCommentID); err != nil {
			return err
		}
	}

	const query = `
INSERT INTO question_comments (
  tenant_id,
  question_id,
  question_version_id,
  user_id,
  parent_comment_id,
  comment_type,
  is_private,
  content,
  status
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	_, err := repo.db.ExecContext(
		ctx,
		query,
		tenantID,
		questionID,
		input.QuestionVersionID,
		userID,
		nullInt64(input.ParentCommentID),
		input.CommentType,
		input.IsPrivate,
		input.Content,
		StatusActive,
	)
	return err
}

func (repo *MySQLRepository) CreateChallenge(ctx context.Context, challenge QuestionChallenge) error {
	if err := repo.ensureQuestionVersion(ctx, challenge.QuestionID, challenge.QuestionVersionID); err != nil {
		return err
	}
	attachmentsJSON, err := nullableAttachmentJSON(challenge.Attachments)
	if err != nil {
		return err
	}

	const query = `
INSERT INTO question_challenges (
  tenant_id,
  question_id,
  question_version_id,
  challenger_user_id,
  challenger_org_type,
  challenger_org_id,
  challenge_type,
  description,
  attachments_json,
  status
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	_, err = repo.db.ExecContext(
		ctx,
		query,
		challenge.TenantID,
		challenge.QuestionID,
		challenge.QuestionVersionID,
		challenge.ChallengerUserID,
		challenge.ChallengerOrgType,
		challenge.ChallengerOrgID,
		challenge.ChallengeType,
		challenge.Description,
		attachmentsJSON,
		challenge.Status,
	)
	return err
}

func (repo *MySQLRepository) ListChallenges(ctx context.Context, scope Scope, filter QuestionChallengeListFilter) (PageResult[QuestionChallengeListItem], error) {
	query := challengeListSelectSQL() + `
WHERE q.deleted_at IS NULL
`
	args := make([]any, 0, 4)
	if scope.TenantID > 0 {
		query += " AND qc.tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	if filter.Status != "" {
		query += " AND qc.status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY qc.created_at DESC, qc.id DESC"

	items, err := repo.queryChallenges(ctx, query, args...)
	if err != nil {
		return PageResult[QuestionChallengeListItem]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) UpdateChallengeReview(ctx context.Context, scope Scope, id int64, input QuestionChallengeReviewInput) (QuestionChallengeListItem, error) {
	if input.NewVersion != nil {
		return repo.updateChallengeReviewWithNewVersion(ctx, scope, id, input)
	}

	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	defer tx.Rollback()

	target, err := repo.getChallengeReviewTargetForUpdate(ctx, tx, scope, id)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	if input.ResolvedVersionID != nil {
		if err := repo.ensureQuestionVersionTx(ctx, tx, target.QuestionID, *input.ResolvedVersionID); err != nil {
			return QuestionChallengeListItem{}, err
		}
	}

	query := `
UPDATE question_challenges
SET status = ?, reviewed_by = ?, reviewed_at = NOW(3), review_comment = ?, resolved_version_id = ?
WHERE id = ?
`
	args := []any{input.Status, scope.UserID, nullString(input.ReviewComment), nullInt64(input.ResolvedVersionID), id}
	if scope.TenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	if rowsAffected == 0 {
		return QuestionChallengeListItem{}, ErrNotFound
	}
	if err := insertChallengeReviewNotification(ctx, tx, target, id, input); err != nil {
		return QuestionChallengeListItem{}, err
	}
	if err := tx.Commit(); err != nil {
		return QuestionChallengeListItem{}, err
	}
	return repo.getChallengeByID(ctx, scope, id)
}

func (repo *MySQLRepository) updateChallengeReviewWithNewVersion(ctx context.Context, scope Scope, id int64, input QuestionChallengeReviewInput) (QuestionChallengeListItem, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	defer tx.Rollback()

	target, err := repo.getChallengeReviewTargetForUpdate(ctx, tx, scope, id)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	current, err := repo.getQuestionForUpdate(ctx, tx, target.TenantID, target.QuestionID)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}

	var currentVersionNo int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(version_no), 0) FROM question_versions WHERE question_id = ?", target.QuestionID).Scan(&currentVersionNo); err != nil {
		return QuestionChallengeListItem{}, err
	}
	versionNo := currentVersionNo + 1
	versionID, err := repo.insertVersion(ctx, tx, target.QuestionID, QuestionVersion{
		Content:       input.NewVersion.Content,
		Answer:        input.NewVersion.Answer,
		Analysis:      input.NewVersion.Analysis,
		StructureHash: buildStructureHash(current.QuestionType, input.NewVersion.Content, input.NewVersion.Answer),
		ChangeSummary: input.NewVersion.ChangeSummary,
		IsPublished:   true,
		CreatedBy:     scope.UserID,
	}, versionNo)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}

	if _, err := tx.ExecContext(ctx, "UPDATE questions SET current_version_id = ? WHERE id = ? AND tenant_id = ?", versionID, target.QuestionID, target.TenantID); err != nil {
		return QuestionChallengeListItem{}, err
	}

	query := `
UPDATE question_challenges
SET status = ?, reviewed_by = ?, reviewed_at = NOW(3), review_comment = ?, resolved_version_id = ?
WHERE id = ?
`
	args := []any{input.Status, scope.UserID, nullString(input.ReviewComment), versionID, id}
	if scope.TenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	if rowsAffected == 0 {
		return QuestionChallengeListItem{}, ErrNotFound
	}
	if err := insertChallengeReviewNotification(ctx, tx, target, id, input); err != nil {
		return QuestionChallengeListItem{}, err
	}
	if err := tx.Commit(); err != nil {
		return QuestionChallengeListItem{}, err
	}
	return repo.getChallengeByID(ctx, scope, id)
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

func (repo *MySQLRepository) insertQuestionBanks(ctx context.Context, tx *sql.Tx, tenantID int64, questionID int64, bankIDs []int64) error {
	if len(bankIDs) == 0 {
		return nil
	}
	const query = `
INSERT INTO question_bank_questions (question_bank_id, question_id)
SELECT id, ?
FROM question_banks
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	for _, bankID := range bankIDs {
		result, err := tx.ExecContext(ctx, query, questionID, bankID, tenantID)
		if err != nil {
			return err
		}
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if rowsAffected == 0 {
			return ErrInvalidInput
		}
	}
	return nil
}

func (repo *MySQLRepository) insertQuestionCourses(ctx context.Context, tx *sql.Tx, tenantID int64, questionID int64, courseIDs []int64) error {
	if len(courseIDs) == 0 {
		return nil
	}
	const query = `
INSERT INTO question_course_bindings (tenant_id, question_id, course_id)
VALUES (?, ?, ?)
`
	for _, courseID := range courseIDs {
		if _, err := tx.ExecContext(ctx, query, tenantID, questionID, courseID); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) ensureQuestionVersion(ctx context.Context, questionID int64, versionID int64) error {
	const query = `
SELECT id
FROM question_versions
WHERE id = ? AND question_id = ?
LIMIT 1
`
	var id int64
	err := repo.db.QueryRowContext(ctx, query, versionID, questionID).Scan(&id)
	return wrapNotFound(err)
}

func (repo *MySQLRepository) ensureParentComment(ctx context.Context, tenantID int64, questionID int64, parentCommentID int64) error {
	const query = `
SELECT id
FROM question_comments
WHERE id = ? AND tenant_id = ? AND question_id = ? AND status <> 'deleted'
LIMIT 1
`
	var id int64
	err := repo.db.QueryRowContext(ctx, query, parentCommentID, tenantID, questionID).Scan(&id)
	return wrapNotFound(err)
}

func (repo *MySQLRepository) ensureChallengeResolvedVersion(ctx context.Context, scope Scope, challengeID int64, versionID int64) error {
	query := `
SELECT qv.id
FROM question_versions qv
JOIN question_challenges qc ON qc.question_id = qv.question_id
WHERE qv.id = ? AND qc.id = ?
`
	args := []any{versionID, challengeID}
	if scope.TenantID > 0 {
		query += " AND qc.tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	query += " LIMIT 1"
	var id int64
	err := repo.db.QueryRowContext(ctx, query, args...).Scan(&id)
	return wrapNotFound(err)
}

func (repo *MySQLRepository) ensureQuestionVersionTx(ctx context.Context, tx *sql.Tx, questionID int64, versionID int64) error {
	const query = `
SELECT id
FROM question_versions
WHERE id = ? AND question_id = ?
LIMIT 1
`
	var id int64
	err := tx.QueryRowContext(ctx, query, versionID, questionID).Scan(&id)
	return wrapNotFound(err)
}

func (repo *MySQLRepository) ensureSystemTagIDs(ctx context.Context, tx *sql.Tx, tenantID int64, tagIDs []int64) error {
	if len(tagIDs) == 0 {
		return nil
	}
	args := make([]any, 0, len(tagIDs)+2)
	args = append(args, tenantID, TagTypeSystem)
	for _, id := range tagIDs {
		args = append(args, id)
	}
	query := `
SELECT COUNT(*)
FROM tags
WHERE tenant_id = ? AND tag_type = ? AND owner_user_id IS NULL AND status = 'active' AND id IN (` + placeholders(len(tagIDs)) + `)
`
	var count int
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return err
	}
	if count != len(tagIDs) {
		return ErrNotFound
	}
	return nil
}

func (repo *MySQLRepository) ensureSystemTag(ctx context.Context, tx *sql.Tx, tenantID int64, name string) (int64, error) {
	const selectQuery = `
SELECT id
FROM tags
WHERE tenant_id = ? AND tag_type = ? AND owner_user_id IS NULL AND name = ? AND status = 'active'
LIMIT 1
`
	var id int64
	err := tx.QueryRowContext(ctx, selectQuery, tenantID, TagTypeSystem, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	const insertQuery = `
INSERT INTO tags (tenant_id, tag_type, owner_user_id, name, status)
VALUES (?, ?, NULL, ?, ?)
`
	result, err := tx.ExecContext(ctx, insertQuery, tenantID, TagTypeSystem, name, TagStatusActive)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func insertChallengeReviewNotification(ctx context.Context, exec sqlExecutor, target challengeReviewTarget, challengeID int64, input QuestionChallengeReviewInput) error {
	if target.TenantID <= 0 || target.ChallengerUserID <= 0 {
		return nil
	}
	content := "你提交的题目质疑已处理，处理结果：" + challengeStatusLabel(input.Status)
	if strings.TrimSpace(input.ReviewComment) != "" {
		content += "。审核意见：" + strings.TrimSpace(input.ReviewComment)
	}
	const query = `
INSERT INTO notifications (tenant_id, recipient_user_id, category, title, content, source_type, source_id, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`
	_, err := exec.ExecContext(ctx, query, target.TenantID, target.ChallengerUserID, "notice", "题目质疑已处理", content, "question_challenge", challengeID, "unread")
	return err
}

func challengeStatusLabel(status string) string {
	switch status {
	case StatusAccepted:
		return "已采纳"
	case StatusRejected:
		return "已驳回"
	case StatusResolved:
		return "已解决"
	case StatusMerged:
		return "已合并"
	case StatusReviewing:
		return "审核中"
	default:
		return status
	}
}

func (repo *MySQLRepository) getChallengeReviewTargetForUpdate(ctx context.Context, tx *sql.Tx, scope Scope, challengeID int64) (challengeReviewTarget, error) {
	query := `
SELECT qc.tenant_id, qc.question_id, qc.challenger_user_id
FROM question_challenges qc
JOIN questions q ON q.id = qc.question_id
WHERE qc.id = ? AND q.deleted_at IS NULL
`
	args := []any{challengeID}
	if scope.TenantID > 0 {
		query += " AND qc.tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	query += " FOR UPDATE"
	var target challengeReviewTarget
	err := tx.QueryRowContext(ctx, query, args...).Scan(&target.TenantID, &target.QuestionID, &target.ChallengerUserID)
	if err != nil {
		return challengeReviewTarget{}, wrapNotFound(err)
	}
	return target, nil
}

func (repo *MySQLRepository) getChallengeByID(ctx context.Context, scope Scope, id int64) (QuestionChallengeListItem, error) {
	query := challengeListSelectSQL() + `
WHERE qc.id = ? AND q.deleted_at IS NULL
`
	args := []any{id}
	if scope.TenantID > 0 {
		query += " AND qc.tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	query += " LIMIT 1"
	items, err := repo.queryChallenges(ctx, query, args...)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	if len(items) == 0 {
		return QuestionChallengeListItem{}, ErrNotFound
	}
	return items[0], nil
}

func (repo *MySQLRepository) queryChallenges(ctx context.Context, query string, args ...any) ([]QuestionChallengeListItem, error) {
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]QuestionChallengeListItem, 0)
	for rows.Next() {
		item, err := scanQuestionChallengeListItem(rows)
		if err != nil {
			return nil, err
		}
		item.HistoryVersions, err = repo.listChallengeHistoryVersions(ctx, item.QuestionID)
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

func challengeListSelectSQL() string {
	return `
SELECT
  qc.id,
  qc.tenant_id,
  qc.question_id,
  qc.question_version_id,
  qc.challenge_type,
  qc.description,
  qc.attachments_json,
  qc.status,
  qc.challenger_user_id,
  u.display_name,
  COALESCE((
    SELECT qb.name
    FROM question_bank_questions qbq
    JOIN question_banks qb ON qb.id = qbq.question_bank_id
    WHERE qbq.question_id = qc.question_id AND qb.deleted_at IS NULL
    ORDER BY qb.id
    LIMIT 1
  ), '') AS question_bank_name,
  qc.reviewed_by,
  qc.reviewed_at,
  qc.review_comment,
  qc.resolved_version_id,
  qc.created_at,
  qc.updated_at,
  qv.version_no,
  qv.content_json,
  qv.answer_json,
  qv.analysis_json
FROM question_challenges qc
JOIN questions q ON q.id = qc.question_id
JOIN question_versions qv ON qv.id = COALESCE(q.current_version_id, qc.question_version_id)
JOIN users u ON u.id = qc.challenger_user_id
`
}

func scanQuestionChallengeListItem(scanner interface{ Scan(dest ...any) error }) (QuestionChallengeListItem, error) {
	var item QuestionChallengeListItem
	var attachmentsJSON []byte
	var challengerName string
	var questionBankName string
	var reviewedBy sql.NullInt64
	var reviewedAt sql.NullTime
	var reviewComment sql.NullString
	var resolvedVersionID sql.NullInt64
	var versionNo int
	var contentJSON []byte
	var answerJSON []byte
	var analysisJSON []byte

	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.QuestionID,
		&item.QuestionVersionID,
		&item.ChallengeType,
		&item.Description,
		&attachmentsJSON,
		&item.Status,
		&item.ChallengerUserID,
		&challengerName,
		&questionBankName,
		&reviewedBy,
		&reviewedAt,
		&reviewComment,
		&resolvedVersionID,
		&item.CreatedAt,
		&item.UpdatedAt,
		&versionNo,
		&contentJSON,
		&answerJSON,
		&analysisJSON,
	)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	attachments, err := decodeChallengeAttachments(attachmentsJSON)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	content, err := decodeChallengeContent(contentJSON)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	answer, err := decodeChallengeContent(answerJSON)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	analysis, err := decodeChallengeContent(analysisJSON)
	if err != nil {
		return QuestionChallengeListItem{}, err
	}
	if reviewedBy.Valid {
		value := reviewedBy.Int64
		item.ReviewedBy = &value
	}
	if reviewedAt.Valid {
		value := reviewedAt.Time
		item.ReviewedAt = &value
	}
	if reviewComment.Valid {
		item.ReviewComment = reviewComment.String
	}
	if resolvedVersionID.Valid {
		value := resolvedVersionID.Int64
		item.ResolvedVersionID = &value
	}
	item.Attachments = attachments
	item.Challenger = challengerName
	item.QuestionBank = questionBankName
	item.SuggestedFix = item.Description
	item.Title = challengeTitle(item.QuestionID, content)
	item.CurrentVersion = formatVersionSummary(versionNo, "", content)
	item.CurrentContent = content
	item.CurrentAnswer = answer
	item.CurrentAnalysis = analysis
	item.HistoryVersions = []string{}
	return item, nil
}

func (repo *MySQLRepository) listChallengeHistoryVersions(ctx context.Context, questionID int64) ([]string, error) {
	const query = `
SELECT version_no, change_summary, content_json
FROM question_versions
WHERE question_id = ?
ORDER BY version_no ASC, id ASC
`
	rows, err := repo.db.QueryContext(ctx, query, questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]string, 0)
	for rows.Next() {
		var versionNo int
		var changeSummary sql.NullString
		var contentJSON []byte
		if err := rows.Scan(&versionNo, &changeSummary, &contentJSON); err != nil {
			return nil, err
		}
		content, err := decodeChallengeContent(contentJSON)
		if err != nil {
			return nil, err
		}
		summary := ""
		if changeSummary.Valid {
			summary = changeSummary.String
		}
		items = append(items, formatVersionSummary(versionNo, summary, content))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
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
  qv.version_no,
  qv.content_json
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
  qv.version_no,
  qv.content_json
FROM questions q
LEFT JOIN question_versions qv ON q.current_version_id = qv.id
WHERE q.id = ? AND q.deleted_at IS NULL
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND q.tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	item, err := scanQuestionScanner(row)
	if err != nil {
		return Question{}, wrapNotFound(err)
	}
	items := []Question{item}
	if err := repo.fillBankIDs(ctx, items); err != nil {
		return Question{}, err
	}
	if err := repo.fillCourseIDs(ctx, items); err != nil {
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

func (repo *MySQLRepository) fillCourseIDs(ctx context.Context, items []Question) error {
	if len(items) == 0 {
		return nil
	}

	questionIDs := make([]int64, 0, len(items))
	indexByID := make(map[int64]int, len(items))
	for index, item := range items {
		questionIDs = append(questionIDs, item.ID)
		indexByID[item.ID] = index
		items[index].CourseIDs = []int64{}
	}

	query := `
SELECT question_id, course_id
FROM question_course_bindings
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
		var courseID int64
		if err := rows.Scan(&questionID, &courseID); err != nil {
			return err
		}
		if index, ok := indexByID[questionID]; ok {
			items[index].CourseIDs = append(items[index].CourseIDs, courseID)
		}
	}
	return rows.Err()
}

func buildQuestionAccessCondition(alias string, scope Scope) (string, []any) {
	if isSystemScope(scope) {
		return "", nil
	}

	allVisibleBankSQL := `
EXISTS (
  SELECT 1
  FROM question_bank_questions qbq_all
  JOIN question_banks qb_all ON qb_all.id = qbq_all.question_bank_id
  JOIN question_bank_visibility qbv_all ON qbv_all.question_bank_id = qb_all.id
  WHERE qbq_all.question_id = ` + alias + `.id
    AND qb_all.deleted_at IS NULL
    AND qbv_all.status = 'active'
    AND qbv_all.permission_type IN ('view', 'practice', 'share', 'manage', 'exam')
    AND qbv_all.target_type = 'all'
)
`
	if scope.TenantID <= 0 {
		return " AND (" + alias + ".creator_id = ? OR " + allVisibleBankSQL + ")", []any{scope.UserID}
	}

	if containsExactPermission(scope.Permissions, "question:manage") {
		return " AND (" + alias + ".tenant_id = ? OR " + allVisibleBankSQL + ")", []any{scope.TenantID}
	}

	condition := `
 AND (
  ` + alias + `.creator_id = ?
  OR ` + allVisibleBankSQL + `
  OR EXISTS (
    SELECT 1
    FROM question_bank_questions qbq_scope
    JOIN question_banks qb_scope ON qb_scope.id = qbq_scope.question_bank_id
    WHERE qbq_scope.question_id = ` + alias + `.id
      AND qb_scope.deleted_at IS NULL
      AND (
        qb_scope.creator_id = ?
        OR (
          qb_scope.tenant_id = ?
          AND EXISTS (
            SELECT 1
            FROM question_bank_visibility qbv
            WHERE qbv.question_bank_id = qb_scope.id
              AND qbv.tenant_id = qb_scope.tenant_id
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
                      WHERE scm.tenant_id = qb_scope.tenant_id
                        AND scm.student_id = ?
                        AND scm.class_id = qbv.target_id
                        AND scm.is_current = 1
                        AND scm.status = 'active'
                    )
                    OR EXISTS (
                      SELECT 1
                      FROM class_head_teacher_assignments chta
                      WHERE chta.tenant_id = qb_scope.tenant_id
                        AND chta.teacher_id = ?
                        AND chta.class_id = qbv.target_id
                        AND chta.is_current = 1
                        AND chta.status = 'active'
                    )
                    OR EXISTS (
                      SELECT 1
                      FROM teacher_class_course_assignments tcca
                      WHERE tcca.tenant_id = qb_scope.tenant_id
                        AND tcca.teacher_id = ?
                        AND tcca.class_id = qbv.target_id
                        AND tcca.is_current = 1
                        AND tcca.status = 'active'
                        AND (
                          tcca.course_id = qb_scope.course_id
                          OR EXISTS (
                            SELECT 1
                            FROM question_course_bindings qcb_scope
                            WHERE qcb_scope.tenant_id = qb_scope.tenant_id
                              AND qcb_scope.question_id = ` + alias + `.id
                              AND qcb_scope.course_id = tcca.course_id
                          )
                        )
                    )
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

func scanQuestion(rows *sql.Rows) (Question, error) {
	return scanQuestionScanner(rows)
}

func scanQuestionScanner(scanner interface{ Scan(dest ...any) error }) (Question, error) {
	var item Question
	var difficulty sql.NullString
	var currentVersionID sql.NullInt64
	var currentVersionNo sql.NullInt64
	var currentContentJSON sql.NullString
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
		&currentContentJSON,
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
	if currentContentJSON.Valid && currentContentJSON.String != "" {
		if err := json.Unmarshal([]byte(currentContentJSON.String), &item.CurrentContent); err != nil {
			return Question{}, err
		}
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

func nullableAttachmentJSON(value []QuestionChallengeAttachmentInput) (any, error) {
	if len(value) == 0 {
		return nil, nil
	}
	return json.Marshal(value)
}

func decodeChallengeAttachments(payload []byte) ([]QuestionChallengeAttachmentInput, error) {
	if len(payload) == 0 {
		return []QuestionChallengeAttachmentInput{}, nil
	}
	var attachments []QuestionChallengeAttachmentInput
	if err := json.Unmarshal(payload, &attachments); err != nil {
		return nil, err
	}
	if attachments == nil {
		return []QuestionChallengeAttachmentInput{}, nil
	}
	return attachments, nil
}

func decodeChallengeContent(payload []byte) (map[string]any, error) {
	if len(payload) == 0 {
		return map[string]any{}, nil
	}
	var content map[string]any
	if err := json.Unmarshal(payload, &content); err != nil {
		return nil, err
	}
	if content == nil {
		return map[string]any{}, nil
	}
	return content, nil
}

func challengeTitle(questionID int64, content map[string]any) string {
	if stem := challengeStemText(content); stem != "" {
		return stem
	}
	return fmt.Sprintf("题目 #%d", questionID)
}

func formatVersionSummary(versionNo int, summary string, content map[string]any) string {
	text := strings.TrimSpace(summary)
	if text == "" {
		text = challengeStemText(content)
	}
	if text == "" {
		text = "版本内容"
	}
	return fmt.Sprintf("版本 %d：%s", versionNo, text)
}

func challengeStemText(content map[string]any) string {
	stem, ok := content["stem"].(map[string]any)
	if !ok {
		return ""
	}
	text, ok := stem["text"].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
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

func nullInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
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
