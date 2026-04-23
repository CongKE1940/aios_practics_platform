package analytics

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

type MySQLRepository struct {
	db *sql.DB
}

const latestPracticeAnswerSubquery = `
(
  SELECT pa1.session_question_id, pa1.user_id, pa1.is_correct, pa1.answered_at
  FROM practice_answers pa1
  JOIN (
    SELECT session_question_id, user_id, MAX(id) AS max_id
    FROM practice_answers
    WHERE answered_at BETWEEN ? AND ?
    GROUP BY session_question_id, user_id
  ) latest ON latest.max_id = pa1.id
)
`

const latestPracticeAnswerWithPayloadSubquery = `
(
  SELECT pa1.session_question_id, pa1.user_id, pa1.answer_json, pa1.is_correct, pa1.answered_at
  FROM practice_answers pa1
  JOIN (
    SELECT session_question_id, user_id, MAX(id) AS max_id
    FROM practice_answers
    GROUP BY session_question_id, user_id
  ) latest ON latest.max_id = pa1.id
)
`

const examTargetStudentsSubquery = `
(
  SELECT DISTINCT target_students.student_id
  FROM (
    SELECT et.target_id AS student_id
    FROM exam_targets et
    WHERE et.exam_id = ? AND et.target_type = 'user'
    UNION
    SELECT scm.student_id
    FROM exam_targets et
    JOIN exams e ON e.id = et.exam_id
    JOIN student_class_memberships scm ON scm.tenant_id = e.tenant_id AND scm.class_id = et.target_id
    WHERE et.exam_id = ? AND et.target_type = 'class'
      AND scm.is_current = 1 AND scm.status = 'active'
    UNION
    SELECT scm.student_id
    FROM exam_targets et
    JOIN exams e ON e.id = et.exam_id
    JOIN teacher_class_course_assignments tcca ON tcca.tenant_id = e.tenant_id AND tcca.course_id = et.target_id
      AND tcca.is_current = 1 AND tcca.status = 'active'
    JOIN student_class_memberships scm ON scm.tenant_id = tcca.tenant_id AND scm.class_id = tcca.class_id
    WHERE et.exam_id = ? AND et.target_type = 'course'
      AND scm.is_current = 1 AND scm.status = 'active'
  ) target_students
)
`

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) GetAdminOverview(ctx context.Context, tenantID int64) (AdminOverviewResult, error) {
	const summaryQuery = `
SELECT
  (SELECT COUNT(*) FROM schools s WHERE s.tenant_id = ? AND s.deleted_at IS NULL AND s.status = 'active') AS school_count,
  (SELECT COUNT(*) FROM classes c WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.status = 'active') AS class_count,
  (SELECT COUNT(*) FROM courses c WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.status = 'active') AS course_count,
  (
    SELECT COUNT(*)
    FROM student_profiles sp
    JOIN users u ON u.id = sp.user_id AND u.tenant_id = sp.tenant_id
    WHERE sp.tenant_id = ? AND sp.enrollment_status = 'active' AND u.status = 'active'
  ) AS active_student_count,
  (
    SELECT COUNT(*)
    FROM teacher_profiles tp
    JOIN users u ON u.id = tp.user_id AND u.tenant_id = tp.tenant_id
    WHERE tp.tenant_id = ? AND u.status = 'active'
  ) AS active_teacher_count,
  (
    SELECT COUNT(DISTINCT ps.id)
    FROM practice_sessions ps
    WHERE ps.tenant_id = ? AND ps.started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  ) AS practice_session_count_7d,
  (
    SELECT COUNT(*)
    FROM exams e
    WHERE e.tenant_id = ? AND e.status = 'published'
  ) AS published_exam_count,
  (
    SELECT COUNT(*)
    FROM exam_attempts ea
    WHERE ea.tenant_id = ? AND ea.status IN ('submitted', 'timeout_submitted')
  ) AS submitted_exam_attempt_count,
  (
    SELECT COUNT(*)
    FROM exam_attempt_answers eaa
    JOIN exam_attempts ea ON ea.id = eaa.attempt_id AND ea.tenant_id = eaa.tenant_id
    JOIN questions q ON q.id = eaa.question_id AND q.tenant_id = eaa.tenant_id
    WHERE eaa.tenant_id = ?
      AND ea.status IN ('submitted', 'timeout_submitted')
      AND q.question_type IN ('short_answer', 'essay')
      AND (eaa.reviewer_user_id IS NULL OR eaa.reviewed_at IS NULL)
  ) AS pending_review_count,
  (
    SELECT COUNT(*)
    FROM student_transitions st
    WHERE st.tenant_id = ? AND st.occurred_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  ) AS recent_transition_count_30d
`
	result := AdminOverviewResult{}
	if err := repo.db.QueryRowContext(
		ctx,
		summaryQuery,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
		tenantID,
	).Scan(
		&result.Summary.SchoolCount,
		&result.Summary.ClassCount,
		&result.Summary.CourseCount,
		&result.Summary.ActiveStudentCount,
		&result.Summary.ActiveTeacherCount,
		&result.Summary.PracticeSessionCount7d,
		&result.Summary.PublishedExamCount,
		&result.Summary.SubmittedExamAttemptCount,
		&result.Summary.PendingReviewCount,
		&result.Summary.RecentTransitionCount30d,
	); err != nil {
		return AdminOverviewResult{}, err
	}

	const recentTransitionsQuery = `
SELECT
  st.id,
  st.student_id,
  u.display_name AS student_name,
  st.transition_type,
  st.from_class_id,
  fc.name AS from_class_name,
  st.to_class_id,
  tc.name AS to_class_name,
  st.occurred_at,
  st.operator_id,
  op.display_name AS operator_name
FROM student_transitions st
JOIN users u ON u.id = st.student_id
LEFT JOIN classes fc ON fc.id = st.from_class_id
LEFT JOIN classes tc ON tc.id = st.to_class_id
LEFT JOIN users op ON op.id = st.operator_id
WHERE st.tenant_id = ?
ORDER BY st.occurred_at DESC, st.id DESC
LIMIT 8
`
	transitionRows, err := repo.db.QueryContext(ctx, recentTransitionsQuery, tenantID)
	if err != nil {
		return AdminOverviewResult{}, err
	}
	defer transitionRows.Close()

	result.RecentTransitions = make([]AdminOverviewRecentTransitionItem, 0)
	for transitionRows.Next() {
		var item AdminOverviewRecentTransitionItem
		var fromClassID sql.NullInt64
		var fromClassName sql.NullString
		var toClassID sql.NullInt64
		var toClassName sql.NullString
		var operatorName sql.NullString
		if err := transitionRows.Scan(
			&item.TransitionID,
			&item.StudentID,
			&item.StudentName,
			&item.TransitionType,
			&fromClassID,
			&fromClassName,
			&toClassID,
			&toClassName,
			&item.OccurredAt,
			&item.OperatorID,
			&operatorName,
		); err != nil {
			return AdminOverviewResult{}, err
		}
		item.FromClassID = nullableInt64(fromClassID)
		item.FromClassName = nullableStringPtr(fromClassName)
		item.ToClassID = nullableInt64(toClassID)
		item.ToClassName = nullableStringPtr(toClassName)
		item.OperatorName = nullableStringPtr(operatorName)
		result.RecentTransitions = append(result.RecentTransitions, item)
	}
	if err := transitionRows.Err(); err != nil {
		return AdminOverviewResult{}, err
	}

	const recentAuditLogsQuery = `
SELECT
  al.id,
  al.module_name,
  al.action_name,
  al.resource_type,
  al.resource_id,
  al.operator_user_id,
  u.display_name AS operator_name,
  al.result,
  al.created_at
FROM audit_logs al
LEFT JOIN users u ON u.id = al.operator_user_id
WHERE al.tenant_id = ?
ORDER BY al.created_at DESC, al.id DESC
LIMIT 8
`
	logRows, err := repo.db.QueryContext(ctx, recentAuditLogsQuery, tenantID)
	if err != nil {
		return AdminOverviewResult{}, err
	}
	defer logRows.Close()

	result.RecentAuditLogs = make([]AdminOverviewRecentAuditLogItem, 0)
	for logRows.Next() {
		var item AdminOverviewRecentAuditLogItem
		var resourceID sql.NullInt64
		var operatorUserID sql.NullInt64
		var operatorName sql.NullString
		if err := logRows.Scan(
			&item.ID,
			&item.ModuleName,
			&item.ActionName,
			&item.ResourceType,
			&resourceID,
			&operatorUserID,
			&operatorName,
			&item.Result,
			&item.CreatedAt,
		); err != nil {
			return AdminOverviewResult{}, err
		}
		item.ResourceID = nullableInt64(resourceID)
		item.OperatorUserID = nullableInt64(operatorUserID)
		item.OperatorName = nullableStringPtr(operatorName)
		result.RecentAuditLogs = append(result.RecentAuditLogs, item)
	}
	if err := logRows.Err(); err != nil {
		return AdminOverviewResult{}, err
	}

	return result, nil
}

