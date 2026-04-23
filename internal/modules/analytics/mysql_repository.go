package analytics

import (
	"context"
	"database/sql"
	"errors"
	"sort"
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

	return PageResult[StudentPracticeQuestionItem]{
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
