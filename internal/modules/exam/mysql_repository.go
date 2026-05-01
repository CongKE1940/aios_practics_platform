package exam

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

func teacherExamAccessCondition(alias string) string {
	scopedCourseID := singlePublishedPaperCourseIDSQL(alias)
	return `(
  ` + alias + `.creator_id = ?
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN class_head_teacher_assignments chta ON chta.tenant_id = ` + alias + `.tenant_id
      AND chta.class_id = et.target_id
      AND chta.teacher_id = ?
      AND chta.is_current = 1
      AND chta.status = 'active'
    WHERE et.exam_id = ` + alias + `.id AND et.target_type = 'class'
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN student_class_memberships scm ON scm.tenant_id = ` + alias + `.tenant_id
      AND scm.student_id = et.target_id
      AND scm.is_current = 1
      AND scm.status = 'active'
    JOIN class_head_teacher_assignments chta ON chta.tenant_id = scm.tenant_id
      AND chta.class_id = scm.class_id
      AND chta.teacher_id = ?
      AND chta.is_current = 1
      AND chta.status = 'active'
    WHERE et.exam_id = ` + alias + `.id AND et.target_type = 'user'
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN teacher_class_course_assignments tcca ON tcca.tenant_id = ` + alias + `.tenant_id
      AND tcca.course_id = et.target_id
      AND tcca.teacher_id = ?
      AND tcca.is_current = 1
      AND tcca.status = 'active'
    WHERE et.exam_id = ` + alias + `.id AND et.target_type = 'course'
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN teacher_class_course_assignments tcca ON tcca.tenant_id = ` + alias + `.tenant_id
      AND tcca.class_id = et.target_id
      AND tcca.course_id = ` + scopedCourseID + `
      AND tcca.teacher_id = ?
      AND tcca.is_current = 1
      AND tcca.status = 'active'
    WHERE et.exam_id = ` + alias + `.id AND et.target_type = 'class'
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN student_class_memberships scm ON scm.tenant_id = ` + alias + `.tenant_id
      AND scm.student_id = et.target_id
      AND scm.is_current = 1
      AND scm.status = 'active'
    JOIN teacher_class_course_assignments tcca ON tcca.tenant_id = scm.tenant_id
      AND tcca.class_id = scm.class_id
      AND tcca.course_id = ` + scopedCourseID + `
      AND tcca.teacher_id = ?
      AND tcca.is_current = 1
      AND tcca.status = 'active'
    WHERE et.exam_id = ` + alias + `.id AND et.target_type = 'user'
  )
)`
}

func singlePublishedPaperCourseIDSQL(alias string) string {
	return `(
    SELECT MIN(epqr.course_id)
    FROM exam_paper_question_rules epqr
    WHERE epqr.paper_id = ` + alias + `.paper_id
    HAVING COUNT(*) > 0 AND COUNT(*) = COUNT(epqr.course_id) AND COUNT(DISTINCT epqr.course_id) = 1
  )`
}

func teacherExamAccessArgs(teacherID int64) []any {
	return []any{teacherID, teacherID, teacherID, teacherID, teacherID, teacherID}
}