func (repo *MySQLRepository) ExamExists(ctx context.Context, tenantID int64, examID int64) (bool, error) {
	const query = `
SELECT id
FROM exams
WHERE tenant_id = ? AND id = ?
LIMIT 1
`
	var id int64
	if err := repo.db.QueryRowContext(ctx, query, tenantID, examID).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (repo *MySQLRepository) GetExamOverviewSummary(ctx context.Context, query ExamOverviewQuery) (ExamOverviewSummary, error) {
	const statement = `
SELECT
  e.id,
  e.name,
  e.exam_mode,
  e.status,
  e.start_time,
  e.end_time,
  e.duration_minutes,
  COALESCE(ep.total_score, 0) AS total_score,
  COUNT(ts.student_id) AS student_count,
  COUNT(ea.id) AS participated_student_count,
  COALESCE(SUM(CASE WHEN ea.status IN ('submitted', 'timeout_submitted') THEN 1 ELSE 0 END), 0) AS submitted_count,
  COALESCE(SUM(CASE WHEN ea.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress_count,
  COUNT(ts.student_id) - COUNT(ea.id) AS absent_count,
  COALESCE(AVG(CASE WHEN ea.status IN ('submitted', 'timeout_submitted') THEN ea.final_score END), 0) AS average_score,
  COALESCE(MAX(CASE WHEN ea.status IN ('submitted', 'timeout_submitted') THEN ea.final_score END), 0) AS highest_score,
  COALESCE(MIN(CASE WHEN ea.status IN ('submitted', 'timeout_submitted') THEN ea.final_score END), 0) AS lowest_score
FROM exams e
LEFT JOIN (
  SELECT exam_id, MAX(total_score) AS total_score
  FROM exam_papers
  WHERE exam_id = ?
  GROUP BY exam_id
) ep ON ep.exam_id = e.id
LEFT JOIN ` + examTargetStudentsSubquery + ` ts ON 1 = 1
LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.user_id = ts.student_id AND ea.tenant_id = e.tenant_id
WHERE e.tenant_id = ? AND e.id = ?
GROUP BY e.id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, ep.total_score
`
	row := repo.db.QueryRowContext(
		ctx,
		statement,
		query.ExamID,
		query.ExamID,
		query.ExamID,
		query.ExamID,
		query.TenantID,
		query.ExamID,
	)
	var summary ExamOverviewSummary
	var startAt sql.NullTime
	var endAt sql.NullTime
	if err := row.Scan(
		&summary.ExamID,
		&summary.ExamName,
		&summary.ExamMode,
		&summary.Status,
		&startAt,
		&endAt,
		&summary.DurationMinutes,
		&summary.TotalScore,
		&summary.StudentCount,
		&summary.ParticipatedStudentCount,
		&summary.SubmittedCount,
		&summary.InProgressCount,
		&summary.AbsentCount,
		&summary.AverageScore,
		&summary.HighestScore,
		&summary.LowestScore,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ExamOverviewSummary{}, ErrNotFound
		}
		return ExamOverviewSummary{}, err
	}
	if startAt.Valid {
		summary.StartTime = &startAt.Time
	}
	if endAt.Valid {
		summary.EndTime = &endAt.Time
	}
	return summary, nil
}

func (repo *MySQLRepository) ListExamOverviewStudents(ctx context.Context, query ExamOverviewQuery) (PageResult[ExamOverviewStudentItem], error) {
	page := normalizePage(query.Page)
	pageSize := normalizePageSize(query.PageSize)
	total, err := repo.countExamOverviewStudents(ctx, query)
	if err != nil {
		return PageResult[ExamOverviewStudentItem]{}, err
	}
	items, err := repo.listExamOverviewStudents(ctx, query, true, pageSize, (page-1)*pageSize)
	if err != nil {
		return PageResult[ExamOverviewStudentItem]{}, err
	}
	return PageResult[ExamOverviewStudentItem]{
		Items:    items,
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}, nil
}

func (repo *MySQLRepository) ListExamOverviewExportStudents(ctx context.Context, query ExamOverviewQuery) ([]ExamOverviewStudentItem, error) {
	return repo.listExamOverviewStudents(ctx, query, false, 0, 0)
}

