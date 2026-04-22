package analytics

import (
	"context"
	"database/sql"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

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

	mock.ExpectQuery(`(?s)SELECT COUNT\(DISTINCT participated\.student_id\).*UNION.*practice_answers pa`).
		WithArgs(int64(12), startAt, endAt, int64(7), int64(101), int64(12), startAt, endAt, int64(7), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"participated_student_count"}).AddRow(2))

	mock.ExpectQuery(`(?s)SELECT COUNT\(DISTINCT ps\.id\), MAX\(ps\.started_at\).*FROM student_class_memberships scm`).
		WithArgs(int64(12), startAt, endAt, int64(7), int64(101)).
		WillReturnRows(sqlmock.NewRows([]string{"session_count", "last_session_started_at"}).AddRow(1, endAt))

	mock.ExpectQuery(`(?s)SELECT\s+COUNT\(pa\.id\) AS answered_count,.*MAX\(pa\.answered_at\) AS last_answered_at.*FROM student_class_memberships scm`).
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

	mock.ExpectQuery(`(?s)SELECT\s+scm\.student_id,.*last_answered_at,.*last_session_started_at,.*JOIN questions q ON q\.id = qbq\.question_id.*FROM student_class_memberships scm.*ORDER BY u\.display_name ASC, scm\.student_id ASC\s+LIMIT \? OFFSET \?`).
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
