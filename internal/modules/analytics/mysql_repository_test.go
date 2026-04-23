package analytics

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

const latestAnswerSQLPattern = `SELECT pa1\.session_question_id, pa1\.user_id, pa1\.is_correct, pa1\.answered_at.*SELECT session_question_id, user_id, MAX\(id\) AS max_id.*WHERE answered_at BETWEEN \? AND \?.*GROUP BY session_question_id, user_id`

func TestMySQLRepositoryTeacherCanViewClassCourseUsesTenantAndCurrentAssignment(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
`)).
		WithArgs(int64(7), int64(88), int64(101), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9001))

	ok, err := repo.TeacherCanViewClassCourse(context.Background(), 7, 88, 101, 12)
	if err != nil {
		t.Fatalf("TeacherCanViewClassCourse() error = %v", err)
	}
	if !ok {
		t.Fatalf("TeacherCanViewClassCourse() = false, want true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryTeacherCanViewClassCourseMapsMissingRowsToFalse(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
`)).
		WithArgs(int64(7), int64(88), int64(101), int64(12)).
		WillReturnError(sql.ErrNoRows)

	ok, err := repo.TeacherCanViewClassCourse(context.Background(), 7, 88, 101, 12)
	if err != nil {
		t.Fatalf("TeacherCanViewClassCourse() error = %v", err)
	}
	if ok {
		t.Fatalf("TeacherCanViewClassCourse() = true, want false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListClassCourseOptionsForTeacherUsesAssignmentScope(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
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
`)).
		WithArgs(int64(7), int64(88)).
		WillReturnRows(sqlmock.NewRows([]string{"class_id", "class_name", "course_id", "course_name"}).
			AddRow(int64(301), "七年级一班", int64(10), "数学").
			AddRow(int64(301), "七年级一班", int64(11), "英语"))

	items, err := repo.ListClassCourseOptions(context.Background(), Scope{
		TenantID: 7,
		UserID:   88,
		UserType: "teacher",
	})
	if err != nil {
		t.Fatalf("ListClassCourseOptions() error = %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items len = %d, want 1", len(items))
	}
	if items[0].ClassID != 301 || items[0].ClassName != "七年级一班" {
		t.Fatalf("class option = %+v", items[0])
	}
	if len(items[0].Courses) != 2 {
		t.Fatalf("courses len = %d, want 2", len(items[0].Courses))
	}
	if items[0].Courses[0].CourseID != 10 || items[0].Courses[1].CourseID != 11 {
		t.Fatalf("courses = %+v", items[0].Courses)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListClassCourseOptionsForAdminGroupsAndDedupes(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
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
`)).
		WithArgs(int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"class_id", "class_name", "course_id", "course_name"}).
			AddRow(int64(302), "七年级二班", int64(12), "英语").
			AddRow(int64(301), "七年级一班", int64(10), "数学").
			AddRow(int64(301), "七年级一班", int64(10), "数学").
			AddRow(int64(301), "七年级一班", int64(11), "英语"))

	items, err := repo.ListClassCourseOptions(context.Background(), Scope{
		TenantID: 7,
		UserType: "sys_admin",
	})
	if err != nil {
		t.Fatalf("ListClassCourseOptions() error = %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2", len(items))
	}
	if items[0].ClassID != 301 || items[0].ClassName != "七年级一班" {
		t.Fatalf("first class option = %+v", items[0])
	}
	if len(items[0].Courses) != 2 {
		t.Fatalf("first courses len = %d, want 2", len(items[0].Courses))
	}
	if items[0].Courses[0].CourseID != 10 || items[0].Courses[1].CourseID != 11 {
		t.Fatalf("first courses = %+v", items[0].Courses)
	}
	if items[1].ClassID != 302 || items[1].ClassName != "七年级二班" {
		t.Fatalf("second class option = %+v", items[1])
	}
	if len(items[1].Courses) != 1 || items[1].Courses[0].CourseID != 12 {
		t.Fatalf("second courses = %+v", items[1].Courses)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryClassCourseExistsUsesTenantClassAndCourse(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT c.id
FROM classes c
JOIN courses co ON co.tenant_id = c.tenant_id
WHERE c.tenant_id = ? AND c.id = ? AND co.id = ?
  AND c.status = 'active' AND co.status = 'active'
  AND c.deleted_at IS NULL AND co.deleted_at IS NULL
LIMIT 1
`)).
		WithArgs(int64(7), int64(101), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(101))

	ok, err := repo.ClassCourseExists(context.Background(), 7, 101, 12)
	if err != nil {
		t.Fatalf("ClassCourseExists() error = %v", err)
	}
	if !ok {
		t.Fatalf("ClassCourseExists() = false, want true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryClassCourseExistsMapsMissingRowsToFalse(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT c.id
FROM classes c
JOIN courses co ON co.tenant_id = c.tenant_id
WHERE c.tenant_id = ? AND c.id = ? AND co.id = ?
  AND c.status = 'active' AND co.status = 'active'
  AND c.deleted_at IS NULL AND co.deleted_at IS NULL
LIMIT 1
`)).
		WithArgs(int64(7), int64(101), int64(12)).
		WillReturnError(sql.ErrNoRows)

	ok, err := repo.ClassCourseExists(context.Background(), 7, 101, 12)
	if err != nil {
		t.Fatalf("ClassCourseExists() error = %v", err)
	}
	if ok {
		t.Fatalf("ClassCourseExists() = true, want false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetClassPracticeSummaryUsesAnswerWindowAndAnswerTimePriority(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startAt := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endAt := time.Date(2026, 4, 22, 23, 59, 59, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT\s+c\.id,.*COUNT\(DISTINCT scm\.student_id\).*FROM classes c`).
		WithArgs(int64(7), int64(101), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"class_id", "class_name", "course_id", "course_name", "student_count"}).
			AddRow(int64(101), "一班", int64(12), "数学", 2))

	mock.ExpectQuery(`(?s)SELECT COUNT\(DISTINCT participated\.student_id\).*UNION.*`+latestAnswerSQLPattern).
		WithArgs(int64(12), startAt, endAt, int64(7), int64(101), int64(12), startAt, endAt, int64(7), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"participated_student_count"}).AddRow(2))

	mock.ExpectQuery(`(?s)SELECT COUNT\(DISTINCT ps\.id\), MAX\(ps\.started_at\).*FROM student_class_memberships scm`).
		WithArgs(int64(12), startAt, endAt, int64(7), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"session_count", "last_session_started_at"}).AddRow(1, endAt))

	mock.ExpectQuery(`(?s)SELECT\s+COUNT\(pa\.session_question_id\) AS answered_count,.*MAX\(pa\.answered_at\) AS last_answered_at.*FROM student_class_memberships scm.*`+latestAnswerSQLPattern).
		WithArgs(int64(12), startAt, endAt, int64(7), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"answered_count", "correct_count", "wrong_count", "last_answered_at"}).
			AddRow(3, 2, 1, startAt))

	mock.ExpectQuery(`(?s)SELECT\s+COUNT\(DISTINCT CASE WHEN uqs\.practice_wrong_count > 0 THEN uqs\.question_id END\).*JOIN questions q ON q\.id = qbq\.question_id`).
		WithArgs(int64(7), int64(101), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"wrong_question_count", "confused_question_count"}).AddRow(1, 1))

	result, err := repo.GetClassPracticeSummary(context.Background(), ClassPracticeSummaryQuery{
		TenantID: 7,
		ClassID:  101,
		CourseID: 12,
		StartAt:  &startAt,
		EndAt:    &endAt,
	})
	if err != nil {
		t.Fatalf("GetClassPracticeSummary() error = %v", err)
	}
	if result.ParticipatedStudentCount != 2 || result.SessionCount != 1 || result.AnsweredCount != 3 {
		t.Fatalf("summary counts = %+v", result)
	}
	if result.Accuracy != float64(2)/float64(3) {
		t.Fatalf("accuracy = %v", result.Accuracy)
	}
	if result.LastPracticedAt == nil || !result.LastPracticedAt.Equal(startAt) {
		t.Fatalf("last_practiced_at = %+v", result.LastPracticedAt)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListClassPracticeStudentsIncludesStudentsWithoutPractice(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startAt := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endAt := time.Date(2026, 4, 22, 23, 59, 59, 0, time.UTC)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT COUNT(*)
FROM student_class_memberships scm
WHERE scm.tenant_id = ? AND scm.class_id = ?
  AND scm.is_current = 1 AND scm.status = 'active'
`)).
		WithArgs(int64(7), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	mock.ExpectQuery(`(?s)SELECT\s+scm\.student_id,.*`+latestAnswerSQLPattern+`.*last_answered_at,.*last_session_started_at,.*JOIN questions q ON q\.id = qbq\.question_id.*FROM student_class_memberships scm.*ORDER BY u\.display_name ASC, scm\.student_id ASC\s+LIMIT \? OFFSET \?`).
		WithArgs(
			int64(12), startAt, endAt,
			startAt, endAt, int64(12),
			startAt, endAt, int64(12),
			startAt, endAt, int64(12),
			startAt, endAt, int64(12),
			int64(12), startAt, endAt,
			int64(12), int64(12),
			int64(7), int64(101), 20, 0,
		).
		WillReturnRows(sqlmock.NewRows([]string{
			"student_id",
			"display_name",
			"student_no",
			"session_count",
			"answered_count",
			"correct_count",
			"wrong_count",
			"last_answered_at",
			"last_session_started_at",
			"wrong_question_count",
			"confused_question_count",
		}).
			AddRow(int64(7001), "李四", nil, 0, 0, 0, 0, nil, nil, 0, 0).
			AddRow(int64(7002), "张三", "S002", 2, 5, 4, 1, startAt, endAt, 1, 1))

	result, err := repo.ListClassPracticeStudents(context.Background(), ClassPracticeSummaryQuery{
		TenantID: 7,
		ClassID:  101,
		CourseID: 12,
		StartAt:  &startAt,
		EndAt:    &endAt,
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("ListClassPracticeStudents() error = %v", err)
	}
	if result.Total != 2 || len(result.Items) != 2 {
		t.Fatalf("result total/items = %d/%d", result.Total, len(result.Items))
	}
	if result.Items[0].StudentID != 7001 || result.Items[0].SessionCount != 0 || result.Items[0].Accuracy != 0 {
		t.Fatalf("student without practice = %+v", result.Items[0])
	}
	if result.Items[1].Accuracy != 0.8 {
		t.Fatalf("student accuracy = %v", result.Items[1].Accuracy)
	}
	if result.Items[1].LastPracticedAt == nil || !result.Items[1].LastPracticedAt.Equal(startAt) {
		t.Fatalf("student last_practiced_at = %+v", result.Items[1].LastPracticedAt)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryStudentBelongsToClassUsesCurrentMembership(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(`(?s)SELECT\s+1\s+FROM student_class_memberships scm.*scm\.tenant_id = \?.*scm\.class_id = \?.*scm\.student_id = \?.*scm\.is_current = 1 AND scm\.status = 'active'.*LIMIT 1`).
		WithArgs(int64(7), int64(101), int64(7001)).
		WillReturnRows(sqlmock.NewRows([]string{"1"}).AddRow(1))

	ok, err := repo.StudentBelongsToClass(context.Background(), 7, 101, 7001)
	if err != nil {
		t.Fatalf("StudentBelongsToClass() error = %v", err)
	}
	if !ok {
		t.Fatalf("StudentBelongsToClass() = false, want true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryStudentBelongsToClassMapsMissingRowsToFalse(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(`(?s)SELECT\s+1\s+FROM student_class_memberships scm.*scm\.tenant_id = \?.*scm\.class_id = \?.*scm\.student_id = \?.*scm\.is_current = 1 AND scm\.status = 'active'.*LIMIT 1`).
		WithArgs(int64(7), int64(101), int64(7001)).
		WillReturnError(sql.ErrNoRows)

	ok, err := repo.StudentBelongsToClass(context.Background(), 7, 101, 7001)
	if err != nil {
		t.Fatalf("StudentBelongsToClass() error = %v", err)
	}
	if ok {
		t.Fatalf("StudentBelongsToClass() = true, want false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetStudentPracticeSummary(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startAt := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endAt := time.Date(2026, 4, 22, 23, 59, 59, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT\s+u\.id AS student_user_id,.*co\.name AS course_name.*FROM student_class_memberships scm.*WHERE scm\.tenant_id = \?.*scm\.class_id = \?.*scm\.student_id = \?.*co\.id = \?.*LIMIT 1`).
		WithArgs(int64(7), int64(101), int64(7001), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{
			"student_user_id", "student_name", "student_no", "class_id", "class_name", "course_id", "course_name",
		}).AddRow(int64(7001), "张三", "S001", int64(101), "一班", int64(12), "数学"))

	mock.ExpectQuery(`(?s)SELECT COUNT\(DISTINCT ps\.id\), MAX\(ps\.started_at\).*FROM practice_sessions ps.*ps\.tenant_id = \?.*ps\.user_id = \?.*ps\.course_id = \?.*ps\.started_at BETWEEN \? AND \?.*student_class_memberships scm`).
		WithArgs(int64(7), int64(7001), int64(12), startAt, endAt, int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"session_count", "last_session_started_at"}).AddRow(2, endAt))

	mock.ExpectQuery(`(?s)SELECT\s+COUNT\(pa\.session_question_id\) AS answered_count,.*MAX\(pa\.answered_at\) AS last_answered_at.*FROM practice_sessions ps.*`+latestAnswerSQLPattern+`.*pa\.user_id = \?.*student_class_memberships scm`).
		WithArgs(startAt, endAt, int64(7001), int64(7), int64(7001), int64(12), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"answered_count", "correct_count", "wrong_count", "last_answered_at"}).
			AddRow(5, 4, 1, startAt))

	mock.ExpectQuery(`(?s)SELECT\s+COUNT\(DISTINCT CASE WHEN uqs\.practice_wrong_count > 0 THEN uqs\.question_id END\).*FROM user_question_states uqs.*uqs\.tenant_id = \?.*uqs\.user_id = \?.*JOIN questions q ON q\.id = qbq\.question_id.*qb\.course_id = \?`).
		WithArgs(int64(7), int64(7001), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"wrong_question_count", "confused_question_count"}).AddRow(2, 1))

	result, err := repo.GetStudentPracticeSummary(context.Background(), StudentPracticeDetailQuery{
		TenantID:      7,
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		StartAt:       &startAt,
		EndAt:         &endAt,
	})
	if err != nil {
		t.Fatalf("GetStudentPracticeSummary() error = %v", err)
	}
	if result.StudentUserID != 7001 || result.StudentName != "张三" || result.CourseID != 12 {
		t.Fatalf("summary identity = %+v", result)
	}
	if result.SessionCount != 2 || result.AnsweredCount != 5 || result.CorrectCount != 4 || result.WrongCount != 1 {
		t.Fatalf("summary counts = %+v", result)
	}
	if result.Accuracy != 0.8 {
		t.Fatalf("accuracy = %v", result.Accuracy)
	}
	if result.LastPracticedAt == nil || !result.LastPracticedAt.Equal(startAt) {
		t.Fatalf("last_practiced_at = %+v", result.LastPracticedAt)
	}
	if result.StudentNo == nil || *result.StudentNo != "S001" {
		t.Fatalf("student_no = %+v", result.StudentNo)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListStudentPracticeSessions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startAt := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endAt := time.Date(2026, 4, 22, 23, 59, 59, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT COUNT\(\*\).*FROM practice_sessions ps.*ps\.tenant_id = \?.*ps\.user_id = \?.*ps\.course_id = \?.*ps\.started_at BETWEEN \? AND \?.*student_class_memberships scm.*scm\.class_id = \?`).
		WithArgs(int64(7), int64(7001), int64(12), startAt, endAt, int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`(?s)SELECT\s+ps\.id AS session_id,.*COUNT\(DISTINCT psq\.id\) AS total_count,.*COUNT\(pa\.session_question_id\) AS answered_count,.*FROM practice_sessions ps.*LEFT JOIN practice_session_questions psq.*`+latestAnswerSQLPattern+`.*student_class_memberships scm.*ORDER BY COALESCE\(MAX\(pa\.answered_at\), ps\.started_at\) DESC, ps\.id DESC\s+LIMIT \? OFFSET \?`).
		WithArgs(startAt, endAt, int64(7001), int64(7), int64(7001), int64(12), startAt, endAt, int64(101), 20, 0).
		WillReturnRows(sqlmock.NewRows([]string{
			"session_id", "started_at", "finished_at", "status", "total_count", "answered_count", "correct_count", "wrong_count",
		}).AddRow(int64(9001), startAt, endAt, "completed", 10, 8, 6, 2))

	result, err := repo.ListStudentPracticeSessions(context.Background(), StudentPracticeDetailQuery{
		TenantID:      7,
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		Tab:           StudentDetailTabSessions,
		StartAt:       &startAt,
		EndAt:         &endAt,
		Page:          1,
		PageSize:      20,
	})
	if err != nil {
		t.Fatalf("ListStudentPracticeSessions() error = %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 {
		t.Fatalf("result total/items = %d/%d", result.Total, len(result.Items))
	}
	if result.Items[0].SessionID != 9001 || result.Items[0].Accuracy != 0.75 {
		t.Fatalf("session item = %+v", result.Items[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListStudentPracticeWrongQuestions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startAt := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endAt := time.Date(2026, 4, 22, 23, 59, 59, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT COUNT\(\*\).*FROM user_question_states uqs.*uqs\.tenant_id = \?.*uqs\.user_id = \?.*student_class_memberships scm.*JOIN questions q ON q\.id = qbq\.question_id.*q\.status = 'active'.*q\.deleted_at IS NULL.*qb\.course_id = \?.*uqs\.practice_wrong_count > 0.*uqs\.last_wrong_at BETWEEN \? AND \?`).
		WithArgs(int64(7), int64(7001), int64(101), int64(12), startAt, endAt).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`(?s)SELECT\s+uqs\.question_id,.*JSON_UNQUOTE\(JSON_EXTRACT\(qv\.content_json, '\$\.stem\.text'\)\) AS stem,.*uqs\.practice_wrong_count,.*FROM user_question_states uqs.*JOIN questions q ON q\.id = uqs\.question_id.*q\.status = 'active'.*q\.deleted_at IS NULL.*JOIN question_versions qv ON qv\.id = uqs\.question_version_id.*uqs\.practice_wrong_count > 0.*uqs\.last_wrong_at BETWEEN \? AND \?.*ORDER BY uqs\.last_wrong_at DESC, uqs\.question_id DESC\s+LIMIT \? OFFSET \?`).
		WithArgs(int64(7), int64(7001), int64(101), int64(12), startAt, endAt, 10, 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"question_id", "question_version_id", "question_type", "stem", "practice_wrong_count", "last_wrong_at", "is_confused", "confused_at", "last_result",
		}).AddRow(int64(501), int64(3001), "single_choice", "1+1=?", 2, time.Date(2026, 4, 20, 8, 0, 0, 0, time.UTC), false, nil, "wrong"))
	mock.ExpectQuery(`(?s)SELECT\s+pa\.question_id,\s+psq\.session_id,\s+pa\.session_question_id.*FROM practice_answers pa.*JOIN practice_session_questions psq ON psq\.id = pa\.session_question_id.*JOIN \(\s*SELECT pa2\.question_id, MAX\(pa2\.id\) AS max_id.*ps2\.tenant_id = \?.*ps2\.user_id = \?.*ps2\.course_id = \?.*pa2\.question_id IN \(\?\).*GROUP BY pa2\.question_id.*\)\s+latest ON latest\.max_id = pa\.id`).
		WithArgs(int64(7), int64(7001), int64(12), int64(501)).
		WillReturnRows(sqlmock.NewRows([]string{
			"question_id", "session_id", "session_question_id",
		}).AddRow(int64(501), int64(9009), int64(70009)))

	result, err := repo.ListStudentWrongQuestions(context.Background(), StudentPracticeDetailQuery{
		TenantID:      7,
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		Tab:           StudentDetailTabWrong,
		StartAt:       &startAt,
		EndAt:         &endAt,
		Page:          2,
		PageSize:      10,
	})
	if err != nil {
		t.Fatalf("ListStudentWrongQuestions() error = %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 {
		t.Fatalf("result total/items = %d/%d", result.Total, len(result.Items))
	}
	if result.Items[0].QuestionID != 501 || result.Items[0].PracticeWrongCount != 2 || result.Items[0].Stem != "1+1=?" {
		t.Fatalf("wrong item = %+v", result.Items[0])
	}
	if result.Items[0].IsConfused {
		t.Fatalf("is_confused = true, want false")
	}
	if result.Items[0].LastSessionID == nil || *result.Items[0].LastSessionID != 9009 {
		t.Fatalf("last_session_id = %+v", result.Items[0].LastSessionID)
	}
	if result.Items[0].LastSessionQuestionID == nil || *result.Items[0].LastSessionQuestionID != 70009 {
		t.Fatalf("last_session_question_id = %+v", result.Items[0].LastSessionQuestionID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListStudentPracticeConfusedQuestions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startAt := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endAt := time.Date(2026, 4, 22, 23, 59, 59, 0, time.UTC)
	confusedAt := time.Date(2026, 4, 21, 9, 0, 0, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT COUNT\(\*\).*FROM user_question_states uqs.*uqs\.tenant_id = \?.*uqs\.user_id = \?.*student_class_memberships scm.*JOIN questions q ON q\.id = qbq\.question_id.*q\.status = 'active'.*q\.deleted_at IS NULL.*qb\.course_id = \?.*uqs\.is_confused = 1.*uqs\.confused_at BETWEEN \? AND \?`).
		WithArgs(int64(7), int64(7001), int64(101), int64(12), startAt, endAt).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`(?s)SELECT\s+uqs\.question_id,.*JSON_UNQUOTE\(JSON_EXTRACT\(qv\.content_json, '\$\.stem\.text'\)\) AS stem,.*uqs\.is_confused,.*FROM user_question_states uqs.*JOIN questions q ON q\.id = uqs\.question_id.*q\.status = 'active'.*q\.deleted_at IS NULL.*JOIN question_versions qv ON qv\.id = uqs\.question_version_id.*uqs\.is_confused = 1.*uqs\.confused_at BETWEEN \? AND \?.*ORDER BY uqs\.confused_at DESC, uqs\.question_id DESC\s+LIMIT \? OFFSET \?`).
		WithArgs(int64(7), int64(7001), int64(101), int64(12), startAt, endAt, 20, 0).
		WillReturnRows(sqlmock.NewRows([]string{
			"question_id", "question_version_id", "question_type", "stem", "practice_wrong_count", "last_wrong_at", "is_confused", "confused_at", "last_result",
		}).AddRow(int64(601), int64(3002), "short_answer", "解释公式", 0, nil, true, confusedAt, "wrong"))
	mock.ExpectQuery(`(?s)SELECT\s+pa\.question_id,\s+psq\.session_id,\s+pa\.session_question_id.*FROM practice_answers pa.*JOIN practice_session_questions psq ON psq\.id = pa\.session_question_id.*JOIN \(\s*SELECT pa2\.question_id, MAX\(pa2\.id\) AS max_id.*ps2\.tenant_id = \?.*ps2\.user_id = \?.*ps2\.course_id = \?.*pa2\.question_id IN \(\?\).*GROUP BY pa2\.question_id.*\)\s+latest ON latest\.max_id = pa\.id`).
		WithArgs(int64(7), int64(7001), int64(12), int64(601)).
		WillReturnRows(sqlmock.NewRows([]string{
			"question_id", "session_id", "session_question_id",
		}).AddRow(int64(601), int64(9011), int64(70011)))

	result, err := repo.ListStudentConfusedQuestions(context.Background(), StudentPracticeDetailQuery{
		TenantID:      7,
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		Tab:           StudentDetailTabConfused,
		StartAt:       &startAt,
		EndAt:         &endAt,
		Page:          1,
		PageSize:      20,
	})
	if err != nil {
		t.Fatalf("ListStudentConfusedQuestions() error = %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 {
		t.Fatalf("result total/items = %d/%d", result.Total, len(result.Items))
	}
	if result.Items[0].QuestionID != 601 || !result.Items[0].IsConfused || result.Items[0].Stem != "解释公式" {
		t.Fatalf("confused item = %+v", result.Items[0])
	}
	if result.Items[0].ConfusedAt == nil || !result.Items[0].ConfusedAt.Equal(confusedAt) {
		t.Fatalf("confused_at = %+v", result.Items[0].ConfusedAt)
	}
	if result.Items[0].LastSessionID == nil || *result.Items[0].LastSessionID != 9011 {
		t.Fatalf("last_session_id = %+v", result.Items[0].LastSessionID)
	}
	if result.Items[0].LastSessionQuestionID == nil || *result.Items[0].LastSessionQuestionID != 70011 {
		t.Fatalf("last_session_question_id = %+v", result.Items[0].LastSessionQuestionID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetStudentPracticeSessionDetailSuccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startedAt := time.Date(2026, 4, 23, 2, 0, 0, 0, time.UTC)
	finishedAt := time.Date(2026, 4, 23, 2, 30, 0, 0, time.UTC)
	answeredAt1 := time.Date(2026, 4, 23, 2, 5, 0, 0, time.UTC)
	answeredAt2 := time.Date(2026, 4, 23, 2, 6, 0, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT\s+u\.id AS student_user_id,.*ps\.bank_scope_json.*FROM practice_sessions ps.*student_class_memberships scm.*WHERE ps\.tenant_id = \?.*ps\.id = \?.*ps\.user_id = \?.*ps\.course_id = \?.*LIMIT 1`).
		WithArgs(int64(101), int64(7), int64(9001), int64(7001), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{
			"student_user_id",
			"student_name",
			"student_no",
			"class_id",
			"class_name",
			"course_id",
			"course_name",
			"session_id",
			"started_at",
			"finished_at",
			"status",
			"practice_mode",
			"source_mode",
			"bank_scope_json",
		}).AddRow(
			int64(7001), "张三", "S001", int64(101), "一班", int64(12), "数学",
			int64(9001), startedAt, finishedAt, "finished", "random", "course", `{"flow_mode":"fixed_count"}`,
		))

	mock.ExpectQuery(`(?s)SELECT\s+psq\.id AS session_question_id,.*LEFT JOIN\s+\(.*SELECT pa1\.session_question_id, pa1\.user_id, pa1\.answer_json, pa1\.is_correct, pa1\.answered_at.*SELECT session_question_id, user_id, MAX\(id\) AS max_id.*GROUP BY session_question_id, user_id.*\)\s+pa ON pa\.session_question_id = psq\.id\s+AND pa\.user_id = \?.*WHERE psq\.session_id = \?.*ORDER BY psq\.display_order ASC, psq\.id ASC`).
		WithArgs(int64(7001), int64(9001)).
		WillReturnRows(sqlmock.NewRows([]string{
			"session_question_id",
			"question_id",
			"question_version_id",
			"display_order",
			"question_type",
			"presented_options_json",
			"content_json",
			"answer_json",
			"analysis_json",
			"student_answer_json",
			"is_correct",
			"answered_at",
		}).
			AddRow(
				int64(70001), int64(1001), int64(3001), 1, "single_choice",
				`{"question_type":"single_choice","content":{"stem":{"text":"快照题干1"}},"answer":{"selected_options":["B"]},"analysis":{"text":"快照解析1"}}`,
				`{"stem":{"text":"版本题干1"}}`,
				`{"selected_options":["A"]}`,
				`{"text":"版本解析1"}`,
				`{"selected_options":["B"]}`,
				true,
				answeredAt1,
			).
			AddRow(
				int64(70002), int64(1002), int64(3002), 2, "short_answer",
				nil,
				`{"stem":{"text":"版本题干2"}}`,
				`{"text":"42"}`,
				`{"text":"版本解析2"}`,
				`{"text":"41"}`,
				false,
				answeredAt2,
			).
			AddRow(
				int64(70003), int64(1003), int64(3003), 3, "single_choice",
				nil,
				`{"stem":{"text":"版本题干3"}}`,
				`{"selected_options":["C"]}`,
				`{"text":"版本解析3"}`,
				nil,
				nil,
				nil,
			))

	result, err := repo.GetStudentPracticeSessionDetail(context.Background(), StudentPracticeSessionDetailQuery{
		TenantID:      7,
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		SessionID:     9001,
	})
	if err != nil {
		t.Fatalf("GetStudentPracticeSessionDetail() error = %v", err)
	}

	if result.StudentSummary.StudentName != "张三" || result.StudentSummary.StudentNo == nil || *result.StudentSummary.StudentNo != "S001" {
		t.Fatalf("student summary = %+v", result.StudentSummary)
	}
	if result.Session.SessionID != 9001 || result.Session.FlowMode != "fixed_count" || result.Session.PracticeMode != "random" || result.Session.SourceMode != "course" {
		t.Fatalf("session = %+v", result.Session)
	}
	if result.Session.TotalCount != 3 || result.Session.AnsweredCount != 2 || result.Session.CorrectCount != 1 || result.Session.WrongCount != 1 {
		t.Fatalf("session counters = %+v", result.Session)
	}
	if result.Session.Accuracy != 0.5 {
		t.Fatalf("accuracy = %v", result.Session.Accuracy)
	}
	if len(result.Questions) != 3 {
		t.Fatalf("questions len = %d", len(result.Questions))
	}
	if result.Questions[0].SessionQuestionID != 70001 || result.Questions[0].DisplayOrder != 1 {
		t.Fatalf("question0 = %+v", result.Questions[0])
	}
	if stem, ok := result.Questions[0].Content["stem"].(map[string]any); !ok || stem["text"] != "快照题干1" {
		t.Fatalf("question0 content = %+v", result.Questions[0].Content)
	}
	if ans, ok := result.Questions[0].CorrectAnswer["selected_options"].([]any); !ok || len(ans) != 1 || ans[0] != "B" {
		t.Fatalf("question0 correct_answer = %+v", result.Questions[0].CorrectAnswer)
	}
	if !result.Questions[0].IsAnswered || result.Questions[0].IsCorrect == nil || !*result.Questions[0].IsCorrect {
		t.Fatalf("question0 answered status = %+v", result.Questions[0])
	}
	if result.Questions[2].IsAnswered {
		t.Fatalf("question2 answered status = %+v", result.Questions[2])
	}
	if len(result.Questions[2].Content) == 0 {
		t.Fatalf("question2 content empty")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetStudentPracticeSessionDetailReturnsNotFoundWhenSessionMismatch(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(`(?s)SELECT\s+u\.id AS student_user_id,.*FROM practice_sessions ps.*WHERE ps\.tenant_id = \?.*ps\.id = \?.*ps\.user_id = \?.*ps\.course_id = \?.*LIMIT 1`).
		WithArgs(int64(101), int64(7), int64(9001), int64(7001), int64(12)).
		WillReturnError(sql.ErrNoRows)

	_, err = repo.GetStudentPracticeSessionDetail(context.Background(), StudentPracticeSessionDetailQuery{
		TenantID:      7,
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		SessionID:     9001,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v, want %v", err, ErrNotFound)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetStudentPracticeSessionQuestionDetailSuccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startedAt := time.Date(2026, 4, 23, 2, 0, 0, 0, time.UTC)
	finishedAt := time.Date(2026, 4, 23, 2, 30, 0, 0, time.UTC)
	answeredAt1 := time.Date(2026, 4, 23, 2, 5, 0, 0, time.UTC)
	answeredAt2 := time.Date(2026, 4, 23, 2, 6, 0, 0, time.UTC)

	mock.ExpectQuery(`(?s)SELECT\s+u\.id AS student_user_id,.*ps\.bank_scope_json.*FROM practice_sessions ps.*student_class_memberships scm.*WHERE ps\.tenant_id = \?.*ps\.id = \?.*ps\.user_id = \?.*ps\.course_id = \?.*LIMIT 1`).
		WithArgs(int64(101), int64(7), int64(9001), int64(7001), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{
			"student_user_id",
			"student_name",
			"student_no",
			"class_id",
			"class_name",
			"course_id",
			"course_name",
			"session_id",
			"started_at",
			"finished_at",
			"status",
			"practice_mode",
			"source_mode",
			"bank_scope_json",
		}).AddRow(
			int64(7001), "张三", "S001", int64(101), "一班", int64(12), "数学",
			int64(9001), startedAt, finishedAt, "finished", "random", "course", `{"flow_mode":"fixed_count"}`,
		))

	mock.ExpectQuery(`(?s)SELECT\s+psq\.id AS session_question_id,.*LEFT JOIN\s+\(.*SELECT pa1\.session_question_id, pa1\.user_id, pa1\.answer_json, pa1\.is_correct, pa1\.answered_at.*SELECT session_question_id, user_id, MAX\(id\) AS max_id.*GROUP BY session_question_id, user_id.*\)\s+pa ON pa\.session_question_id = psq\.id\s+AND pa\.user_id = \?.*WHERE psq\.session_id = \?.*ORDER BY psq\.display_order ASC, psq\.id ASC`).
		WithArgs(int64(7001), int64(9001)).
		WillReturnRows(sqlmock.NewRows([]string{
			"session_question_id",
			"question_id",
			"question_version_id",
			"display_order",
			"question_type",
			"presented_options_json",
			"content_json",
			"answer_json",
			"analysis_json",
			"student_answer_json",
			"is_correct",
			"answered_at",
		}).
			AddRow(
				int64(70001), int64(1001), int64(3001), 1, "single_choice",
				`{"question_type":"single_choice","content":{"stem":{"text":"快照题干1"}},"answer":{"selected_options":["B"]},"analysis":{"text":"快照解析1"}}`,
				`{"stem":{"text":"版本题干1"}}`,
				`{"selected_options":["A"]}`,
				`{"text":"版本解析1"}`,
				`{"selected_options":["B"]}`,
				true,
				answeredAt1,
			).
			AddRow(
				int64(70002), int64(1002), int64(3002), 2, "short_answer",
				nil,
				`{"stem":{"text":"版本题干2"}}`,
				`{"text":"42"}`,
				`{"text":"版本解析2"}`,
				`{"text":"41"}`,
				false,
				answeredAt2,
			))

	result, err := repo.GetStudentPracticeSessionQuestionDetail(context.Background(), StudentPracticeSessionQuestionDetailQuery{
		TenantID:          7,
		ClassID:           101,
		CourseID:          12,
		StudentUserID:     7001,
		SessionID:         9001,
		SessionQuestionID: 70002,
	})
	if err != nil {
		t.Fatalf("GetStudentPracticeSessionQuestionDetail() error = %v", err)
	}
	if result.StudentSummary.StudentName != "张三" {
		t.Fatalf("student summary = %+v", result.StudentSummary)
	}
	if result.Session.SessionID != 9001 || result.Session.TotalCount != 2 || result.Session.AnsweredCount != 2 {
		t.Fatalf("session = %+v", result.Session)
	}
	if result.QuestionDetail.SessionQuestionID != 70002 || result.QuestionDetail.DisplayOrder != 2 {
		t.Fatalf("question detail = %+v", result.QuestionDetail)
	}
	if result.QuestionDetail.IsCorrect == nil || *result.QuestionDetail.IsCorrect {
		t.Fatalf("is_correct = %+v", result.QuestionDetail.IsCorrect)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetStudentPracticeSessionQuestionDetailReturnsNotFoundWhenQuestionMismatch(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)

	mock.ExpectQuery(`(?s)SELECT\s+u\.id AS student_user_id,.*ps\.bank_scope_json.*FROM practice_sessions ps.*student_class_memberships scm.*WHERE ps\.tenant_id = \?.*ps\.id = \?.*ps\.user_id = \?.*ps\.course_id = \?.*LIMIT 1`).
		WithArgs(int64(101), int64(7), int64(9001), int64(7001), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{
			"student_user_id",
			"student_name",
			"student_no",
			"class_id",
			"class_name",
			"course_id",
			"course_name",
			"session_id",
			"started_at",
			"finished_at",
			"status",
			"practice_mode",
			"source_mode",
			"bank_scope_json",
		}).AddRow(
			int64(7001), "张三", "S001", int64(101), "一班", int64(12), "数学",
			int64(9001), nil, nil, "finished", "random", "course", `{"flow_mode":"fixed_count"}`,
		))

	mock.ExpectQuery(`(?s)SELECT\s+psq\.id AS session_question_id,.*LEFT JOIN\s+\(.*SELECT pa1\.session_question_id, pa1\.user_id, pa1\.answer_json, pa1\.is_correct, pa1\.answered_at.*SELECT session_question_id, user_id, MAX\(id\) AS max_id.*GROUP BY session_question_id, user_id.*\)\s+pa ON pa\.session_question_id = psq\.id\s+AND pa\.user_id = \?.*WHERE psq\.session_id = \?.*ORDER BY psq\.display_order ASC, psq\.id ASC`).
		WithArgs(int64(7001), int64(9001)).
		WillReturnRows(sqlmock.NewRows([]string{
			"session_question_id",
			"question_id",
			"question_version_id",
			"display_order",
			"question_type",
			"presented_options_json",
			"content_json",
			"answer_json",
			"analysis_json",
			"student_answer_json",
			"is_correct",
			"answered_at",
		}).AddRow(
			int64(70001), int64(1001), int64(3001), 1, "single_choice",
			nil, `{"stem":{"text":"版本题干1"}}`, `{"selected_options":["A"]}`, `{"text":"版本解析1"}`,
			nil, nil, nil,
		))

	_, err = repo.GetStudentPracticeSessionQuestionDetail(context.Background(), StudentPracticeSessionQuestionDetailQuery{
		TenantID:          7,
		ClassID:           101,
		CourseID:          12,
		StudentUserID:     7001,
		SessionID:         9001,
		SessionQuestionID: 70009,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v, want %v", err, ErrNotFound)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}