func (repo *MySQLRepository) countExamOverviewStudents(ctx context.Context, query ExamOverviewQuery) (int, error) {
	filters, args := buildExamOverviewFilterClause(query)
	countQuery := `
SELECT COUNT(*)
FROM ` + examOverviewStudentBaseFromClause() + `
WHERE 1 = 1` + filters
	var total int
	if err := repo.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (repo *MySQLRepository) listExamOverviewStudents(
	ctx context.Context,
	query ExamOverviewQuery,
	paginated bool,
	limit int,
	offset int,
) ([]ExamOverviewStudentItem, error) {
	filters, args := buildExamOverviewFilterClause(query)
	rowQuery := `
SELECT
  u.id AS student_user_id,
  u.display_name AS student_name,
  sp.student_no,
  c.id AS class_id,
  c.name AS class_name,
  ea.id AS attempt_id,
  COALESCE(ea.status, ?) AS attempt_status,
  CASE
    WHEN ea.id IS NULL THEN 'not_started'
    WHEN ea.status NOT IN ('submitted', 'timeout_submitted') THEN 'not_ready'
    WHEN COALESCE(review_stats.subjective_question_count, 0) = 0 THEN 'reviewed'
    WHEN COALESCE(review_stats.pending_review_count, 0) > 0 THEN 'pending'
    ELSE 'reviewed'
  END AS review_status,
  ea.start_at,
  ea.submit_at,
  ea.objective_score,
  review_stats.subjective_score,
  ea.final_score
FROM ` + examOverviewStudentBaseFromClause() + `
WHERE 1 = 1` + filters + `
ORDER BY
  CASE WHEN ea.final_score IS NULL THEN 1 ELSE 0 END ASC,
  ea.final_score DESC,
  ea.submit_at ASC,
  u.display_name ASC,
  u.id ASC`
	args = append([]any{ExamAttemptStatusNotStarted}, args...)
	if paginated {
		rowQuery += "\nLIMIT ? OFFSET ?"
		args = append(args, limit, offset)
	}
	rows, err := repo.db.QueryContext(ctx, rowQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ExamOverviewStudentItem, 0)
	for rows.Next() {
		item, err := scanExamOverviewStudent(rows)
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

func examOverviewStudentBaseFromClause() string {
	return `
` + examTargetStudentsSubquery + ` ts
JOIN users u ON u.id = ts.student_id AND u.tenant_id = ?
LEFT JOIN student_profiles sp ON sp.tenant_id = u.tenant_id AND sp.user_id = u.id
LEFT JOIN student_class_memberships scm ON scm.tenant_id = u.tenant_id AND scm.student_id = u.id
  AND scm.is_current = 1 AND scm.status = 'active'
LEFT JOIN classes c ON c.tenant_id = scm.tenant_id AND c.id = scm.class_id
LEFT JOIN exam_attempts ea ON ea.exam_id = ? AND ea.user_id = u.id AND ea.tenant_id = u.tenant_id
LEFT JOIN (
  SELECT
    eaa.attempt_id,
    SUM(CASE WHEN q.question_type IN ('short_answer', 'essay') THEN 1 ELSE 0 END) AS subjective_question_count,
    SUM(
      CASE
        WHEN q.question_type IN ('short_answer', 'essay') AND (eaa.reviewer_user_id IS NULL OR eaa.reviewed_at IS NULL) THEN 1
        ELSE 0
      END
    ) AS pending_review_count,
    COALESCE(SUM(CASE WHEN q.question_type IN ('short_answer', 'essay') THEN eaa.score ELSE 0 END), 0) AS subjective_score
  FROM exam_attempt_answers eaa
  JOIN questions q ON q.id = eaa.question_id
  GROUP BY eaa.attempt_id
) review_stats ON review_stats.attempt_id = ea.id`
}

func buildExamOverviewFilterClause(query ExamOverviewQuery) (string, []any) {
	args := []any{query.ExamID, query.ExamID, query.ExamID, query.TenantID, query.ExamID}
	filters := strings.Builder{}
	if query.AttemptStatus != "" {
		switch query.AttemptStatus {
		case "submitted":
			filters.WriteString("\n  AND COALESCE(ea.status, 'not_started') IN ('submitted', 'timeout_submitted')")
		default:
			filters.WriteString("\n  AND COALESCE(ea.status, 'not_started') = ?")
			args = append(args, query.AttemptStatus)
		}
	}
	if query.ReviewStatus != "" {
		switch query.ReviewStatus {
		case "pending":
			filters.WriteString(`
  AND ea.id IS NOT NULL
  AND ea.status IN ('submitted', 'timeout_submitted')
  AND COALESCE(review_stats.subjective_question_count, 0) > 0
  AND COALESCE(review_stats.pending_review_count, 0) > 0`)
		case "reviewed":
			filters.WriteString(`
  AND ea.id IS NOT NULL
  AND (
    COALESCE(review_stats.subjective_question_count, 0) = 0
    OR (
      ea.status IN ('submitted', 'timeout_submitted')
      AND COALESCE(review_stats.pending_review_count, 0) = 0
    )
  )`)
		}
	}
	if query.Keyword != "" {
		filters.WriteString("\n  AND (u.display_name LIKE ? OR sp.student_no LIKE ?)")
		likeValue := "%" + query.Keyword + "%"
		args = append(args, likeValue, likeValue)
	}
	return filters.String(), args
}

func (repo *MySQLRepository) GetExamAttemptReview(ctx context.Context, query ExamAttemptReviewQuery) (ExamAttemptReviewResult, error) {
	const summaryQuery = `
SELECT
  ea.id AS attempt_id,
  e.id AS exam_id,
  e.name AS exam_name,
  u.id AS student_user_id,
  u.display_name AS student_name,
  sp.student_no,
  c.id AS class_id,
  c.name AS class_name,
  ea.status,
  ea.start_at,
  ea.submit_at,
  ea.objective_score,
  ea.subjective_score,
  ea.final_score
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id AND e.tenant_id = ea.tenant_id
JOIN users u ON u.id = ea.user_id AND u.tenant_id = ea.tenant_id
LEFT JOIN student_profiles sp ON sp.user_id = u.id AND sp.tenant_id = u.tenant_id
LEFT JOIN student_class_memberships scm ON scm.student_id = u.id AND scm.tenant_id = u.tenant_id
  AND scm.is_current = 1 AND scm.status = 'active'
LEFT JOIN classes c ON c.id = scm.class_id AND c.tenant_id = scm.tenant_id
WHERE ea.id = ? AND ea.tenant_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, summaryQuery, query.AttemptID, query.TenantID)
	summary, err := scanExamAttemptReviewSummary(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ExamAttemptReviewResult{}, ErrNotFound
		}
		return ExamAttemptReviewResult{}, err
	}

	const questionQuery = `
SELECT
  epq.question_id,
  epq.question_version_id,
  epq.order_no,
  q.question_type,
  epq.score,
  qv.content_json,
  qv.answer_json,
  eaa.answer_json,
  eaa.is_correct,
  eaa.score,
  eaa.judge_source,
  eaa.review_comment,
  eaa.reviewer_user_id,
  eaa.reviewed_at
FROM exam_attempts ea
JOIN exam_paper_questions epq ON epq.paper_id = ea.paper_id
JOIN questions q ON q.id = epq.question_id
JOIN question_versions qv ON qv.id = epq.question_version_id
LEFT JOIN exam_attempt_answers eaa ON eaa.attempt_id = ea.id AND eaa.display_order = epq.order_no
WHERE ea.id = ? AND ea.tenant_id = ?
ORDER BY epq.order_no ASC
`
	rows, err := repo.db.QueryContext(ctx, questionQuery, query.AttemptID, query.TenantID)
	if err != nil {
		return ExamAttemptReviewResult{}, err
	}
	defer rows.Close()

	items := make([]ExamAttemptReviewQuestionItem, 0)
	for rows.Next() {
		item, err := scanExamAttemptReviewQuestion(rows)
		if err != nil {
			return ExamAttemptReviewResult{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return ExamAttemptReviewResult{}, err
	}

	return ExamAttemptReviewResult{
		Summary:   summary,
		Questions: items,
	}, nil
}

func (repo *MySQLRepository) UpsertExamAttemptQuestionReview(ctx context.Context, command UpsertExamAttemptQuestionReviewCommand) (ExamAttemptQuestionReviewResult, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}
	defer tx.Rollback()

	current, err := repo.GetExamAttemptReview(ctx, ExamAttemptReviewQuery{
		TenantID:  command.TenantID,
		AttemptID: command.AttemptID,
	})
	if err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}

	var question *ExamAttemptReviewQuestionItem
	for index := range current.Questions {
		if current.Questions[index].DisplayOrder == command.DisplayOrder {
			question = &current.Questions[index]
			break
		}
	}
	if question == nil {
		return ExamAttemptQuestionReviewResult{}, ErrNotFound
	}

	var isCorrect any
	switch {
	case command.Score == 0:
		isCorrect = false
	case command.Score >= question.Score:
		isCorrect = true
	default:
		isCorrect = nil
	}
	reviewedAt := time.Now().UTC()

	const updateAnswerQuery = `
UPDATE exam_attempt_answers
SET is_correct = ?, score = ?, judged_at = ?, judge_source = 'manual', reviewer_user_id = ?, review_comment = ?, reviewed_at = ?
WHERE attempt_id = ? AND display_order = ?
`
	result, err := tx.ExecContext(
		ctx,
		updateAnswerQuery,
		isCorrect,
		formatAnalyticsScore(command.Score),
		reviewedAt,
		command.ReviewerUserID,
		nullableString(command.ReviewComment),
		reviewedAt,
		command.AttemptID,
		command.DisplayOrder,
	)
	if err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}
	if rowsAffected == 0 {
		return ExamAttemptQuestionReviewResult{}, ErrNotFound
	}

	const updateAttemptQuery = `
UPDATE exam_attempts ea
JOIN (
  SELECT
    ea_inner.id AS attempt_id,
    COALESCE(SUM(CASE WHEN q.question_type IN ('short_answer', 'essay') THEN eaa.score ELSE 0 END), 0) AS subjective_score
  FROM exam_attempts ea_inner
  LEFT JOIN exam_attempt_answers eaa ON eaa.attempt_id = ea_inner.id
  LEFT JOIN questions q ON q.id = eaa.question_id
  WHERE ea_inner.id = ? AND ea_inner.tenant_id = ?
  GROUP BY ea_inner.id
) scores ON scores.attempt_id = ea.id
SET ea.subjective_score = scores.subjective_score,
    ea.final_score = ea.objective_score + scores.subjective_score
WHERE ea.id = ? AND ea.tenant_id = ?
`
	if _, err := tx.ExecContext(ctx, updateAttemptQuery, command.AttemptID, command.TenantID, command.AttemptID, command.TenantID); err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}

	if err := tx.Commit(); err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}

	updated, err := repo.GetExamAttemptReview(ctx, ExamAttemptReviewQuery{
		TenantID:  command.TenantID,
		AttemptID: command.AttemptID,
	})
	if err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}
	for _, item := range updated.Questions {
		if item.DisplayOrder == command.DisplayOrder {
			return ExamAttemptQuestionReviewResult{
				Summary:  updated.Summary,
				Question: item,
			}, nil
		}
	}
	return ExamAttemptQuestionReviewResult{}, ErrNotFound
}

func (repo *MySQLRepository) ClassCourseExists(ctx context.Context, tenantID int64, classID int64, courseID int64) (bool, error) {
	const query = `
SELECT c.id
FROM classes c
JOIN courses co ON co.tenant_id = c.tenant_id
WHERE c.tenant_id = ? AND c.id = ? AND co.id = ?
  AND c.status = 'active' AND co.status = 'active'
  AND c.deleted_at IS NULL AND co.deleted_at IS NULL
LIMIT 1
`
	var id int64
	if err := repo.db.QueryRowContext(ctx, query, tenantID, classID, courseID).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (repo *MySQLRepository) TeacherCanViewClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error) {
	const query = `
SELECT id
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
`
	var id int64
	if err := repo.db.QueryRowContext(ctx, query, tenantID, teacherID, classID, courseID).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (repo *MySQLRepository) ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error) {
	const teacherQuery = `
SELECT
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name
FROM teacher_class_course_assignments tcca
JOIN classes c ON c.tenant_id = tcca.tenant_id AND c.id = tcca.class_id
JOIN courses co ON co.tenant_id = tcca.tenant_id AND co.id = tcca.course_id
WHERE tcca.tenant_id = ? AND tcca.teacher_id = ? AND tcca.is_current = 1 AND tcca.status = 'active'
  AND c.status = 'active' AND c.deleted_at IS NULL
  AND co.status = 'active' AND co.deleted_at IS NULL
ORDER BY c.name ASC, co.name ASC
`
	const tenantQuery = `
SELECT
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name
FROM teacher_class_course_assignments tcca
JOIN classes c ON c.tenant_id = tcca.tenant_id AND c.id = tcca.class_id
JOIN courses co ON co.tenant_id = tcca.tenant_id AND co.id = tcca.course_id
WHERE tcca.tenant_id = ? AND tcca.is_current = 1 AND tcca.status = 'active'
  AND c.status = 'active' AND c.deleted_at IS NULL
  AND co.status = 'active' AND co.deleted_at IS NULL
ORDER BY c.name ASC, co.name ASC
`

	query := tenantQuery
	args := []any{scope.TenantID}
	if scope.UserType == "teacher" {
		query = teacherQuery
		args = append(args, scope.UserID)
	}

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	options := make([]ClassCourseOption, 0)
	classIndex := make(map[int64]int)
	seenPairs := make(map[[2]int64]struct{})
	for rows.Next() {
		var classID, courseID int64
		var className, courseName string
		if err := rows.Scan(&classID, &className, &courseID, &courseName); err != nil {
			return nil, err
		}
		pair := [2]int64{classID, courseID}
		if _, exists := seenPairs[pair]; exists {
			continue
		}
		seenPairs[pair] = struct{}{}

		index, exists := classIndex[classID]
		if !exists {
			options = append(options, ClassCourseOption{
				ClassID:   classID,
				ClassName: className,
				Courses:   make([]CourseOptionItem, 0),
			})
			index = len(options) - 1
			classIndex[classID] = index
		}
		options[index].Courses = append(options[index].Courses, CourseOptionItem{
			CourseID:   courseID,
			CourseName: courseName,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(options, func(i, j int) bool {
		if options[i].ClassName == options[j].ClassName {
			return options[i].ClassID < options[j].ClassID
		}
		return options[i].ClassName < options[j].ClassName
	})
	for i := range options {
		sort.Slice(options[i].Courses, func(j, k int) bool {
			if options[i].Courses[j].CourseName == options[i].Courses[k].CourseName {
				return options[i].Courses[j].CourseID < options[i].Courses[k].CourseID
			}
			return options[i].Courses[j].CourseName < options[i].Courses[k].CourseName
		})
	}
	return options, nil
}

func (repo *MySQLRepository) GetClassPracticeSummary(ctx context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error) {
	summary, err := repo.getClassCourseBaseSummary(ctx, query)
	if err != nil {
		return ClassPracticeSummary{}, err
	}
	if err := repo.fillPracticeSummary(ctx, query, &summary); err != nil {
		return ClassPracticeSummary{}, err
	}
	if err := repo.fillQuestionStateSummary(ctx, query, &summary); err != nil {
		return ClassPracticeSummary{}, err
	}
	summary.Accuracy = ratio(summary.CorrectCount, summary.AnsweredCount)
	return summary, nil
}

func (repo *MySQLRepository) ListClassPracticeStudents(ctx context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error) {
	page := normalizePage(query.Page)
	pageSize := normalizePageSize(query.PageSize)

	const countQuery = `
SELECT COUNT(*)
FROM student_class_memberships scm
WHERE scm.tenant_id = ? AND scm.class_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
`
	var total int
	if err := repo.db.QueryRowContext(ctx, countQuery, query.TenantID, query.ClassID).Scan(&total); err != nil {
		return PageResult[ClassPracticeStudentItem]{}, err
	}

	const rowQuery = `
SELECT
  scm.student_id,
  u.display_name,
  sp.student_no,
  (
    SELECT COUNT(DISTINCT ps.id)
    FROM practice_sessions ps
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
      AND ps.started_at BETWEEN ? AND ?
  ) AS session_count,
  (
    SELECT COUNT(pa.session_question_id)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS answered_count,
  (
    SELECT COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS correct_count,
  (
    SELECT COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS wrong_count,
  (
    SELECT MAX(pa.answered_at)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS last_answered_at,
  (
    SELECT MAX(ps.started_at)
    FROM practice_sessions ps
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
      AND ps.started_at BETWEEN ? AND ?
  ) AS last_session_started_at,
  (
    SELECT COUNT(DISTINCT uqs.question_id)
    FROM user_question_states uqs
    WHERE uqs.tenant_id = scm.tenant_id
      AND uqs.user_id = scm.student_id
      AND uqs.practice_wrong_count > 0
      AND EXISTS (
        SELECT 1
        FROM question_bank_questions qbq
        JOIN question_banks qb ON qb.id = qbq.question_bank_id
        JOIN questions q ON q.id = qbq.question_id
        WHERE qbq.question_id = uqs.question_id
          AND qb.tenant_id = scm.tenant_id
          AND q.tenant_id = scm.tenant_id
          AND q.status = 'active'
          AND q.deleted_at IS NULL
          AND qb.course_id = ?
          AND qb.status = 'active'
          AND qb.deleted_at IS NULL
      )
  ) AS wrong_question_count,
  (
    SELECT COUNT(DISTINCT uqs.question_id)
    FROM user_question_states uqs
    WHERE uqs.tenant_id = scm.tenant_id
      AND uqs.user_id = scm.student_id
      AND uqs.is_confused = 1
      AND EXISTS (
        SELECT 1
        FROM question_bank_questions qbq
        JOIN question_banks qb ON qb.id = qbq.question_bank_id
        JOIN questions q ON q.id = qbq.question_id
        WHERE qbq.question_id = uqs.question_id
          AND qb.tenant_id = scm.tenant_id
          AND q.tenant_id = scm.tenant_id
          AND q.status = 'active'
          AND q.deleted_at IS NULL
          AND qb.course_id = ?
          AND qb.status = 'active'
          AND qb.deleted_at IS NULL
      )
  ) AS confused_question_count
FROM student_class_memberships scm
JOIN users u ON u.tenant_id = scm.tenant_id AND u.id = scm.student_id
LEFT JOIN student_profiles sp ON sp.tenant_id = scm.tenant_id AND sp.user_id = scm.student_id
WHERE scm.tenant_id = ? AND scm.class_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
GROUP BY scm.student_id, u.display_name, sp.student_no
ORDER BY u.display_name ASC, scm.student_id ASC
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(
		ctx,
		rowQuery,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.CourseID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.CourseID,
		query.CourseID,
		query.TenantID,
		query.ClassID,
		pageSize,
		(page-1)*pageSize,
	)
	if err != nil {
		return PageResult[ClassPracticeStudentItem]{}, err
	}
	defer rows.Close()

	items := make([]ClassPracticeStudentItem, 0)
	for rows.Next() {
		item, err := scanClassPracticeStudent(rows)
		if err != nil {
			return PageResult[ClassPracticeStudentItem]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[ClassPracticeStudentItem]{}, err
	}
	return PageResult[ClassPracticeStudentItem]{
		Items:    items,
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}, nil
}

func (repo *MySQLRepository) StudentBelongsToClass(ctx context.Context, tenantID int64, classID int64, studentUserID int64) (bool, error) {
	const query = `
SELECT 1
FROM student_class_memberships scm
WHERE scm.tenant_id = ? AND scm.class_id = ? AND scm.student_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
LIMIT 1
`
	var exists int
	if err := repo.db.QueryRowContext(ctx, query, tenantID, classID, studentUserID).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (repo *MySQLRepository) GetStudentPracticeSummary(ctx context.Context, query StudentPracticeDetailQuery) (StudentPracticeSummary, error) {
	const baseQuery = `
SELECT
  u.id AS student_user_id,
  u.display_name AS student_name,
  sp.student_no,
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name
FROM student_class_memberships scm
JOIN users u ON u.tenant_id = scm.tenant_id AND u.id = scm.student_id
LEFT JOIN student_profiles sp ON sp.tenant_id = scm.tenant_id AND sp.user_id = scm.student_id
JOIN classes c ON c.tenant_id = scm.tenant_id AND c.id = scm.class_id
JOIN courses co ON co.tenant_id = scm.tenant_id
WHERE scm.tenant_id = ? AND scm.class_id = ? AND scm.student_id = ? AND co.id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
  AND c.status = 'active' AND c.deleted_at IS NULL
  AND co.status = 'active' AND co.deleted_at IS NULL
LIMIT 1
`
	var summary StudentPracticeSummary
	var studentNo sql.NullString
	if err := repo.db.QueryRowContext(ctx, baseQuery, query.TenantID, query.ClassID, query.StudentUserID, query.CourseID).Scan(
		&summary.StudentUserID,
		&summary.StudentName,
		&studentNo,
		&summary.ClassID,
		&summary.ClassName,
		&summary.CourseID,
		&summary.CourseName,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return StudentPracticeSummary{}, ErrNotFound
		}
		return StudentPracticeSummary{}, err
	}
	if studentNo.Valid {
		summary.StudentNo = &studentNo.String
	}

	const sessionQuery = `
SELECT COUNT(DISTINCT ps.id), MAX(ps.started_at)
FROM practice_sessions ps
WHERE ps.tenant_id = ? AND ps.user_id = ? AND ps.course_id = ?
  AND ps.started_at BETWEEN ? AND ?
  AND EXISTS (
    SELECT 1
    FROM student_class_memberships scm
    WHERE scm.tenant_id = ps.tenant_id AND scm.class_id = ?
      AND scm.student_id = ps.user_id
      AND scm.is_current = 1 AND scm.status = 'active'
  )
`
	var lastSessionStartedAt sql.NullTime
	if err := repo.db.QueryRowContext(
		ctx,
		sessionQuery,
		query.TenantID,
		query.StudentUserID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.ClassID,
	).Scan(&summary.SessionCount, &lastSessionStartedAt); err != nil {
		return StudentPracticeSummary{}, err
	}

	const answerQuery = `
SELECT
  COUNT(pa.session_question_id) AS answered_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0) AS wrong_count,
  MAX(pa.answered_at) AS last_answered_at
FROM practice_sessions ps
JOIN practice_session_questions psq ON psq.session_id = ps.id
JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
WHERE pa.user_id = ?
  AND ps.tenant_id = ? AND ps.user_id = ? AND ps.course_id = ?
  AND EXISTS (
    SELECT 1
    FROM student_class_memberships scm
    WHERE scm.tenant_id = ps.tenant_id AND scm.class_id = ?
      AND scm.student_id = ps.user_id
      AND scm.is_current = 1 AND scm.status = 'active'
  )
`
	var lastAnsweredAt sql.NullTime
	if err := repo.db.QueryRowContext(
		ctx,
		answerQuery,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.StudentUserID,
		query.TenantID,
		query.StudentUserID,
		query.CourseID,
		query.ClassID,
	).Scan(
		&summary.AnsweredCount,
		&summary.CorrectCount,
		&summary.WrongCount,
		&lastAnsweredAt,
	); err != nil {
		return StudentPracticeSummary{}, err
	}

	const stateQuery = `
SELECT
  COUNT(DISTINCT CASE WHEN uqs.practice_wrong_count > 0 THEN uqs.question_id END) AS wrong_question_count,
  COUNT(DISTINCT CASE WHEN uqs.is_confused = 1 THEN uqs.question_id END) AS confused_question_count
FROM user_question_states uqs
WHERE uqs.tenant_id = ? AND uqs.user_id = ?
  AND EXISTS (
    SELECT 1
    FROM question_bank_questions qbq
    JOIN question_banks qb ON qb.id = qbq.question_bank_id
    JOIN questions q ON q.id = qbq.question_id
    WHERE qbq.question_id = uqs.question_id
      AND qb.tenant_id = uqs.tenant_id
      AND q.tenant_id = uqs.tenant_id
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND qb.course_id = ?
      AND qb.status = 'active'
      AND qb.deleted_at IS NULL
  )
`
	if err := repo.db.QueryRowContext(ctx, stateQuery, query.TenantID, query.StudentUserID, query.CourseID).Scan(
		&summary.WrongQuestionCount,
		&summary.ConfusedQuestionCount,
	); err != nil {
		return StudentPracticeSummary{}, err
	}

	if lastAnsweredAt.Valid {
		summary.LastPracticedAt = &lastAnsweredAt.Time
	} else if lastSessionStartedAt.Valid {
		summary.LastPracticedAt = &lastSessionStartedAt.Time
	}
	summary.Accuracy = ratio(summary.CorrectCount, summary.AnsweredCount)
	return summary, nil
}

func (repo *MySQLRepository) ListStudentPracticeSessions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeSessionItem], error) {
	page := normalizePage(query.Page)
	pageSize := normalizePageSize(query.PageSize)

	const countQuery = `
SELECT COUNT(*)
FROM practice_sessions ps
WHERE ps.tenant_id = ? AND ps.user_id = ? AND ps.course_id = ?
  AND ps.started_at BETWEEN ? AND ?
  AND EXISTS (
    SELECT 1
    FROM student_class_memberships scm
    WHERE scm.tenant_id = ps.tenant_id AND scm.class_id = ?
      AND scm.student_id = ps.user_id
      AND scm.is_current = 1 AND scm.status = 'active'
  )
`
	var total int
	if err := repo.db.QueryRowContext(
		ctx,
		countQuery,
		query.TenantID,
		query.StudentUserID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.ClassID,
	).Scan(&total); err != nil {
		return PageResult[StudentPracticeSessionItem]{}, err
	}

	const rowQuery = `
SELECT
  ps.id AS session_id,
  ps.started_at,
  ps.ended_at AS finished_at,
  ps.status,
  COUNT(DISTINCT psq.id) AS total_count,
  COUNT(pa.session_question_id) AS answered_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0) AS wrong_count
FROM practice_sessions ps
LEFT JOIN practice_session_questions psq ON psq.session_id = ps.id
LEFT JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
  AND pa.user_id = ?
WHERE ps.tenant_id = ? AND ps.user_id = ? AND ps.course_id = ?
  AND ps.started_at BETWEEN ? AND ?
  AND EXISTS (
    SELECT 1
    FROM student_class_memberships scm
    WHERE scm.tenant_id = ps.tenant_id AND scm.class_id = ?
      AND scm.student_id = ps.user_id
      AND scm.is_current = 1 AND scm.status = 'active'
  )
GROUP BY ps.id, ps.started_at, ps.ended_at, ps.status
ORDER BY COALESCE(MAX(pa.answered_at), ps.started_at) DESC, ps.id DESC
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(
		ctx,
		rowQuery,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.StudentUserID,
		query.TenantID,
		query.StudentUserID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.ClassID,
		pageSize,
		(page-1)*pageSize,
	)
	if err != nil {
		return PageResult[StudentPracticeSessionItem]{}, err
	}
	defer rows.Close()

	items := make([]StudentPracticeSessionItem, 0)
	for rows.Next() {
		item, err := scanStudentPracticeSession(rows)
		if err != nil {
			return PageResult[StudentPracticeSessionItem]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[StudentPracticeSessionItem]{}, err
	}

	return PageResult[StudentPracticeSessionItem]{
		Items:    items,
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}, nil
}

func (repo *MySQLRepository) ListStudentWrongQuestions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error) {
	return repo.listStudentPracticeQuestions(ctx, query, "uqs.practice_wrong_count > 0", "uqs.last_wrong_at", "uqs.last_wrong_at DESC, uqs.question_id DESC")
}

func (repo *MySQLRepository) ListStudentConfusedQuestions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error) {
	return repo.listStudentPracticeQuestions(ctx, query, "uqs.is_confused = 1", "uqs.confused_at", "uqs.confused_at DESC, uqs.question_id DESC")
}

func (repo *MySQLRepository) GetStudentPracticeSessionDetail(ctx context.Context, query StudentPracticeSessionDetailQuery) (StudentPracticeSessionDetailResult, error) {
	const sessionQuery = `
SELECT
  u.id AS student_user_id,
  u.display_name AS student_name,
  sp.student_no,
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name,
  ps.id AS session_id,
  ps.started_at,
  ps.ended_at AS finished_at,
  ps.status,
  ps.practice_mode,
  ps.source_mode,
  ps.bank_scope_json
FROM practice_sessions ps
JOIN users u ON u.tenant_id = ps.tenant_id AND u.id = ps.user_id
LEFT JOIN student_profiles sp ON sp.tenant_id = ps.tenant_id AND sp.user_id = ps.user_id
JOIN student_class_memberships scm ON scm.tenant_id = ps.tenant_id
  AND scm.student_id = ps.user_id
  AND scm.class_id = ?
  AND scm.is_current = 1
  AND scm.status = 'active'
JOIN classes c ON c.tenant_id = scm.tenant_id AND c.id = scm.class_id
  AND c.status = 'active'
  AND c.deleted_at IS NULL
JOIN courses co ON co.tenant_id = ps.tenant_id AND co.id = ps.course_id
  AND co.status = 'active'
  AND co.deleted_at IS NULL
WHERE ps.tenant_id = ? AND ps.id = ? AND ps.user_id = ? AND ps.course_id = ?
LIMIT 1
`
	result := StudentPracticeSessionDetailResult{
		Questions: make([]StudentPracticeSessionQuestionItem, 0),
	}
	var (
		studentNo     sql.NullString
		startedAt     sql.NullTime
		finishedAt    sql.NullTime
		bankScopeJSON []byte
	)
	if err := repo.db.QueryRowContext(
		ctx,
		sessionQuery,
		query.ClassID,
		query.TenantID,
		query.SessionID,
		query.StudentUserID,
		query.CourseID,
	).Scan(
		&result.StudentSummary.StudentUserID,
		&result.StudentSummary.StudentName,
		&studentNo,
		&result.StudentSummary.ClassID,
		&result.StudentSummary.ClassName,
		&result.StudentSummary.CourseID,
		&result.StudentSummary.CourseName,
		&result.Session.SessionID,
		&startedAt,
		&finishedAt,
		&result.Session.Status,
		&result.Session.PracticeMode,
		&result.Session.SourceMode,
		&bankScopeJSON,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return StudentPracticeSessionDetailResult{}, ErrNotFound
		}
		return StudentPracticeSessionDetailResult{}, err
	}
	if studentNo.Valid {
		result.StudentSummary.StudentNo = &studentNo.String
	}
	if startedAt.Valid {
		result.Session.StartedAt = &startedAt.Time
	}
	if finishedAt.Valid {
		result.Session.FinishedAt = &finishedAt.Time
	}
	bankScope, err := decodeJSONMap(bankScopeJSON)
	if err != nil {
		return StudentPracticeSessionDetailResult{}, err
	}
	if flowMode, ok := bankScope["flow_mode"].(string); ok {
		result.Session.FlowMode = flowMode
	}

	const questionQuery = `
SELECT
  psq.id AS session_question_id,
  psq.question_id,
  psq.question_version_id,
  psq.display_order,
  q.question_type,
  psq.presented_options_json,
  qv.content_json,
  qv.answer_json,
  qv.analysis_json,
  pa.answer_json AS student_answer_json,
  pa.is_correct,
  pa.answered_at
FROM practice_session_questions psq
JOIN questions q ON q.id = psq.question_id
LEFT JOIN question_versions qv ON qv.id = psq.question_version_id
LEFT JOIN ` + latestPracticeAnswerWithPayloadSubquery + ` pa ON pa.session_question_id = psq.id
  AND pa.user_id = ?
WHERE psq.session_id = ?
ORDER BY psq.display_order ASC, psq.id ASC
`
	rows, err := repo.db.QueryContext(ctx, questionQuery, query.StudentUserID, query.SessionID)
	if err != nil {
		return StudentPracticeSessionDetailResult{}, err
	}
	defer rows.Close()

	correctCount := 0
	wrongCount := 0
	answeredCount := 0
	for rows.Next() {
		item, answered, isCorrect, err := scanStudentPracticeSessionDetailQuestion(rows)
		if err != nil {
			return StudentPracticeSessionDetailResult{}, err
		}
		if answered {
			answeredCount++
			if isCorrect {
				correctCount++
			} else {
				wrongCount++
			}
		}
		result.Questions = append(result.Questions, item)
	}
	if err := rows.Err(); err != nil {
		return StudentPracticeSessionDetailResult{}, err
	}

	result.Session.TotalCount = len(result.Questions)
	result.Session.AnsweredCount = answeredCount
	result.Session.CorrectCount = correctCount
	result.Session.WrongCount = wrongCount
	result.Session.Accuracy = ratio(correctCount, answeredCount)

	return result, nil
}

func (repo *MySQLRepository) GetStudentPracticeSessionQuestionDetail(ctx context.Context, query StudentPracticeSessionQuestionDetailQuery) (StudentPracticeSessionQuestionDetailResult, error) {
	sessionResult, err := repo.GetStudentPracticeSessionDetail(ctx, StudentPracticeSessionDetailQuery{
		TenantID:      query.TenantID,
		ClassID:       query.ClassID,
		CourseID:      query.CourseID,
		StudentUserID: query.StudentUserID,
		SessionID:     query.SessionID,
	})
	if err != nil {
		return StudentPracticeSessionQuestionDetailResult{}, err
	}

	for _, question := range sessionResult.Questions {
		if question.SessionQuestionID != query.SessionQuestionID {
			continue
		}
		return StudentPracticeSessionQuestionDetailResult{
			StudentSummary: sessionResult.StudentSummary,
			Session:        sessionResult.Session,
			QuestionDetail: question,
		}, nil
	}
	return StudentPracticeSessionQuestionDetailResult{}, ErrNotFound
}

func (repo *MySQLRepository) GetStudentPracticeSessionQuestionReview(ctx context.Context, query StudentPracticeSessionQuestionDetailQuery) (*StudentPracticeSessionQuestionReview, error) {
	const reviewQuery = `
SELECT id, teacher_user_id, review_comment, updated_at
FROM practice_session_question_reviews
WHERE tenant_id = ? AND session_question_id = ? AND teacher_user_id = ? AND status = 'active'
LIMIT 1
`
	var (
		review    StudentPracticeSessionQuestionReview
		updatedAt sql.NullTime
	)
	if err := repo.db.QueryRowContext(ctx, reviewQuery, query.TenantID, query.SessionQuestionID, query.ReviewerUserID).Scan(
		&review.ReviewID,
		&review.ReviewerUserID,
		&review.ReviewComment,
		&updatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if updatedAt.Valid {
		review.LastUpdatedAt = &updatedAt.Time
	}
	return &review, nil
}

func (repo *MySQLRepository) UpsertStudentPracticeSessionQuestionReview(ctx context.Context, command UpsertStudentPracticeSessionQuestionReviewCommand) (StudentPracticeSessionQuestionReview, error) {
	const upsertQuery = `
INSERT INTO practice_session_question_reviews (
  tenant_id,
  class_id,
  course_id,
  student_user_id,
  session_id,
  session_question_id,
  teacher_user_id,
  review_comment,
  status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
ON DUPLICATE KEY UPDATE
  class_id = VALUES(class_id),
  course_id = VALUES(course_id),
  student_user_id = VALUES(student_user_id),
  session_id = VALUES(session_id),
  review_comment = VALUES(review_comment),
  status = 'active',
  updated_at = CURRENT_TIMESTAMP(3)
`
	if _, err := repo.db.ExecContext(
		ctx,
		upsertQuery,
		command.TenantID,
		command.ClassID,
		command.CourseID,
		command.StudentUserID,
		command.SessionID,
		command.SessionQuestionID,
		command.ReviewerUserID,
		command.ReviewComment,
	); err != nil {
		return StudentPracticeSessionQuestionReview{}, err
	}

	review, err := repo.GetStudentPracticeSessionQuestionReview(ctx, StudentPracticeSessionQuestionDetailQuery{
		TenantID:          command.TenantID,
		SessionQuestionID: command.SessionQuestionID,
		ReviewerUserID:    command.ReviewerUserID,
	})
	if err != nil {
		return StudentPracticeSessionQuestionReview{}, err
	}
	if review == nil {
		return StudentPracticeSessionQuestionReview{}, ErrNotFound
	}
	return *review, nil
}

func (repo *MySQLRepository) listStudentPracticeQuestions(ctx context.Context, query StudentPracticeDetailQuery, stateFilter string, stateTimeColumn string, orderBy string) (PageResult[StudentPracticeQuestionItem], error) {
	page := normalizePage(query.Page)
	pageSize := normalizePageSize(query.PageSize)

	countQuery := `
SELECT COUNT(*)
FROM user_question_states uqs
WHERE uqs.tenant_id = ? AND uqs.user_id = ?
  AND EXISTS (
    SELECT 1
    FROM student_class_memberships scm
    WHERE scm.tenant_id = uqs.tenant_id AND scm.class_id = ?
      AND scm.student_id = uqs.user_id
      AND scm.is_current = 1 AND scm.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM question_bank_questions qbq
    JOIN question_banks qb ON qb.id = qbq.question_bank_id
    JOIN questions q ON q.id = qbq.question_id
    WHERE qbq.question_id = uqs.question_id
      AND qb.tenant_id = uqs.tenant_id
      AND q.tenant_id = uqs.tenant_id
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND qb.course_id = ?
      AND qb.status = 'active'
      AND qb.deleted_at IS NULL
  )
  AND ` + stateFilter + `
  AND ` + stateTimeColumn + ` BETWEEN ? AND ?
`
	var total int
	if err := repo.db.QueryRowContext(
		ctx,
		countQuery,
		query.TenantID,
		query.StudentUserID,
		query.ClassID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
	).Scan(&total); err != nil {
		return PageResult[StudentPracticeQuestionItem]{}, err
	}

	rowQuery := `
SELECT
  uqs.question_id,
  uqs.question_version_id,
  q.question_type,
  JSON_UNQUOTE(JSON_EXTRACT(qv.content_json, '$.stem.text')) AS stem,
  uqs.practice_wrong_count,
  uqs.last_wrong_at,
  uqs.is_confused,
  uqs.confused_at,
  COALESCE(uqs.last_result, '') AS last_result
FROM user_question_states uqs
JOIN questions q ON q.id = uqs.question_id AND q.tenant_id = uqs.tenant_id
  AND q.status = 'active' AND q.deleted_at IS NULL
JOIN question_versions qv ON qv.id = uqs.question_version_id
WHERE uqs.tenant_id = ? AND uqs.user_id = ?
  AND EXISTS (
    SELECT 1
    FROM student_class_memberships scm
    WHERE scm.tenant_id = uqs.tenant_id AND scm.class_id = ?
      AND scm.student_id = uqs.user_id
      AND scm.is_current = 1 AND scm.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM question_bank_questions qbq
    JOIN question_banks qb ON qb.id = qbq.question_bank_id
    WHERE qbq.question_id = uqs.question_id
      AND qb.tenant_id = uqs.tenant_id
      AND qb.course_id = ?
      AND qb.status = 'active'
      AND qb.deleted_at IS NULL
  )
  AND ` + stateFilter + `
  AND ` + stateTimeColumn + ` BETWEEN ? AND ?
ORDER BY ` + orderBy + `
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(
		ctx,
		rowQuery,
		query.TenantID,
		query.StudentUserID,
		query.ClassID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		pageSize,
		(page-1)*pageSize,
	)
	if err != nil {
		return PageResult[StudentPracticeQuestionItem]{}, err
	}
	defer rows.Close()

	items := make([]StudentPracticeQuestionItem, 0)
	for rows.Next() {
		item, err := scanStudentPracticeQuestion(rows)
		if err != nil {
			return PageResult[StudentPracticeQuestionItem]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[StudentPracticeQuestionItem]{}, err
	}
	if err := repo.fillLatestSessionRefsForQuestions(ctx, query, items); err != nil {
		return PageResult[StudentPracticeQuestionItem]{}, err
	}

	return PageResult[StudentPracticeQuestionItem]{
		Items:    items,
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}, nil
}

func (repo *MySQLRepository) fillLatestSessionRefsForQuestions(ctx context.Context, query StudentPracticeDetailQuery, items []StudentPracticeQuestionItem) error {
	if len(items) == 0 {
		return nil
	}

	questionIDs := make([]int64, 0, len(items))
	seen := make(map[int64]struct{}, len(items))
	for _, item := range items {
		if _, ok := seen[item.QuestionID]; ok {
			continue
		}
		seen[item.QuestionID] = struct{}{}
		questionIDs = append(questionIDs, item.QuestionID)
	}
	if len(questionIDs) == 0 {
		return nil
	}

	placeholders := questionIDPlaceholders(len(questionIDs))

	innerArgs := make([]any, 0, 3+len(questionIDs))
	innerArgs = append(innerArgs, query.TenantID, query.StudentUserID, query.CourseID)
	for _, questionID := range questionIDs {
		innerArgs = append(innerArgs, questionID)
	}

	rowQuery := fmt.Sprintf(`
SELECT
  pa.question_id,
  psq.session_id,
  pa.session_question_id
FROM practice_answers pa
JOIN practice_session_questions psq ON psq.id = pa.session_question_id
JOIN (
  SELECT pa2.question_id, MAX(pa2.id) AS max_id
  FROM practice_answers pa2
  JOIN practice_session_questions psq2 ON psq2.id = pa2.session_question_id
  JOIN practice_sessions ps2 ON ps2.id = psq2.session_id
  WHERE ps2.tenant_id = ? AND ps2.user_id = ? AND ps2.course_id = ?
    AND pa2.question_id IN (%s)
  GROUP BY pa2.question_id
) latest ON latest.max_id = pa.id
`, placeholders)

	rows, err := repo.db.QueryContext(ctx, rowQuery, innerArgs...)
	if err != nil {
		return err
	}
	defer rows.Close()

	type sessionRef struct {
		sessionID         int64
		sessionQuestionID int64
	}
	refsByQuestionID := make(map[int64]sessionRef, len(questionIDs))
	for rows.Next() {
		var (
			questionID        int64
			sessionID         int64
			sessionQuestionID int64
		)
		if err := rows.Scan(&questionID, &sessionID, &sessionQuestionID); err != nil {
			return err
		}
		refsByQuestionID[questionID] = sessionRef{
			sessionID:         sessionID,
			sessionQuestionID: sessionQuestionID,
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for index := range items {
		ref, ok := refsByQuestionID[items[index].QuestionID]
		if !ok {
			continue
		}
		items[index].LastSessionID = &ref.sessionID
		items[index].LastSessionQuestionID = &ref.sessionQuestionID
	}
	return nil
}

func (repo *MySQLRepository) getClassCourseBaseSummary(ctx context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error) {
	const baseQuery = `
SELECT
  c.id,
  c.name,
  co.id,
  co.name,
  COUNT(DISTINCT scm.student_id) AS student_count
FROM classes c
JOIN courses co ON co.tenant_id = c.tenant_id
LEFT JOIN student_class_memberships scm ON scm.tenant_id = c.tenant_id
  AND scm.class_id = c.id
  AND scm.is_current = 1
  AND scm.status = 'active'
WHERE c.tenant_id = ? AND c.id = ? AND co.id = ?
  AND c.status = 'active' AND co.status = 'active'
  AND c.deleted_at IS NULL AND co.deleted_at IS NULL
GROUP BY c.id, c.name, co.id, co.name
LIMIT 1
`
	var summary ClassPracticeSummary
	if err := repo.db.QueryRowContext(ctx, baseQuery, query.TenantID, query.ClassID, query.CourseID).Scan(
		&summary.ClassID,
		&summary.ClassName,
		&summary.CourseID,
		&summary.CourseName,
		&summary.StudentCount,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ClassPracticeSummary{}, ErrNotFound
		}
		return ClassPracticeSummary{}, err
	}
	return summary, nil
}

func (repo *MySQLRepository) fillPracticeSummary(ctx context.Context, query ClassPracticeSummaryQuery, summary *ClassPracticeSummary) error {
	const participatedQuery = `
SELECT COUNT(DISTINCT participated.student_id)
FROM (
  SELECT scm.student_id
  FROM student_class_memberships scm
  JOIN practice_sessions ps ON ps.tenant_id = scm.tenant_id
    AND ps.user_id = scm.student_id
    AND ps.course_id = ?
    AND ps.started_at BETWEEN ? AND ?
  WHERE scm.tenant_id = ? AND scm.class_id = ?
    AND scm.is_current = 1 AND scm.status = 'active'
  UNION
  SELECT scm.student_id
  FROM student_class_memberships scm
  JOIN practice_sessions ps ON ps.tenant_id = scm.tenant_id
    AND ps.user_id = scm.student_id
    AND ps.course_id = ?
  JOIN practice_session_questions psq ON psq.session_id = ps.id
  JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
    AND pa.user_id = scm.student_id
  WHERE scm.tenant_id = ? AND scm.class_id = ?
    AND scm.is_current = 1 AND scm.status = 'active'
) participated
`
	if err := repo.db.QueryRowContext(
		ctx,
		participatedQuery,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.TenantID,
		query.ClassID,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.TenantID,
		query.ClassID,
	).Scan(&summary.ParticipatedStudentCount); err != nil {
		return err
	}

	const sessionQuery = `
SELECT COUNT(DISTINCT ps.id), MAX(ps.started_at)
FROM student_class_memberships scm
JOIN practice_sessions ps ON ps.tenant_id = scm.tenant_id
  AND ps.user_id = scm.student_id
  AND ps.course_id = ?
  AND ps.started_at BETWEEN ? AND ?
WHERE scm.tenant_id = ? AND scm.class_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
`
	var lastSessionStartedAt sql.NullTime
	if err := repo.db.QueryRowContext(
		ctx,
		sessionQuery,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.TenantID,
		query.ClassID,
	).Scan(
		&summary.SessionCount,
		&lastSessionStartedAt,
	); err != nil {
		return err
	}

	const answerQuery = `
SELECT
  COUNT(pa.session_question_id) AS answered_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0) AS wrong_count,
  MAX(pa.answered_at) AS last_answered_at
FROM student_class_memberships scm
JOIN practice_sessions ps ON ps.tenant_id = scm.tenant_id
  AND ps.user_id = scm.student_id
  AND ps.course_id = ?
JOIN practice_session_questions psq ON psq.session_id = ps.id
JOIN ` + latestPracticeAnswerSubquery + ` pa ON pa.session_question_id = psq.id
  AND pa.user_id = scm.student_id
WHERE scm.tenant_id = ? AND scm.class_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
`
	var lastAnsweredAt sql.NullTime
	if err := repo.db.QueryRowContext(
		ctx,
		answerQuery,
		query.CourseID,
		sqlTimeArg(query.StartAt),
		sqlTimeArg(query.EndAt),
		query.TenantID,
		query.ClassID,
	).Scan(
		&summary.AnsweredCount,
		&summary.CorrectCount,
		&summary.WrongCount,
		&lastAnsweredAt,
	); err != nil {
		return err
	}
	if lastAnsweredAt.Valid {
		summary.LastPracticedAt = &lastAnsweredAt.Time
	} else if lastSessionStartedAt.Valid {
		summary.LastPracticedAt = &lastSessionStartedAt.Time
	}
	return nil
}

func (repo *MySQLRepository) fillQuestionStateSummary(ctx context.Context, query ClassPracticeSummaryQuery, summary *ClassPracticeSummary) error {
	const stateQuery = `
SELECT
  COUNT(DISTINCT CASE WHEN uqs.practice_wrong_count > 0 THEN uqs.question_id END) AS wrong_question_count,
  COUNT(DISTINCT CASE WHEN uqs.is_confused = 1 THEN uqs.question_id END) AS confused_question_count
FROM student_class_memberships scm
JOIN user_question_states uqs ON uqs.tenant_id = scm.tenant_id AND uqs.user_id = scm.student_id
WHERE scm.tenant_id = ? AND scm.class_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM question_bank_questions qbq
    JOIN question_banks qb ON qb.id = qbq.question_bank_id
    JOIN questions q ON q.id = qbq.question_id
    WHERE qbq.question_id = uqs.question_id
      AND qb.tenant_id = scm.tenant_id
      AND q.tenant_id = scm.tenant_id
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND qb.course_id = ?
      AND qb.status = 'active'
      AND qb.deleted_at IS NULL
  )
`
	return repo.db.QueryRowContext(ctx, stateQuery, query.TenantID, query.ClassID, query.CourseID).Scan(
		&summary.WrongQuestionCount,
		&summary.ConfusedQuestionCount,
	)
}

func scanClassPracticeStudent(scanner interface{ Scan(dest ...any) error }) (ClassPracticeStudentItem, error) {
	var item ClassPracticeStudentItem
	var studentNo sql.NullString
	var lastAnsweredAt sql.NullTime
	var lastSessionStartedAt sql.NullTime
	if err := scanner.Scan(
		&item.StudentID,
		&item.StudentName,
		&studentNo,
		&item.SessionCount,
		&item.AnsweredCount,
		&item.CorrectCount,
		&item.WrongCount,
		&lastAnsweredAt,
		&lastSessionStartedAt,
		&item.WrongQuestionCount,
		&item.ConfusedQuestionCount,
	); err != nil {
		return ClassPracticeStudentItem{}, err
	}
	if studentNo.Valid {
		item.StudentNo = &studentNo.String
	}
	if lastAnsweredAt.Valid {
		item.LastPracticedAt = &lastAnsweredAt.Time
	} else if lastSessionStartedAt.Valid {
		item.LastPracticedAt = &lastSessionStartedAt.Time
	}
	item.Accuracy = ratio(item.CorrectCount, item.AnsweredCount)
	return item, nil
}

func scanExamOverviewStudent(scanner interface{ Scan(dest ...any) error }) (ExamOverviewStudentItem, error) {
	var item ExamOverviewStudentItem
	var (
		studentNo       sql.NullString
		classID         sql.NullInt64
		className       sql.NullString
		attemptID       sql.NullInt64
		startedAt       sql.NullTime
		submitAt        sql.NullTime
		objectiveScore  sql.NullFloat64
		subjectiveScore sql.NullFloat64
		finalScore      sql.NullFloat64
	)
	if err := scanner.Scan(
		&item.StudentUserID,
		&item.StudentName,
		&studentNo,
		&classID,
		&className,
		&attemptID,
		&item.AttemptStatus,
		&item.ReviewStatus,
		&startedAt,
		&submitAt,
		&objectiveScore,
		&subjectiveScore,
		&finalScore,
	); err != nil {
		return ExamOverviewStudentItem{}, err
	}
	if studentNo.Valid {
		item.StudentNo = &studentNo.String
	}
	if classID.Valid {
		item.ClassID = &classID.Int64
	}
	if className.Valid {
		item.ClassName = &className.String
	}
	if attemptID.Valid {
		item.AttemptID = &attemptID.Int64
	}
	if startedAt.Valid {
		item.StartedAt = &startedAt.Time
	}
	if submitAt.Valid {
		item.SubmitAt = &submitAt.Time
	}
	if objectiveScore.Valid {
		item.ObjectiveScore = &objectiveScore.Float64
	}
	if subjectiveScore.Valid {
		item.SubjectiveScore = &subjectiveScore.Float64
	}
	if finalScore.Valid {
		item.FinalScore = &finalScore.Float64
	}
	return item, nil
}

func scanExamAttemptReviewSummary(scanner interface{ Scan(dest ...any) error }) (ExamAttemptReviewSummary, error) {
	var item ExamAttemptReviewSummary
	var (
		studentNo sql.NullString
		classID   sql.NullInt64
		className sql.NullString
		startAt   sql.NullTime
		submitAt  sql.NullTime
	)
	if err := scanner.Scan(
		&item.AttemptID,
		&item.ExamID,
		&item.ExamName,
		&item.StudentUserID,
		&item.StudentName,
		&studentNo,
		&classID,
		&className,
		&item.AttemptStatus,
		&startAt,
		&submitAt,
		&item.ObjectiveScore,
		&item.SubjectiveScore,
		&item.FinalScore,
	); err != nil {
		return ExamAttemptReviewSummary{}, err
	}
	if studentNo.Valid {
		item.StudentNo = &studentNo.String
	}
	if classID.Valid {
		item.ClassID = &classID.Int64
	}
	if className.Valid {
		item.ClassName = &className.String
	}
	if startAt.Valid {
		item.StartedAt = &startAt.Time
	}
	if submitAt.Valid {
		item.SubmitAt = &submitAt.Time
	}
	return item, nil
}

func scanExamAttemptReviewQuestion(scanner interface{ Scan(dest ...any) error }) (ExamAttemptReviewQuestionItem, error) {
	var item ExamAttemptReviewQuestionItem
	var (
		contentJSON    []byte
		correctJSON    []byte
		studentJSON    []byte
		isCorrect      sql.NullBool
		answerScore    sql.NullFloat64
		judgeSource    sql.NullString
		reviewComment  sql.NullString
		reviewerUserID sql.NullInt64
		reviewedAt     sql.NullTime
	)
	if err := scanner.Scan(
		&item.QuestionID,
		&item.QuestionVersionID,
		&item.DisplayOrder,
		&item.QuestionType,
		&item.Score,
		&contentJSON,
		&correctJSON,
		&studentJSON,
		&isCorrect,
		&answerScore,
		&judgeSource,
		&reviewComment,
		&reviewerUserID,
		&reviewedAt,
	); err != nil {
		return ExamAttemptReviewQuestionItem{}, err
	}
	var err error
	item.Content, err = decodeJSONMap(contentJSON)
	if err != nil {
		return ExamAttemptReviewQuestionItem{}, err
	}
	item.CorrectAnswer, err = decodeJSONMap(correctJSON)
	if err != nil {
		return ExamAttemptReviewQuestionItem{}, err
	}
	if len(studentJSON) > 0 {
		item.StudentAnswer, err = decodeJSONMap(studentJSON)
		if err != nil {
			return ExamAttemptReviewQuestionItem{}, err
		}
		item.IsAnswered = true
	}
	if isCorrect.Valid {
		value := isCorrect.Bool
		item.IsCorrect = &value
	}
	if answerScore.Valid {
		item.AnswerScore = answerScore.Float64
	}
	if judgeSource.Valid {
		item.JudgeSource = judgeSource.String
	}
	if reviewComment.Valid {
		item.ReviewComment = &reviewComment.String
	}
	if reviewerUserID.Valid {
		item.ReviewerUserID = &reviewerUserID.Int64
	}
	if reviewedAt.Valid {
		item.ReviewedAt = &reviewedAt.Time
	}
	return item, nil
}

func scanStudentPracticeSession(scanner interface{ Scan(dest ...any) error }) (StudentPracticeSessionItem, error) {
	var item StudentPracticeSessionItem
	var startedAt sql.NullTime
	var finishedAt sql.NullTime
	if err := scanner.Scan(
		&item.SessionID,
		&startedAt,
		&finishedAt,
		&item.Status,
		&item.TotalCount,
		&item.AnsweredCount,
		&item.CorrectCount,
		&item.WrongCount,
	); err != nil {
		return StudentPracticeSessionItem{}, err
	}
	if startedAt.Valid {
		item.StartedAt = &startedAt.Time
	}
	if finishedAt.Valid {
		item.FinishedAt = &finishedAt.Time
	}
	item.Accuracy = ratio(item.CorrectCount, item.AnsweredCount)
	return item, nil
}

func scanStudentPracticeQuestion(scanner interface{ Scan(dest ...any) error }) (StudentPracticeQuestionItem, error) {
	var item StudentPracticeQuestionItem
	var stem sql.NullString
	var lastWrongAt sql.NullTime
	var confusedAt sql.NullTime
	var lastResult sql.NullString
	if err := scanner.Scan(
		&item.QuestionID,
		&item.QuestionVersionID,
		&item.QuestionType,
		&stem,
		&item.PracticeWrongCount,
		&lastWrongAt,
		&item.IsConfused,
		&confusedAt,
		&lastResult,
	); err != nil {
		return StudentPracticeQuestionItem{}, err
	}
	if stem.Valid {
		item.Stem = stem.String
	}
	if lastWrongAt.Valid {
		item.LastWrongAt = &lastWrongAt.Time
	}
	if confusedAt.Valid {
		item.ConfusedAt = &confusedAt.Time
	}
	if lastResult.Valid {
		item.LastResult = lastResult.String
	}
	return item, nil
}

func scanStudentPracticeSessionDetailQuestion(scanner interface{ Scan(dest ...any) error }) (StudentPracticeSessionQuestionItem, bool, bool, error) {
	var (
		item              StudentPracticeSessionQuestionItem
		questionType      sql.NullString
		presentedJSON     []byte
		contentJSON       []byte
		correctAnswerJSON []byte
		analysisJSON      []byte
		studentAnswerJSON []byte
		isCorrect         sql.NullBool
		answeredAt        sql.NullTime
	)
	if err := scanner.Scan(
		&item.SessionQuestionID,
		&item.QuestionID,
		&item.QuestionVersionID,
		&item.DisplayOrder,
		&questionType,
		&presentedJSON,
		&contentJSON,
		&correctAnswerJSON,
		&analysisJSON,
		&studentAnswerJSON,
		&isCorrect,
		&answeredAt,
	); err != nil {
		return StudentPracticeSessionQuestionItem{}, false, false, err
	}

	presented, err := decodeJSONMap(presentedJSON)
	if err != nil {
		return StudentPracticeSessionQuestionItem{}, false, false, err
	}
	item.QuestionType = questionType.String
	if presentedType, ok := presented["question_type"].(string); ok && presentedType != "" {
		item.QuestionType = presentedType
	}

	item.Content, err = decodeJSONMap(contentJSON)
	if err != nil {
		return StudentPracticeSessionQuestionItem{}, false, false, err
	}
	if snapshotContent := mapFromAny(presented["content"]); len(snapshotContent) > 0 {
		item.Content = snapshotContent
	}

	item.CorrectAnswer, err = decodeJSONMap(correctAnswerJSON)
	if err != nil {
		return StudentPracticeSessionQuestionItem{}, false, false, err
	}
	if snapshotAnswer := mapFromAny(presented["answer"]); len(snapshotAnswer) > 0 {
		item.CorrectAnswer = snapshotAnswer
	}

	item.Analysis, err = decodeJSONMap(analysisJSON)
	if err != nil {
		return StudentPracticeSessionQuestionItem{}, false, false, err
	}
	if snapshotAnalysis := mapFromAny(presented["analysis"]); len(snapshotAnalysis) > 0 {
		item.Analysis = snapshotAnalysis
	}

	answered := len(studentAnswerJSON) > 0
	if answered {
		item.StudentAnswer, err = decodeJSONMap(studentAnswerJSON)
		if err != nil {
			return StudentPracticeSessionQuestionItem{}, false, false, err
		}
		item.IsAnswered = true
	}
	if isCorrect.Valid {
		value := isCorrect.Bool
		item.IsCorrect = &value
	}
	if answeredAt.Valid {
		item.AnsweredAt = &answeredAt.Time
	}
	return item, answered, isCorrect.Bool, nil
}

func ratio(part int, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(part) / float64(total)
}

func sqlTimeArg(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}

func decodeJSONMap(payload []byte) (map[string]any, error) {
	if len(payload) == 0 {
		return map[string]any{}, nil
	}
	var result map[string]any
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, err
	}
	if result == nil {
		return map[string]any{}, nil
	}
	return result, nil
}

func mapFromAny(value any) map[string]any {
	typed, ok := value.(map[string]any)
	if !ok || typed == nil {
		return map[string]any{}
	}
	return typed
}

func questionIDPlaceholders(count int) string {
	if count <= 0 {
		return ""
	}
	parts := make([]string, count)
	for index := range parts {
		parts[index] = "?"
	}
	return strings.Join(parts, ",")
}

func formatAnalyticsScore(value float64) string {
	return fmt.Sprintf("%.2f", value)
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func nullableInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func nullableStringPtr(value sql.NullString) *string {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return nil
	}
	result := value.String
	return &result
}
