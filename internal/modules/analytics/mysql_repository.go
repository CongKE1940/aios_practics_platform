package analytics

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
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
    SELECT COUNT(pa.id)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN practice_answers pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
      AND pa.answered_at BETWEEN ? AND ?
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS answered_count,
  (
    SELECT COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN practice_answers pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
      AND pa.answered_at BETWEEN ? AND ?
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS correct_count,
  (
    SELECT COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN practice_answers pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
      AND pa.answered_at BETWEEN ? AND ?
    WHERE ps.tenant_id = scm.tenant_id
      AND ps.user_id = scm.student_id
      AND ps.course_id = ?
  ) AS wrong_count,
  (
    SELECT MAX(pa.answered_at)
    FROM practice_sessions ps
    JOIN practice_session_questions psq ON psq.session_id = ps.id
    JOIN practice_answers pa ON pa.session_question_id = psq.id
      AND pa.user_id = scm.student_id
      AND pa.answered_at BETWEEN ? AND ?
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
  JOIN practice_answers pa ON pa.session_question_id = psq.id
    AND pa.user_id = scm.student_id
    AND pa.answered_at BETWEEN ? AND ?
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
  COUNT(pa.id) AS answered_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0) AS wrong_count,
  MAX(pa.answered_at) AS last_answered_at
FROM student_class_memberships scm
JOIN practice_sessions ps ON ps.tenant_id = scm.tenant_id
  AND ps.user_id = scm.student_id
  AND ps.course_id = ?
JOIN practice_session_questions psq ON psq.session_id = ps.id
JOIN practice_answers pa ON pa.session_question_id = psq.id
  AND pa.user_id = scm.student_id
  AND pa.answered_at BETWEEN ? AND ?
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