func (repo *MySQLRepository) ListExams(ctx context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	if repo == nil || repo.db == nil {
		return PageResult[Exam]{}, ErrRepositoryUnavailable
	}
	if scope.UserType == "student" || !canManageExam(scope) {
		return repo.listStudentExams(ctx, scope, filter)
	}
	query := `
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at
FROM exams e
`
	args := make([]any, 0, 1)
	if scope.TenantID > 0 {
		query += "WHERE e.tenant_id = ?\n"
		args = append(args, scope.TenantID)
		query += " AND e.owner_org_type <> ?\n"
		args = append(args, OwnerOrgTypeUser)
	} else {
		query += "WHERE e.owner_org_type <> ?\n"
		args = append(args, OwnerOrgTypeUser)
	}
	if scope.UserType == "teacher" {
		query += " AND " + teacherExamAccessCondition("e") + "\n"
		args = append(args, teacherExamAccessArgs(scope.UserID)...)
	}
	query += " ORDER BY e.id DESC"
	rows, err := repo.db.QueryContext(ctx, query, args...)
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

func (repo *MySQLRepository) listStudentExams(ctx context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	const query = `
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at
FROM exams e
WHERE e.tenant_id = ? AND e.status = ?
AND (
  EXISTS (
    SELECT 1
    FROM exam_targets et
    WHERE et.exam_id = e.id AND et.target_type = 'user' AND et.target_id = ?
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN student_class_memberships scm ON scm.class_id = et.target_id
    WHERE et.exam_id = e.id AND et.target_type = 'class' AND scm.tenant_id = e.tenant_id AND scm.student_id = ? AND scm.is_current = 1 AND scm.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN teacher_class_course_assignments tcca ON tcca.course_id = et.target_id
    JOIN student_class_memberships scm ON scm.class_id = tcca.class_id
    WHERE et.exam_id = e.id AND et.target_type = 'course' AND tcca.tenant_id = e.tenant_id AND tcca.is_current = 1 AND tcca.status = 'active' AND scm.tenant_id = e.tenant_id AND scm.student_id = ? AND scm.is_current = 1 AND scm.status = 'active'
  )
)
ORDER BY e.id DESC
`
	rows, err := repo.db.QueryContext(ctx, query, scope.TenantID, ExamStatusPublished, scope.UserID, scope.UserID, scope.UserID)
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

	ownerOrgType := OwnerOrgTypeSchool
	ownerOrgID := scope.TenantID
	if scope.UserType == "student" {
		ownerOrgType = OwnerOrgTypeUser
		ownerOrgID = scope.UserID
	}

	query := `
INSERT INTO exams (tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, total_score, assembly_rule_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	ruleJSON, err := encodePaperRules(input.PaperRules)
	if err != nil {
		return ExamDetail{}, err
	}
	args := []any{
		scope.TenantID,
		ownerOrgType,
		ownerOrgID,
		scope.UserID,
		input.Name,
		input.ExamMode,
		ExamStatusDraft,
		input.StartTime,
		input.EndTime,
		input.DurationMinutes,
		formatExamScore(totalScore(input.FixedQuestions)),
		ruleJSON,
	}
	if input.ExamMode == ExamModePaper {
		paper, err := repo.getExamPaperForUse(ctx, scope, *input.PaperID)
		if err != nil {
			return ExamDetail{}, err
		}
		query = `
INSERT INTO exams (tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, total_score, paper_id, assembly_rule_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
		args = []any{
			scope.TenantID,
			ownerOrgType,
			ownerOrgID,
			scope.UserID,
			input.Name,
			input.ExamMode,
			ExamStatusDraft,
			input.StartTime,
			input.EndTime,
			input.DurationMinutes,
			formatExamScore(paper.TotalScore),
			*input.PaperID,
			nil,
		}
	}
	result, err := tx.ExecContext(
		ctx,
		query,
		args...,
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
	query := `
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at, e.assembly_rule_json
FROM exams e
WHERE e.id = ?
`
	args := []any{id}
	if scope.TenantID > 0 {
		query += " AND e.tenant_id = ?"
		args = append(args, scope.TenantID)
	}
	if scope.UserType == "student" {
		query += " AND e.owner_org_type = ? AND e.owner_org_id = ? AND e.creator_id = ?"
		args = append(args, OwnerOrgTypeUser, scope.UserID, scope.UserID)
	} else {
		query += " AND e.owner_org_type <> ?"
		args = append(args, OwnerOrgTypeUser)
		if scope.UserType == "teacher" {
			query += " AND " + teacherExamAccessCondition("e")
			args = append(args, teacherExamAccessArgs(scope.UserID)...)
		}
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
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
	var paper *ExamPaperDetail
	if item.PaperID != nil {
		paperScope := scope
		paperScope.TenantID = item.TenantID
		paperScope.Permissions = append(append([]string{}, scope.Permissions...), "exam:publish")
		paperDetail, err := repo.GetExamPaper(ctx, paperScope, *item.PaperID)
		if err != nil {
			return ExamDetail{}, err
		}
		paper = &paperDetail
		if len(fixedQuestions) == 0 {
			fixedQuestions = append([]ExamFixedQuestion{}, paperDetail.Questions...)
		}
		if len(paperRules) == 0 {
			paperRules = append([]ExamPaperRule{}, paperDetail.PaperRules...)
		}
	}
	return ExamDetail{
		Exam:           item,
		Targets:        targets,
		FixedQuestions: fixedQuestions,
		PaperRules:     paperRules,
		Paper:          paper,
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

	query := `
UPDATE exams
SET name = ?, exam_mode = ?, start_time = ?, end_time = ?, duration_minutes = ?, total_score = ?, paper_id = NULL, assembly_rule_json = ?
WHERE id = ? AND tenant_id = ?
`
	ruleJSON, err := encodePaperRules(input.PaperRules)
	if err != nil {
		return ExamDetail{}, err
	}
	total := totalScore(input.FixedQuestions)
	args := []any{
		input.Name,
		input.ExamMode,
		input.StartTime,
		input.EndTime,
		input.DurationMinutes,
		formatExamScore(total),
		ruleJSON,
		id,
		scope.TenantID,
	}
	if input.ExamMode == ExamModePaper {
		paper, err := repo.getExamPaperForUse(ctx, scope, *input.PaperID)
		if err != nil {
			return ExamDetail{}, err
		}
		query = `
UPDATE exams
SET name = ?, exam_mode = ?, start_time = ?, end_time = ?, duration_minutes = ?, total_score = ?, paper_id = ?, assembly_rule_json = ?
WHERE id = ? AND tenant_id = ?
`
		args = []any{
			input.Name,
			input.ExamMode,
			input.StartTime,
			input.EndTime,
			input.DurationMinutes,
			formatExamScore(paper.TotalScore),
			*input.PaperID,
			nil,
			id,
			scope.TenantID,
		}
	}
	result, err := tx.ExecContext(
		ctx,
		query,
		args...,
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
	if current.ExamMode == ExamModePaper {
		if current.PaperID == nil {
			return ExamDetail{}, ErrInvalidInput
		}
		paper, err := repo.getExamPaperForUse(ctx, Scope{TenantID: current.TenantID, Permissions: scope.Permissions}, *current.PaperID)
		if err != nil {
			return ExamDetail{}, err
		}
		if paper.QuestionCount == 0 {
			return ExamDetail{}, ErrInvalidInput
		}
		result, err := repo.db.ExecContext(
			ctx,
			`UPDATE exams SET status = ?, total_score = ? WHERE id = ? AND tenant_id = ? AND status = ? AND paper_id = ?`,
			ExamStatusPublished,
			formatExamScore(paper.TotalScore),
			id,
			scope.TenantID,
			ExamStatusDraft,
			*current.PaperID,
		)
		if err != nil {
			return ExamDetail{}, err
		}
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return ExamDetail{}, err
		}
		if rowsAffected == 0 {
			return ExamDetail{}, ErrForbidden
		}
		return repo.GetExam(ctx, scope, id)
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
INSERT INTO exam_papers (exam_id, tenant_id, creator_id, paper_type, paper_name, source_type, status, total_score)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`
	paperType := ExamPaperTypeFixed
	if current.ExamMode == ExamModeRandom {
		paperType = ExamPaperTypeRandomRule
	}
	result, err := tx.ExecContext(
		ctx,
		paperQuery,
		id,
		current.TenantID,
		current.CreatorID,
		paperType,
		current.Name,
		SourceTypeManual,
		ExamPaperStatusPublished,
		formatExamScore(current.totalPublishScore()),
	)
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
	statusResult, err := tx.ExecContext(ctx, `UPDATE exams SET status = ?, paper_id = ? WHERE id = ? AND tenant_id = ? AND status = ?`, ExamStatusPublished, paperID, id, scope.TenantID, ExamStatusDraft)
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

func (repo *MySQLRepository) StartAttempt(ctx context.Context, scope Scope, examID int64) (ExamAttemptDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamAttemptDetail{}, ErrRepositoryUnavailable
	}
	if existing, ok, err := repo.getAttemptByExamUser(ctx, scope, examID); err != nil {
		return ExamAttemptDetail{}, err
	} else if ok {
		return repo.GetAttempt(ctx, scope, existing.ID)
	}
	paperID, err := repo.getPublishedPaperID(ctx, scope, examID)
	if err != nil {
		return ExamAttemptDetail{}, err
	}
	startAt := time.Now().UTC()
	const query = `
INSERT INTO exam_attempts (exam_id, paper_id, tenant_id, user_id, start_at, status)
VALUES (?, ?, ?, ?, ?, ?)
`
	result, err := repo.db.ExecContext(ctx, query, examID, paperID, scope.TenantID, scope.UserID, startAt, ExamAttemptStatusInProgress)
	if err != nil {
		return ExamAttemptDetail{}, err
	}
	attemptID, err := result.LastInsertId()
	if err != nil {
		return ExamAttemptDetail{}, err
	}
	return repo.GetAttempt(ctx, scope, attemptID)
}

func (repo *MySQLRepository) GetAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamAttemptDetail{}, ErrRepositoryUnavailable
	}
	attempt, err := repo.getAttemptByID(ctx, scope, attemptID)
	if err != nil {
		return ExamAttemptDetail{}, err
	}
	questions, err := repo.listAttemptQuestions(ctx, attempt.PaperID)
	if err != nil {
		return ExamAttemptDetail{}, err
	}
	answers, err := repo.listAttemptAnswers(ctx, attempt.ID)
	if err != nil {
		return ExamAttemptDetail{}, err
	}
	return ExamAttemptDetail{Attempt: attempt, Questions: questions, Answers: answers}, nil
}

func (repo *MySQLRepository) SaveAttemptAnswer(ctx context.Context, scope Scope, attemptID int64, input SaveAttemptAnswerInput) (ExamAttemptAnswer, error) {
	if repo == nil || repo.db == nil {
		return ExamAttemptAnswer{}, ErrRepositoryUnavailable
	}
	attempt, err := repo.getAttemptByID(ctx, scope, attemptID)
	if err != nil {
		return ExamAttemptAnswer{}, err
	}
	if attempt.Status != ExamAttemptStatusInProgress {
		return ExamAttemptAnswer{}, ErrForbidden
	}
	question, err := repo.getPaperQuestionByDisplayOrder(ctx, attempt.PaperID, input.DisplayOrder)
	if err != nil {
		return ExamAttemptAnswer{}, err
	}
	answerJSON, err := encodeAnswer(input.Answer)
	if err != nil {
		return ExamAttemptAnswer{}, err
	}
	const query = `
INSERT INTO exam_attempt_answers (attempt_id, tenant_id, question_id, question_version_id, display_order, answer_json)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), question_id = VALUES(question_id), question_version_id = VALUES(question_version_id), answer_json = VALUES(answer_json)
`
	if _, err := repo.db.ExecContext(ctx, query, attemptID, attempt.TenantID, question.QuestionID, question.QuestionVersionID, input.DisplayOrder, answerJSON); err != nil {
		return ExamAttemptAnswer{}, err
	}
	return ExamAttemptAnswer{
		AttemptID:         attemptID,
		QuestionID:        question.QuestionID,
		QuestionVersionID: question.QuestionVersionID,
		DisplayOrder:      input.DisplayOrder,
		Answer:            input.Answer,
		Score:             0,
	}, nil
}

func (repo *MySQLRepository) SubmitAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	if repo == nil || repo.db == nil {
		return ExamAttemptResult{}, ErrRepositoryUnavailable
	}
	attempt, durationMinutes, err := repo.getAttemptForSubmit(ctx, scope, attemptID)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	if attempt.Status != ExamAttemptStatusInProgress {
		return repo.GetAttemptResult(ctx, scope, attemptID)
	}
	answers, err := repo.listAttemptAnswersForSubmit(ctx, attempt.ID)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	submitAt := time.Now().UTC()
	status := ExamAttemptStatusSubmitted
	if attempt.StartAt != nil && durationMinutes > 0 && submitAt.After(attempt.StartAt.Add(time.Duration(durationMinutes)*time.Minute)) {
		status = ExamAttemptStatusTimeout
	}

	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	defer tx.Rollback()

	totalScore := 0.0
	resultAnswers := make([]ExamAttemptAnswer, 0, len(answers))
	for _, answer := range answers {
		if isManualReviewQuestionType(answer.QuestionType) {
			if err := repo.markAttemptAnswerPendingReview(ctx, tx, attempt.ID, answer.Answer.DisplayOrder); err != nil {
				return ExamAttemptResult{}, err
			}
			answer.Answer.Score = 0
			resultAnswers = append(resultAnswers, answer.Answer)
			continue
		}
		isCorrect, err := judgeExamAnswer(answer.CorrectAnswer, answer.Answer.Answer)
		if err != nil {
			return ExamAttemptResult{}, err
		}
		score := 0.0
		if isCorrect {
			score = answer.QuestionScore
			totalScore += score
		}
		if err := repo.updateAttemptAnswerJudgement(ctx, tx, attempt.ID, answer.Answer.DisplayOrder, isCorrect, score, submitAt); err != nil {
			return ExamAttemptResult{}, err
		}
		answer.Answer.IsCorrect = &isCorrect
		answer.Answer.Score = score
		resultAnswers = append(resultAnswers, answer.Answer)
		if !isCorrect {
			if err := repo.upsertExamWrongState(ctx, tx, scope, answer.Answer, submitAt); err != nil {
				return ExamAttemptResult{}, err
			}
		}
	}

	updateResult, err := tx.ExecContext(
		ctx,
		`UPDATE exam_attempts SET status = ?, submit_at = ?, objective_score = ?, final_score = ? WHERE id = ? AND tenant_id = ? AND user_id = ? AND status = ?`,
		status,
		submitAt,
		formatExamScore(totalScore),
		formatExamScore(totalScore),
		attempt.ID,
		scope.TenantID,
		scope.UserID,
		ExamAttemptStatusInProgress,
	)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	rowsAffected, err := updateResult.RowsAffected()
	if err != nil {
		return ExamAttemptResult{}, err
	}
	if rowsAffected == 0 {
		return ExamAttemptResult{}, ErrForbidden
	}
	if err := tx.Commit(); err != nil {
		return ExamAttemptResult{}, err
	}
	attempt.Status = status
	attempt.SubmitAt = &submitAt
	attempt.ObjectiveScore = totalScore
	attempt.FinalScore = totalScore
	return ExamAttemptResult{Attempt: attempt, Answers: resultAnswers, ObjectiveScore: totalScore, FinalScore: totalScore}, nil
}

func (repo *MySQLRepository) GetAttemptResult(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	if repo == nil || repo.db == nil {
		return ExamAttemptResult{}, ErrRepositoryUnavailable
	}
	attempt, err := repo.getAttemptByID(ctx, scope, attemptID)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	answers, err := repo.listAttemptAnswers(ctx, attempt.ID)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	return ExamAttemptResult{
		Attempt:        attempt,
		Answers:        answers,
		ObjectiveScore: attempt.ObjectiveScore,
		FinalScore:     attempt.FinalScore,
	}, nil
}

func (repo *MySQLRepository) ListExamPapers(ctx context.Context, scope Scope, filter ExamPaperListFilter) (PageResult[ExamPaper], error) {
	if repo == nil || repo.db == nil {
		return PageResult[ExamPaper]{}, ErrRepositoryUnavailable
	}
	query := `
SELECT
  ep.id,
  COALESCE(ep.tenant_id, e.tenant_id) AS tenant_id,
  ep.exam_id,
  COALESCE(ep.creator_id, e.creator_id, 0) AS creator_id,
  ep.paper_type,
  ep.paper_name,
  COALESCE(ep.source_type, 'manual') AS source_type,
  COALESCE(ep.status, CASE WHEN e.status = 'published' THEN 'published' ELSE 'draft' END) AS status,
  ep.total_score,
  ep.created_at,
  ep.updated_at,
  COUNT(epq.id) AS question_count
FROM exam_papers ep
LEFT JOIN exams e ON e.id = ep.exam_id
LEFT JOIN exam_paper_questions epq ON epq.paper_id = ep.id
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if scope.TenantID > 0 {
		query += " AND COALESCE(ep.tenant_id, e.tenant_id) = ?"
		args = append(args, scope.TenantID)
	}
	if filter.Status != "" {
		query += " AND COALESCE(ep.status, CASE WHEN e.status = 'published' THEN 'published' ELSE 'draft' END) = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND ep.paper_name LIKE ?"
		args = append(args, "%"+filter.Keyword+"%")
	}
	if scope.UserType == "student" {
		query += " AND COALESCE(ep.creator_id, e.creator_id, 0) = ? AND (e.id IS NULL OR e.owner_org_type = ?)"
		args = append(args, scope.UserID, OwnerOrgTypeUser)
	} else {
		query += " AND (e.id IS NULL OR e.owner_org_type <> ?)"
		args = append(args, OwnerOrgTypeUser)
	}
	query += `
GROUP BY
  ep.id,
  COALESCE(ep.tenant_id, e.tenant_id),
  ep.exam_id,
  COALESCE(ep.creator_id, e.creator_id, 0),
  ep.paper_type,
  ep.paper_name,
  COALESCE(ep.source_type, 'manual'),
  COALESCE(ep.status, CASE WHEN e.status = 'published' THEN 'published' ELSE 'draft' END),
  ep.total_score,
  ep.created_at,
  ep.updated_at
ORDER BY ep.id DESC
`
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[ExamPaper]{}, err
	}
	defer rows.Close()

	items := make([]ExamPaper, 0)
	for rows.Next() {
		item, err := scanExamPaper(rows)
		if err != nil {
			return PageResult[ExamPaper]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[ExamPaper]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) CreateExamPaper(ctx context.Context, scope Scope, input ExamPaperInput) (ExamPaperDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	questions, err := repo.resolvePaperQuestions(ctx, scope.TenantID, input)
	if err != nil {
		return ExamPaperDetail{}, err
	}

	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	defer tx.Rollback()

	const paperQuery = `
INSERT INTO exam_papers (tenant_id, creator_id, paper_type, paper_name, source_type, status, total_score)
VALUES (?, ?, ?, ?, ?, ?, ?)
`
	result, err := tx.ExecContext(ctx, paperQuery, scope.TenantID, scope.UserID, input.PaperType, input.PaperName, SourceTypeManual, ExamPaperStatusDraft, formatExamScore(totalPublishedScore(questions)))
	if err != nil {
		return ExamPaperDetail{}, err
	}
	paperID, err := result.LastInsertId()
	if err != nil {
		return ExamPaperDetail{}, err
	}
	if input.PaperType == ExamPaperTypeRandomRule {
		if err := repo.insertPaperRules(ctx, tx, paperID, input.PaperRules); err != nil {
			return ExamPaperDetail{}, err
		}
	}
	if err := repo.insertPaperQuestions(ctx, tx, paperID, questions); err != nil {
		return ExamPaperDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return ExamPaperDetail{}, err
	}
	return repo.GetExamPaper(ctx, scope, paperID)
}

func (repo *MySQLRepository) GetExamPaper(ctx context.Context, scope Scope, id int64) (ExamPaperDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	query := `
SELECT
  ep.id,
  COALESCE(ep.tenant_id, e.tenant_id) AS tenant_id,
  ep.exam_id,
  COALESCE(ep.creator_id, e.creator_id, 0) AS creator_id,
  ep.paper_type,
  ep.paper_name,
  COALESCE(ep.source_type, 'manual') AS source_type,
  COALESCE(ep.status, CASE WHEN e.status = 'published' THEN 'published' ELSE 'draft' END) AS status,
  ep.total_score,
  ep.created_at,
  ep.updated_at,
  COUNT(epq.id) AS question_count
FROM exam_papers ep
LEFT JOIN exams e ON e.id = ep.exam_id
LEFT JOIN exam_paper_questions epq ON epq.paper_id = ep.id
WHERE ep.id = ?
`
	args := []any{id}
	if scope.TenantID > 0 {
		query += " AND COALESCE(ep.tenant_id, e.tenant_id) = ?"
		args = append(args, scope.TenantID)
	}
	if scope.UserType == "student" {
		query += " AND COALESCE(ep.creator_id, e.creator_id, 0) = ? AND (e.id IS NULL OR e.owner_org_type = ?)"
		args = append(args, scope.UserID, OwnerOrgTypeUser)
	} else {
		query += " AND (e.id IS NULL OR e.owner_org_type <> ?)"
		args = append(args, OwnerOrgTypeUser)
	}
	query += `
GROUP BY
  ep.id,
  COALESCE(ep.tenant_id, e.tenant_id),
  ep.exam_id,
  COALESCE(ep.creator_id, e.creator_id, 0),
  ep.paper_type,
  ep.paper_name,
  COALESCE(ep.source_type, 'manual'),
  COALESCE(ep.status, CASE WHEN e.status = 'published' THEN 'published' ELSE 'draft' END),
  ep.total_score,
  ep.created_at,
  ep.updated_at
LIMIT 1
`
	item, err := scanExamPaper(repo.db.QueryRowContext(ctx, query, args...))
	if err != nil {
		return ExamPaperDetail{}, wrapExamNotFound(err)
	}
	questions, err := repo.listPaperFixedQuestions(ctx, id)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	rules, err := repo.listPaperRules(ctx, id)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	return ExamPaperDetail{ExamPaper: item, Questions: questions, PaperRules: rules}, nil
}

func (repo *MySQLRepository) UpdateExamPaper(ctx context.Context, scope Scope, id int64, input ExamPaperInput) (ExamPaperDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	current, err := repo.GetExamPaper(ctx, scope, id)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	if current.Status != ExamPaperStatusDraft {
		return ExamPaperDetail{}, ErrForbidden
	}
	questions, err := repo.resolvePaperQuestions(ctx, scope.TenantID, input)
	if err != nil {
		return ExamPaperDetail{}, err
	}

	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(
		ctx,
		`UPDATE exam_papers SET paper_type = ?, paper_name = ?, total_score = ? WHERE id = ? AND COALESCE(tenant_id, ?) = ?`,
		input.PaperType,
		input.PaperName,
		formatExamScore(totalPublishedScore(questions)),
		id,
		scope.TenantID,
		scope.TenantID,
	)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return ExamPaperDetail{}, err
	}
	if rowsAffected == 0 {
		return ExamPaperDetail{}, ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM exam_paper_question_rules WHERE paper_id = ?`, id); err != nil {
		return ExamPaperDetail{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM exam_paper_questions WHERE paper_id = ?`, id); err != nil {
		return ExamPaperDetail{}, err
	}
	if input.PaperType == ExamPaperTypeRandomRule {
		if err := repo.insertPaperRules(ctx, tx, id, input.PaperRules); err != nil {
			return ExamPaperDetail{}, err
		}
	}
	if err := repo.insertPaperQuestions(ctx, tx, id, questions); err != nil {
		return ExamPaperDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return ExamPaperDetail{}, err
	}
	return repo.GetExamPaper(ctx, scope, id)
}

func (repo *MySQLRepository) PublishExamPaper(ctx context.Context, scope Scope, id int64) (ExamPaperDetail, error) {
	if repo == nil || repo.db == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	current, err := repo.GetExamPaper(ctx, scope, id)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	if current.QuestionCount == 0 {
		return ExamPaperDetail{}, ErrInvalidInput
	}
	if current.Status == ExamPaperStatusPublished {
		return current, nil
	}
	result, err := repo.db.ExecContext(ctx, `UPDATE exam_papers SET status = ? WHERE id = ? AND tenant_id = ?`, ExamPaperStatusPublished, id, scope.TenantID)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return ExamPaperDetail{}, err
	}
	if rowsAffected == 0 {
		return ExamPaperDetail{}, ErrNotFound
	}
	return repo.GetExamPaper(ctx, scope, id)
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

func (repo *MySQLRepository) resolvePaperQuestions(ctx context.Context, tenantID int64, input ExamPaperInput) ([]ExamFixedQuestion, error) {
	switch input.PaperType {
	case ExamPaperTypeFixed:
		items := make([]ExamFixedQuestion, 0, len(input.FixedQuestions))
		for _, question := range input.FixedQuestions {
			items = append(items, ExamFixedQuestion{
				QuestionID:        question.QuestionID,
				QuestionVersionID: question.QuestionVersionID,
				Score:             question.Score,
				DisplayOrder:      question.DisplayOrder,
			})
		}
		return items, nil
	case ExamPaperTypeRandomRule:
		return repo.drawRandomQuestions(ctx, tenantID, input.PaperRules)
	default:
		return nil, ErrInvalidInput
	}
}

func (repo *MySQLRepository) getExamPaperForUse(ctx context.Context, scope Scope, paperID int64) (ExamPaperDetail, error) {
	paper, err := repo.GetExamPaper(ctx, scope, paperID)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	if paper.Status != ExamPaperStatusPublished {
		return ExamPaperDetail{}, ErrInvalidInput
	}
	if paper.QuestionCount <= 0 {
		return ExamPaperDetail{}, ErrInvalidInput
	}
	return paper, nil
}

func (repo *MySQLRepository) listPaperFixedQuestions(ctx context.Context, paperID int64) ([]ExamFixedQuestion, error) {
	const query = `
SELECT question_id, question_version_id, score, order_no, created_at
FROM exam_paper_questions
WHERE paper_id = ?
ORDER BY order_no ASC, id ASC
`
	rows, err := repo.db.QueryContext(ctx, query, paperID)
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

func (repo *MySQLRepository) listPaperRules(ctx context.Context, paperID int64) ([]ExamPaperRule, error) {
	const query = `
SELECT question_type, score_per_question, question_count, knowledge_tag_ids_json, bank_scope_json, course_id, difficulty_range_json, per_knowledge_count_json
FROM exam_paper_question_rules
WHERE paper_id = ?
ORDER BY id ASC
`
	rows, err := repo.db.QueryContext(ctx, query, paperID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamPaperRule, 0)
	for rows.Next() {
		var item ExamPaperRule
		var knowledgeTagJSON sql.NullString
		var bankScopeJSONValue sql.NullString
		var courseID sql.NullInt64
		var difficultyJSON sql.NullString
		var perKnowledgeJSON sql.NullString
		if err := rows.Scan(
			&item.QuestionType,
			&item.ScorePerQuestion,
			&item.QuestionCount,
			&knowledgeTagJSON,
			&bankScopeJSONValue,
			&courseID,
			&difficultyJSON,
			&perKnowledgeJSON,
		); err != nil {
			return nil, err
		}
		if knowledgeTagJSON.Valid {
			_ = json.Unmarshal([]byte(knowledgeTagJSON.String), &item.KnowledgeTagIDs)
		}
		if bankScopeJSONValue.Valid {
			var scope struct {
				BankIDs []int64 `json:"bank_ids"`
			}
			if err := json.Unmarshal([]byte(bankScopeJSONValue.String), &scope); err != nil {
				return nil, err
			}
			item.BankIDs = scope.BankIDs
		}
		if courseID.Valid {
			value := courseID.Int64
			item.CourseID = &value
		}
		if difficultyJSON.Valid {
			_ = json.Unmarshal([]byte(difficultyJSON.String), &item.DifficultyRange)
		}
		if perKnowledgeJSON.Valid {
			_ = json.Unmarshal([]byte(perKnowledgeJSON.String), &item.PerKnowledgeCount)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
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
		args = append(args, *rule.CourseID, *rule.CourseID)
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

func (repo *MySQLRepository) TeacherCanManageClass(ctx context.Context, tenantID int64, teacherID int64, classID int64) (bool, error) {
	const query = `
SELECT id
FROM class_head_teacher_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
`
	return repo.existsByID(ctx, query, tenantID, teacherID, classID)
}

func (repo *MySQLRepository) TeacherCanTeachClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error) {
	const query = `
SELECT id
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
`
	return repo.existsByID(ctx, query, tenantID, teacherID, classID, courseID)
}

func (repo *MySQLRepository) TeacherCanTeachCourse(ctx context.Context, tenantID int64, teacherID int64, courseID int64) (bool, error) {
	const query = `
SELECT id
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND course_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
`
	return repo.existsByID(ctx, query, tenantID, teacherID, courseID)
}

func (repo *MySQLRepository) TeacherCanManageStudent(ctx context.Context, tenantID int64, teacherID int64, studentID int64) (bool, error) {
	const query = `
SELECT chta.id
FROM student_class_memberships scm
JOIN class_head_teacher_assignments chta ON chta.tenant_id = scm.tenant_id AND chta.class_id = scm.class_id
WHERE scm.tenant_id = ? AND scm.student_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
  AND chta.teacher_id = ? AND chta.is_current = 1 AND chta.status = 'active'
LIMIT 1
`
	return repo.existsByID(ctx, query, tenantID, studentID, teacherID)
}

func (repo *MySQLRepository) TeacherCanTeachStudentCourse(ctx context.Context, tenantID int64, teacherID int64, studentID int64, courseID int64) (bool, error) {
	const query = `
SELECT tcca.id
FROM student_class_memberships scm
JOIN teacher_class_course_assignments tcca ON tcca.tenant_id = scm.tenant_id AND tcca.class_id = scm.class_id
WHERE scm.tenant_id = ? AND scm.student_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
  AND tcca.teacher_id = ? AND tcca.course_id = ?
  AND tcca.is_current = 1 AND tcca.status = 'active'
LIMIT 1
`
	return repo.existsByID(ctx, query, tenantID, studentID, teacherID, courseID)
}

func (repo *MySQLRepository) existsByID(ctx context.Context, query string, args ...any) (bool, error) {
	var id int64
	if err := repo.db.QueryRowContext(ctx, query, args...).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
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

func (repo *MySQLRepository) getAttemptByExamUser(ctx context.Context, scope Scope, examID int64) (ExamAttempt, bool, error) {
	const query = `
SELECT id, exam_id, paper_id, tenant_id, user_id, start_at, submit_at, status, objective_score, subjective_score, final_score, created_at, updated_at
FROM exam_attempts
WHERE exam_id = ? AND tenant_id = ? AND user_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, examID, scope.TenantID, scope.UserID)
	item, err := scanAttempt(row)
	if err == sql.ErrNoRows {
		return ExamAttempt{}, false, nil
	}
	if err != nil {
		return ExamAttempt{}, false, err
	}
	return item, true, nil
}

func (repo *MySQLRepository) getAttemptByID(ctx context.Context, scope Scope, attemptID int64) (ExamAttempt, error) {
	const query = `
SELECT id, exam_id, paper_id, tenant_id, user_id, start_at, submit_at, status, objective_score, subjective_score, final_score, created_at, updated_at
FROM exam_attempts
WHERE id = ? AND tenant_id = ? AND user_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, attemptID, scope.TenantID, scope.UserID)
	item, err := scanAttempt(row)
	if err != nil {
		return ExamAttempt{}, wrapExamNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) getAttemptForSubmit(ctx context.Context, scope Scope, attemptID int64) (ExamAttempt, int, error) {
	const query = `
SELECT ea.id, ea.exam_id, ea.paper_id, ea.tenant_id, ea.user_id, ea.start_at, ea.submit_at, ea.status, ea.objective_score, ea.subjective_score, ea.final_score, ea.created_at, ea.updated_at, e.duration_minutes
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id
WHERE ea.id = ? AND ea.tenant_id = ? AND ea.user_id = ?
LIMIT 1
`
	var durationMinutes int
	row := repo.db.QueryRowContext(ctx, query, attemptID, scope.TenantID, scope.UserID)
	item, err := scanAttemptWithDuration(row, &durationMinutes)
	if err != nil {
		return ExamAttempt{}, 0, wrapExamNotFound(err)
	}
	return item, durationMinutes, nil
}

func (repo *MySQLRepository) getPublishedPaperID(ctx context.Context, scope Scope, examID int64) (int64, error) {
	const query = `
SELECT COALESCE(e.paper_id, ep.id)
FROM exams e
LEFT JOIN exam_papers ep ON ep.exam_id = e.id
WHERE e.id = ? AND e.tenant_id = ? AND e.status = ? AND COALESCE(e.paper_id, ep.id) IS NOT NULL
AND (
  EXISTS (
    SELECT 1
    FROM exam_targets et
    WHERE et.exam_id = e.id AND et.target_type = 'user' AND et.target_id = ?
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN student_class_memberships scm ON scm.class_id = et.target_id
    WHERE et.exam_id = e.id AND et.target_type = 'class' AND scm.tenant_id = e.tenant_id AND scm.student_id = ? AND scm.is_current = 1 AND scm.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM exam_targets et
    JOIN teacher_class_course_assignments tcca ON tcca.course_id = et.target_id
    JOIN student_class_memberships scm ON scm.class_id = tcca.class_id
    WHERE et.exam_id = e.id AND et.target_type = 'course' AND tcca.tenant_id = e.tenant_id AND tcca.is_current = 1 AND tcca.status = 'active' AND scm.tenant_id = e.tenant_id AND scm.student_id = ? AND scm.is_current = 1 AND scm.status = 'active'
  )
)
ORDER BY ep.id DESC
LIMIT 1
`
	var paperID int64
	if err := repo.db.QueryRowContext(ctx, query, examID, scope.TenantID, ExamStatusPublished, scope.UserID, scope.UserID, scope.UserID).Scan(&paperID); err != nil {
		return 0, wrapExamNotFound(err)
	}
	return paperID, nil
}

func (repo *MySQLRepository) listAttemptQuestions(ctx context.Context, paperID int64) ([]ExamAttemptQuestion, error) {
	const query = `
SELECT epq.question_id, epq.question_version_id, epq.order_no, epq.score, q.question_type, qv.content_json
FROM exam_paper_questions epq
JOIN questions q ON q.id = epq.question_id
JOIN question_versions qv ON qv.id = epq.question_version_id
WHERE epq.paper_id = ?
ORDER BY epq.order_no ASC
`
	rows, err := repo.db.QueryContext(ctx, query, paperID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamAttemptQuestion, 0)
	for rows.Next() {
		var item ExamAttemptQuestion
		var contentJSON string
		if err := rows.Scan(&item.QuestionID, &item.QuestionVersionID, &item.DisplayOrder, &item.Score, &item.QuestionType, &contentJSON); err != nil {
			return nil, err
		}
		content, err := decodeAnswer(contentJSON)
		if err != nil {
			return nil, err
		}
		item.Content = content
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) listAttemptAnswers(ctx context.Context, attemptID int64) ([]ExamAttemptAnswer, error) {
	const query = `
SELECT attempt_id, question_id, question_version_id, display_order, answer_json, is_correct, score
FROM exam_attempt_answers
WHERE attempt_id = ?
ORDER BY display_order ASC
`
	rows, err := repo.db.QueryContext(ctx, query, attemptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamAttemptAnswer, 0)
	for rows.Next() {
		var item ExamAttemptAnswer
		var answerJSON string
		var isCorrect sql.NullBool
		if err := rows.Scan(&item.AttemptID, &item.QuestionID, &item.QuestionVersionID, &item.DisplayOrder, &answerJSON, &isCorrect, &item.Score); err != nil {
			return nil, err
		}
		answer, err := decodeAnswer(answerJSON)
		if err != nil {
			return nil, err
		}
		item.Answer = answer
		if isCorrect.Valid {
			value := isCorrect.Bool
			item.IsCorrect = &value
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

type attemptAnswerForSubmit struct {
	Answer        ExamAttemptAnswer
	QuestionScore float64
	CorrectAnswer map[string]any
	QuestionType  string
}

func (repo *MySQLRepository) listAttemptAnswersForSubmit(ctx context.Context, attemptID int64) ([]attemptAnswerForSubmit, error) {
	const query = `
SELECT eaa.attempt_id, eaa.question_id, eaa.question_version_id, eaa.display_order, eaa.answer_json, epq.score, qv.answer_json, q.question_type
FROM exam_attempt_answers eaa
JOIN exam_attempts ea ON ea.id = eaa.attempt_id
JOIN exam_paper_questions epq ON epq.paper_id = ea.paper_id AND epq.order_no = eaa.display_order
JOIN question_versions qv ON qv.id = eaa.question_version_id
JOIN questions q ON q.id = eaa.question_id
WHERE eaa.attempt_id = ?
ORDER BY eaa.display_order ASC
`
	rows, err := repo.db.QueryContext(ctx, query, attemptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]attemptAnswerForSubmit, 0)
	for rows.Next() {
		var item attemptAnswerForSubmit
		var answerJSON string
		var correctAnswerJSON string
		if err := rows.Scan(
			&item.Answer.AttemptID,
			&item.Answer.QuestionID,
			&item.Answer.QuestionVersionID,
			&item.Answer.DisplayOrder,
			&answerJSON,
			&item.QuestionScore,
			&correctAnswerJSON,
			&item.QuestionType,
		); err != nil {
			return nil, err
		}
		answer, err := decodeAnswer(answerJSON)
		if err != nil {
			return nil, err
		}
		correctAnswer, err := decodeAnswer(correctAnswerJSON)
		if err != nil {
			return nil, err
		}
		item.Answer.Answer = answer
		item.CorrectAnswer = correctAnswer
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) updateAttemptAnswerJudgement(ctx context.Context, tx *sql.Tx, attemptID int64, displayOrder int, isCorrect bool, score float64, judgedAt time.Time) error {
	const query = `
UPDATE exam_attempt_answers
SET is_correct = ?, score = ?, judged_at = ?, judge_source = 'auto'
WHERE attempt_id = ? AND display_order = ?
`
	_, err := tx.ExecContext(ctx, query, isCorrect, formatExamScore(score), judgedAt, attemptID, displayOrder)
	return err
}

func (repo *MySQLRepository) markAttemptAnswerPendingReview(ctx context.Context, tx *sql.Tx, attemptID int64, displayOrder int) error {
	const query = `
UPDATE exam_attempt_answers
SET is_correct = NULL, score = ?, judged_at = NULL, judge_source = 'manual'
WHERE attempt_id = ? AND display_order = ?
`
	_, err := tx.ExecContext(ctx, query, formatExamScore(0), attemptID, displayOrder)
	return err
}

func (repo *MySQLRepository) upsertExamWrongState(ctx context.Context, tx *sql.Tx, scope Scope, answer ExamAttemptAnswer, wrongAt time.Time) error {
	answerJSON, err := encodeAnswer(answer.Answer)
	if err != nil {
		return err
	}
	const query = `
INSERT INTO user_question_states (tenant_id, user_id, question_id, question_version_id, exam_wrong_count, last_wrong_at, last_answer_json, last_result)
VALUES (?, ?, ?, ?, 1, ?, ?, 'wrong')
ON DUPLICATE KEY UPDATE question_version_id = VALUES(question_version_id), exam_wrong_count = exam_wrong_count + 1, last_wrong_at = VALUES(last_wrong_at), last_answer_json = VALUES(last_answer_json), last_result = VALUES(last_result)
`
	_, err = tx.ExecContext(ctx, query, scope.TenantID, scope.UserID, answer.QuestionID, answer.QuestionVersionID, wrongAt, answerJSON)
	return err
}

func (repo *MySQLRepository) getPaperQuestionByDisplayOrder(ctx context.Context, paperID int64, displayOrder int) (ExamAttemptQuestion, error) {
	const query = `
SELECT question_id, question_version_id, order_no, score
FROM exam_paper_questions
WHERE paper_id = ? AND order_no = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, paperID, displayOrder)
	var item ExamAttemptQuestion
	if err := row.Scan(&item.QuestionID, &item.QuestionVersionID, &item.DisplayOrder, &item.Score); err != nil {
		return ExamAttemptQuestion{}, wrapExamNotFound(err)
	}
	return item, nil
}

func scanExam(rows *sql.Rows) (Exam, error) {
	return scanExamScanner(rows)
}

func scanExamScanner(scanner interface{ Scan(dest ...any) error }) (Exam, error) {
	var item Exam
	var paperID sql.NullInt64
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
		&item.TotalScore,
		&paperID,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return Exam{}, err
	}
	if paperID.Valid {
		value := paperID.Int64
		item.PaperID = &value
	}
	return item, nil
}

func scanExamDetailScanner(scanner interface{ Scan(dest ...any) error }) (Exam, sql.NullString, error) {
	var item Exam
	var ruleJSON sql.NullString
	var paperID sql.NullInt64
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
		&item.TotalScore,
		&paperID,
		&item.CreatedAt,
		&item.UpdatedAt,
		&ruleJSON,
	)
	if err != nil {
		return Exam{}, sql.NullString{}, err
	}
	if paperID.Valid {
		value := paperID.Int64
		item.PaperID = &value
	}
	return item, ruleJSON, nil
}

func scanExamPaper(scanner interface{ Scan(dest ...any) error }) (ExamPaper, error) {
	var item ExamPaper
	var examID sql.NullInt64
	var updatedAt sql.NullTime
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&examID,
		&item.CreatorID,
		&item.PaperType,
		&item.PaperName,
		&item.SourceType,
		&item.Status,
		&item.TotalScore,
		&item.CreatedAt,
		&updatedAt,
		&item.QuestionCount,
	)
	if err != nil {
		return ExamPaper{}, err
	}
	if examID.Valid {
		value := examID.Int64
		item.ExamID = &value
	}
	if updatedAt.Valid {
		value := updatedAt.Time
		item.UpdatedAt = &value
	}
	return item, nil
}

func scanAttempt(scanner interface{ Scan(dest ...any) error }) (ExamAttempt, error) {
	var item ExamAttempt
	var startAt sql.NullTime
	var submitAt sql.NullTime
	err := scanAttemptFields(scanner, &item, &startAt, &submitAt)
	if err != nil {
		return ExamAttempt{}, err
	}
	applyAttemptNullableTimes(&item, startAt, submitAt)
	return item, nil
}

func scanAttemptWithDuration(scanner interface{ Scan(dest ...any) error }, durationMinutes *int) (ExamAttempt, error) {
	var item ExamAttempt
	var startAt sql.NullTime
	var submitAt sql.NullTime
	err := scanner.Scan(
		&item.ID,
		&item.ExamID,
		&item.PaperID,
		&item.TenantID,
		&item.UserID,
		&startAt,
		&submitAt,
		&item.Status,
		&item.ObjectiveScore,
		&item.SubjectiveScore,
		&item.FinalScore,
		&item.CreatedAt,
		&item.UpdatedAt,
		durationMinutes,
	)
	if err != nil {
		return ExamAttempt{}, err
	}
	applyAttemptNullableTimes(&item, startAt, submitAt)
	return item, nil
}

func scanAttemptFields(scanner interface{ Scan(dest ...any) error }, item *ExamAttempt, startAt *sql.NullTime, submitAt *sql.NullTime) error {
	return scanner.Scan(
		&item.ID,
		&item.ExamID,
		&item.PaperID,
		&item.TenantID,
		&item.UserID,
		startAt,
		submitAt,
		&item.Status,
		&item.ObjectiveScore,
		&item.SubjectiveScore,
		&item.FinalScore,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
}

func applyAttemptNullableTimes(item *ExamAttempt, startAt sql.NullTime, submitAt sql.NullTime) {
	if startAt.Valid {
		item.StartAt = &startAt.Time
	}
	if submitAt.Valid {
		item.SubmitAt = &submitAt.Time
	}
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

func encodeAnswer(answer map[string]any) (string, error) {
	raw, err := json.Marshal(answer)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func decodeAnswer(raw string) (map[string]any, error) {
	if strings.TrimSpace(raw) == "" {
		return map[string]any{}, nil
	}
	var answer map[string]any
	if err := json.Unmarshal([]byte(raw), &answer); err != nil {
		return nil, err
	}
	return answer, nil
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
