package exam

import (
	"context"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var _ Repository = (*MySQLRepository)(nil)

func TestNewMySQLRepository(t *testing.T) {
	repo := NewMySQLRepository(nil)
	if repo == nil {
		t.Fatal("repo is nil")
	}
}

func TestMySQLRepositoryListExamsUsesTenantConditionAndScansRows(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	createdAt := time.Date(2026, 4, 22, 12, 0, 0, 0, time.UTC)
	updatedAt := createdAt.Add(time.Minute)
	startTime := createdAt.Add(time.Hour)
	endTime := startTime.Add(90 * time.Minute)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at
FROM exams
WHERE tenant_id = ?
ORDER BY id DESC
`)).
		WithArgs(int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "created_at", "updated_at"}).
			AddRow(int64(101), int64(7), "school", int64(7), int64(9), "七年级数学周测", "fixed", "draft", startTime, endTime, 90, createdAt, updatedAt).
			AddRow(int64(102), int64(7), "school", int64(7), int64(9), "七年级英语周测", "fixed", "draft", startTime.Add(time.Hour), endTime.Add(time.Hour), 60, createdAt.Add(time.Hour), updatedAt.Add(time.Hour)))

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7}, ExamListFilter{Page: 1, PageSize: 1})
	if err != nil {
		t.Fatalf("ListExams() error = %v", err)
	}
	if result.Page != 1 || result.PageSize != 1 || result.Total != 2 {
		t.Fatalf("page result = %+v", result)
	}
	if len(result.Items) != 1 {
		t.Fatalf("items len = %d", len(result.Items))
	}
	if result.Items[0].ID != 101 || result.Items[0].ExamMode != ExamModeFixed || result.Items[0].DurationMinutes != 90 {
		t.Fatalf("first item = %+v", result.Items[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryCreateExamAndGetExamDetailPersistTargetsAndFixedQuestions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startTime := time.Date(2026, 4, 23, 9, 0, 0, 0, time.UTC)
	endTime := startTime.Add(2 * time.Hour)
	createdAt := startTime.Add(-time.Hour)
	updatedAt := createdAt.Add(time.Minute)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exams (tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, total_score)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)).
		WithArgs(int64(9), OwnerOrgTypeSchool, int64(9), int64(21), "期中模拟", ExamModeFixed, ExamStatusDraft, startTime, endTime, 90, "15.00").
		WillReturnResult(sqlmock.NewResult(301, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_targets (exam_id, target_type, target_id)
VALUES (?, ?, ?)
`)).
		WithArgs(int64(301), TargetTypeClass, int64(401)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_targets (exam_id, target_type, target_id)
VALUES (?, ?, ?)
`)).
		WithArgs(int64(301), TargetTypeUser, int64(402)).
		WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_fixed_question_drafts (exam_id, question_id, question_version_id, score, display_order)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(301), int64(11), int64(111), "5.00", 1).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_fixed_question_drafts (exam_id, question_id, question_version_id, score, display_order)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(301), int64(12), int64(112), "10.00", 2).
		WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectCommit()
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at
FROM exams
WHERE id = ? AND tenant_id = ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "created_at", "updated_at"}).
			AddRow(int64(301), int64(9), "school", int64(9), int64(21), "期中模拟", "fixed", "draft", startTime, endTime, 90, createdAt, updatedAt))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT target_type, target_id, created_at
FROM exam_targets
WHERE exam_id = ?
ORDER BY id ASC
`)).
		WithArgs(int64(301)).
		WillReturnRows(sqlmock.NewRows([]string{"target_type", "target_id", "created_at"}).
			AddRow("class", int64(401), createdAt).
			AddRow("user", int64(402), createdAt))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT question_id, question_version_id, score, display_order, created_at
FROM exam_fixed_question_drafts
WHERE exam_id = ?
ORDER BY display_order ASC, id ASC
`)).
		WithArgs(int64(301)).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "score", "display_order", "created_at"}).
			AddRow(int64(11), int64(111), "5.00", 1, createdAt).
			AddRow(int64(12), int64(112), "10.00", 2, createdAt))

	result, err := repo.CreateExam(context.Background(), Scope{TenantID: 9, UserID: 21}, ExamInput{
		Name:            "期中模拟",
		ExamMode:        ExamModeFixed,
		StartTime:       startTime,
		EndTime:         endTime,
		DurationMinutes: 90,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeClass, TargetID: 401},
			{TargetType: TargetTypeUser, TargetID: 402},
		},
		FixedQuestions: []ExamFixedQuestionInput{
			{QuestionID: 11, QuestionVersionID: 111, Score: 5, DisplayOrder: 1},
			{QuestionID: 12, QuestionVersionID: 112, Score: 10, DisplayOrder: 2},
		},
	})
	if err != nil {
		t.Fatalf("CreateExam() error = %v", err)
	}
	if result.ID != 301 {
		t.Fatalf("id = %d", result.ID)
	}
	if len(result.Targets) != 2 || len(result.FixedQuestions) != 2 {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryUpdateExamReplacesTargetsAndFixedQuestions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startTime := time.Date(2026, 4, 24, 9, 0, 0, 0, time.UTC)
	endTime := startTime.Add(2 * time.Hour)
	createdAt := startTime.Add(-time.Hour)
	updatedAt := createdAt.Add(time.Minute)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at
FROM exams
WHERE id = ? AND tenant_id = ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "created_at", "updated_at"}).
			AddRow(int64(301), int64(9), "school", int64(9), int64(21), "更新前考试", "fixed", "draft", startTime, endTime, 100, createdAt, updatedAt))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT target_type, target_id, created_at
FROM exam_targets
WHERE exam_id = ?
ORDER BY id ASC
`)).
		WithArgs(int64(301)).
		WillReturnRows(sqlmock.NewRows([]string{"target_type", "target_id", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT question_id, question_version_id, score, display_order, created_at
FROM exam_fixed_question_drafts
WHERE exam_id = ?
ORDER BY display_order ASC, id ASC
`)).
		WithArgs(int64(301)).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "score", "display_order", "created_at"}))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE exams
SET name = ?, exam_mode = ?, start_time = ?, end_time = ?, duration_minutes = ?, total_score = ?
WHERE id = ? AND tenant_id = ?
`)).
		WithArgs("更新后考试", ExamModeFixed, startTime, endTime, 100, "30.00", int64(301), int64(9)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM exam_targets WHERE exam_id = ?`)).
		WithArgs(int64(301)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_targets (exam_id, target_type, target_id)
VALUES (?, ?, ?)
`)).
		WithArgs(int64(301), TargetTypeCourse, int64(501)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM exam_fixed_question_drafts WHERE exam_id = ?`)).
		WithArgs(int64(301)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_fixed_question_drafts (exam_id, question_id, question_version_id, score, display_order)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(301), int64(21), int64(121), "12.00", 1).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_fixed_question_drafts (exam_id, question_id, question_version_id, score, display_order)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(301), int64(22), int64(122), "18.00", 2).
		WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectCommit()
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, created_at, updated_at
FROM exams
WHERE id = ? AND tenant_id = ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "created_at", "updated_at"}).
			AddRow(int64(301), int64(9), "school", int64(9), int64(21), "更新后考试", "fixed", "draft", startTime, endTime, 100, createdAt, updatedAt))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT target_type, target_id, created_at
FROM exam_targets
WHERE exam_id = ?
ORDER BY id ASC
`)).
		WithArgs(int64(301)).
		WillReturnRows(sqlmock.NewRows([]string{"target_type", "target_id", "created_at"}).
			AddRow("course", int64(501), createdAt))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT question_id, question_version_id, score, display_order, created_at
FROM exam_fixed_question_drafts
WHERE exam_id = ?
ORDER BY display_order ASC, id ASC
`)).
		WithArgs(int64(301)).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "score", "display_order", "created_at"}).
			AddRow(int64(21), int64(121), "12.00", 1, createdAt).
			AddRow(int64(22), int64(122), "18.00", 2, createdAt))

	result, err := repo.UpdateExam(context.Background(), Scope{TenantID: 9}, 301, ExamInput{
		Name:            "更新后考试",
		ExamMode:        ExamModeFixed,
		StartTime:       startTime,
		EndTime:         endTime,
		DurationMinutes: 100,
		Targets: []ExamTargetInput{
			{TargetType: TargetTypeCourse, TargetID: 501},
		},
		FixedQuestions: []ExamFixedQuestionInput{
			{QuestionID: 21, QuestionVersionID: 121, Score: 12, DisplayOrder: 1},
			{QuestionID: 22, QuestionVersionID: 122, Score: 18, DisplayOrder: 2},
		},
	})
	if err != nil {
		t.Fatalf("UpdateExam() error = %v", err)
	}
	if len(result.Targets) != 1 || result.Targets[0].TargetType != TargetTypeCourse {
		t.Fatalf("targets = %+v", result.Targets)
	}
	if len(result.FixedQuestions) != 2 || result.FixedQuestions[1].QuestionID != 22 {
		t.Fatalf("fixed_questions = %+v", result.FixedQuestions)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListExamsReturnsExplicitErrorWhenDBMissing(t *testing.T) {
	var repo *MySQLRepository

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7}, ExamListFilter{Page: 1, PageSize: 20})
	if !errors.Is(err, ErrRepositoryUnavailable) {
		t.Fatalf("error = %v", err)
	}
	if len(result.Items) != 0 || result.Total != 0 {
		t.Fatalf("result = %+v", result)
	}
}
