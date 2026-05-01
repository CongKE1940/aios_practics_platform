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
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at
FROM exams e
WHERE e.tenant_id = ?
 AND e.owner_org_type <> ?
ORDER BY e.id DESC
`)).
		WithArgs(int64(7), OwnerOrgTypeUser).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at"}).
			AddRow(int64(101), int64(7), "school", int64(7), int64(9), "七年级数学周测", "fixed", "draft", startTime, endTime, 90, "0.00", nil, createdAt, updatedAt).
			AddRow(int64(102), int64(7), "school", int64(7), int64(9), "七年级英语周测", "fixed", "draft", startTime.Add(time.Hour), endTime.Add(time.Hour), 60, "0.00", nil, createdAt.Add(time.Hour), updatedAt.Add(time.Hour)))

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7, Permissions: []string{"exam:publish"}}, ExamListFilter{Page: 1, PageSize: 1})
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

func TestMySQLRepositoryListExamsAppliesManagementFilters(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	now := time.Date(2026, 4, 22, 12, 0, 0, 0, time.UTC)
	targetID := int64(101)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at
FROM exams e
WHERE e.tenant_id = ?
 AND e.owner_org_type <> ?
 AND e.status = ?
 AND e.name LIKE ?
 AND EXISTS (SELECT 1 FROM exam_targets et_filter WHERE et_filter.exam_id = e.id AND et_filter.target_type = ? AND et_filter.target_id = ?)
 ORDER BY e.id DESC
`)).
		WithArgs(int64(7), OwnerOrgTypeUser, ExamStatusPublished, "%数学%", TargetTypeClass, targetID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at"}).
			AddRow(int64(101), int64(7), "school", int64(7), int64(9), "数学周测", "fixed", ExamStatusPublished, now, now.Add(time.Hour), 60, "0.00", nil, now, now))

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 7, Permissions: []string{"exam:publish"}}, ExamListFilter{
		Status:     ExamStatusPublished,
		Keyword:    "数学",
		TargetType: TargetTypeClass,
		TargetID:   &targetID,
		Page:       1,
		PageSize:   20,
	})
	if err != nil {
		t.Fatalf("ListExams() error = %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Name != "数学周测" {
		t.Fatalf("result = %+v", result)
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
INSERT INTO exams (tenant_id, owner_org_type, owner_org_id, creator_id, name, exam_mode, status, start_time, end_time, duration_minutes, total_score, assembly_rule_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)).
		WithArgs(int64(9), OwnerOrgTypeSchool, int64(9), int64(21), "期中模拟", ExamModeFixed, ExamStatusDraft, startTime, endTime, 90, "15.00", nil).
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
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at, e.assembly_rule_json
FROM exams e
WHERE e.id = ? AND e.tenant_id = ?
 AND e.owner_org_type <> ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9), OwnerOrgTypeUser).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at", "assembly_rule_json"}).
			AddRow(int64(301), int64(9), "school", int64(9), int64(21), "期中模拟", "fixed", "draft", startTime, endTime, 90, "15.00", nil, createdAt, updatedAt, nil))
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
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at, e.assembly_rule_json
FROM exams e
WHERE e.id = ? AND e.tenant_id = ?
 AND e.owner_org_type <> ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9), OwnerOrgTypeUser).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at", "assembly_rule_json"}).
			AddRow(int64(301), int64(9), "school", int64(9), int64(21), "更新前考试", "fixed", "draft", startTime, endTime, 100, "0.00", nil, createdAt, updatedAt, nil))
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
SET name = ?, exam_mode = ?, start_time = ?, end_time = ?, duration_minutes = ?, total_score = ?, paper_id = NULL, assembly_rule_json = ?
WHERE id = ? AND tenant_id = ?
`)).
		WithArgs("更新后考试", ExamModeFixed, startTime, endTime, 100, "30.00", nil, int64(301), int64(9)).
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
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at, e.assembly_rule_json
FROM exams e
WHERE e.id = ? AND e.tenant_id = ?
 AND e.owner_org_type <> ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9), OwnerOrgTypeUser).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at", "assembly_rule_json"}).
			AddRow(int64(301), int64(9), "school", int64(9), int64(21), "更新后考试", "fixed", "draft", startTime, endTime, 100, "30.00", nil, createdAt, updatedAt, nil))
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

func TestMySQLRepositoryPublishFixedExamCreatesPaperAndMarksPublished(t *testing.T) {
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

	expectExamDetailQueries(mock, 301, 9, "待发布考试", ExamStatusDraft, startTime, endTime, 90, createdAt, updatedAt, []ExamTarget{}, []ExamFixedQuestion{
		{QuestionID: 21, QuestionVersionID: 121, Score: 12, DisplayOrder: 1, CreatedAt: createdAt},
		{QuestionID: 22, QuestionVersionID: 122, Score: 18, DisplayOrder: 2, CreatedAt: createdAt},
	})
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_papers (exam_id, tenant_id, creator_id, paper_type, paper_name, source_type, status, total_score)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)).
		WithArgs(int64(301), int64(9), int64(21), ExamPaperTypeFixed, "待发布考试", SourceTypeManual, ExamPaperStatusPublished, "30.00").
		WillReturnResult(sqlmock.NewResult(701, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_paper_questions (paper_id, question_id, question_version_id, score, order_no)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(701), int64(21), int64(121), "12.00", 1).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_paper_questions (paper_id, question_id, question_version_id, score, order_no)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(701), int64(22), int64(122), "18.00", 2).
		WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE exams SET status = ?, paper_id = ? WHERE id = ? AND tenant_id = ? AND status = ?`)).
		WithArgs(ExamStatusPublished, int64(701), int64(301), int64(9), ExamStatusDraft).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	expectExamDetailQueries(mock, 301, 9, "待发布考试", ExamStatusPublished, startTime, endTime, 90, createdAt, updatedAt, []ExamTarget{}, []ExamFixedQuestion{
		{QuestionID: 21, QuestionVersionID: 121, Score: 12, DisplayOrder: 1, CreatedAt: createdAt},
		{QuestionID: 22, QuestionVersionID: 122, Score: 18, DisplayOrder: 2, CreatedAt: createdAt},
	})

	result, err := repo.PublishExam(context.Background(), Scope{TenantID: 9}, 301)
	if err != nil {
		t.Fatalf("PublishExam() error = %v", err)
	}
	if result.Status != ExamStatusPublished {
		t.Fatalf("status = %q", result.Status)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryPublishRandomExamCreatesRulePaper(t *testing.T) {
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
	ruleJSON := `[{"question_type":"single_choice","score_per_question":2,"question_count":2,"bank_ids":[11]}]`

	expectRandomExamDetailQueries(mock, 302, 9, "随机考试", ExamStatusDraft, startTime, endTime, 90, createdAt, updatedAt, ruleJSON)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT COUNT(*)
FROM questions q
WHERE q.tenant_id = ? AND q.deleted_at IS NULL AND q.status = 'active' AND q.current_version_id IS NOT NULL AND q.question_type = ?
 AND EXISTS (SELECT 1 FROM question_bank_questions qbq WHERE qbq.question_id = q.id AND qbq.question_bank_id IN (?))`)).
		WithArgs(int64(9), "single_choice", int64(11)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT q.id, q.current_version_id
FROM questions q
WHERE q.tenant_id = ? AND q.deleted_at IS NULL AND q.status = 'active' AND q.current_version_id IS NOT NULL AND q.question_type = ?
 AND EXISTS (SELECT 1 FROM question_bank_questions qbq WHERE qbq.question_id = q.id AND qbq.question_bank_id IN (?)) ORDER BY RAND() LIMIT ?`)).
		WithArgs(int64(9), "single_choice", int64(11), 2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "current_version_id"}).
			AddRow(int64(101), int64(1001)).
			AddRow(int64(102), int64(1002)))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_papers (exam_id, tenant_id, creator_id, paper_type, paper_name, source_type, status, total_score)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)).
		WithArgs(int64(302), int64(9), int64(21), ExamPaperTypeRandomRule, "随机考试", SourceTypeManual, ExamPaperStatusPublished, "4.00").
		WillReturnResult(sqlmock.NewResult(702, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_paper_question_rules (paper_id, question_type, score_per_question, question_count, knowledge_tag_ids_json, bank_scope_json, course_id, difficulty_range_json, per_knowledge_count_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)).
		WithArgs(int64(702), "single_choice", "2.00", 2, nil, `{"bank_ids":[11]}`, nil, nil, nil).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_paper_questions (paper_id, question_id, question_version_id, score, order_no)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(702), int64(101), int64(1001), "2.00", 1).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_paper_questions (paper_id, question_id, question_version_id, score, order_no)
VALUES (?, ?, ?, ?, ?)
`)).
		WithArgs(int64(702), int64(102), int64(1002), "2.00", 2).
		WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE exams SET status = ?, paper_id = ? WHERE id = ? AND tenant_id = ? AND status = ?`)).
		WithArgs(ExamStatusPublished, int64(702), int64(302), int64(9), ExamStatusDraft).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	expectRandomExamDetailQueries(mock, 302, 9, "随机考试", ExamStatusPublished, startTime, endTime, 90, createdAt, updatedAt, ruleJSON)

	result, err := repo.PublishExam(context.Background(), Scope{TenantID: 9}, 302)
	if err != nil {
		t.Fatalf("PublishExam() error = %v", err)
	}
	if result.Status != ExamStatusPublished || len(result.PaperRules) != 1 {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryPublishRandomExamReturnsGapWhenPoolInsufficient(t *testing.T) {
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
	ruleJSON := `[{"question_type":"single_choice","score_per_question":2,"question_count":3}]`

	expectRandomExamDetailQueries(mock, 303, 9, "题量不足考试", ExamStatusDraft, startTime, endTime, 90, createdAt, updatedAt, ruleJSON)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT COUNT(*)
FROM questions q
WHERE q.tenant_id = ? AND q.deleted_at IS NULL AND q.status = 'active' AND q.current_version_id IS NOT NULL AND q.question_type = ?
`)).
		WithArgs(int64(9), "single_choice").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	_, err = repo.PublishExam(context.Background(), Scope{TenantID: 9}, 303)
	if !errors.Is(err, ErrQuestionPoolInsufficient) {
		t.Fatalf("error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositorySaveAttemptAnswerUpsertsByDisplayOrder(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	now := time.Now().UTC().Add(-10 * time.Minute)
	expectAttemptForSubmit(mock, 801, 9, 10001, 701, now, now.Add(90*time.Minute), ExamAttemptStatusInProgress, 90)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT question_id, question_version_id, order_no, score
FROM exam_paper_questions
WHERE paper_id = ? AND order_no = ?
LIMIT 1
`)).
		WithArgs(int64(701), 1).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "order_no", "score"}).
			AddRow(int64(101), int64(1001), 1, "2.00"))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_attempt_answers (attempt_id, tenant_id, question_id, question_version_id, display_order, answer_json)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), question_id = VALUES(question_id), question_version_id = VALUES(question_version_id), answer_json = VALUES(answer_json)
`)).
		WithArgs(int64(801), int64(9), int64(101), int64(1001), 1, `{"selected_keys":["A"]}`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	result, err := repo.SaveAttemptAnswer(context.Background(), Scope{TenantID: 9, UserID: 10001}, 801, SaveAttemptAnswerInput{
		DisplayOrder: 1,
		Answer:       map[string]any{"selected_keys": []string{"A"}},
	})
	if err != nil {
		t.Fatalf("SaveAttemptAnswer() error = %v", err)
	}
	if result.QuestionID != 101 || result.DisplayOrder != 1 {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositorySaveAttemptAnswerRejectsAfterExamEnd(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startedAt := time.Now().UTC().Add(-2 * time.Hour)
	expectAttemptForSubmit(mock, 801, 9, 10001, 701, startedAt, startedAt.Add(time.Hour), ExamAttemptStatusInProgress, 180)

	_, err = repo.SaveAttemptAnswer(context.Background(), Scope{TenantID: 9, UserID: 10001}, 801, SaveAttemptAnswerInput{
		DisplayOrder: 1,
		Answer:       map[string]any{"selected_keys": []string{"A"}},
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryGetAttemptIncludesQuestionContent(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	now := time.Now().UTC().Add(-10 * time.Minute)
	expectAttemptByID(mock, 801, 9, 10001, 701, now, ExamAttemptStatusInProgress)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT epq.question_id, epq.question_version_id, epq.order_no, epq.score, q.question_type, qv.content_json
FROM exam_paper_questions epq
JOIN questions q ON q.id = epq.question_id
JOIN question_versions qv ON qv.id = epq.question_version_id
WHERE epq.paper_id = ?
ORDER BY epq.order_no ASC
`)).
		WithArgs(int64(701)).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "order_no", "score", "question_type", "content_json"}).
			AddRow(int64(101), int64(1001), 1, "2.00", "single_choice", `{"stem":{"text":"1+1等于几？"},"options":[{"key":"A","text":"2"}]}`))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT attempt_id, question_id, question_version_id, display_order, answer_json, is_correct, score
FROM exam_attempt_answers
WHERE attempt_id = ?
ORDER BY display_order ASC
`)).
		WithArgs(int64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"attempt_id", "question_id", "question_version_id", "display_order", "answer_json", "is_correct", "score"}))

	result, err := repo.GetAttempt(context.Background(), Scope{TenantID: 9, UserID: 10001}, 801)
	if err != nil {
		t.Fatalf("GetAttempt() error = %v", err)
	}
	if len(result.Questions) != 1 || result.Questions[0].QuestionType != "single_choice" {
		t.Fatalf("questions = %+v", result.Questions)
	}
	stem, _ := result.Questions[0].Content["stem"].(map[string]any)
	if stem["text"] != "1+1等于几？" {
		t.Fatalf("content = %+v", result.Questions[0].Content)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositorySubmitAttemptJudgesAndUpdatesExamWrongCount(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	now := time.Now().UTC().Add(-10 * time.Minute)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT ea.id, ea.exam_id, ea.paper_id, ea.tenant_id, ea.user_id, ea.start_at, ea.submit_at, ea.status, ea.objective_score, ea.subjective_score, ea.final_score, ea.created_at, ea.updated_at, e.duration_minutes, e.end_time
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id
WHERE ea.id = ? AND ea.tenant_id = ? AND ea.user_id = ?
LIMIT 1
`)).
		WithArgs(int64(801), int64(9), int64(10001)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exam_id", "paper_id", "tenant_id", "user_id", "start_at", "submit_at", "status", "objective_score", "subjective_score", "final_score", "created_at", "updated_at", "duration_minutes", "end_time"}).
			AddRow(int64(801), int64(301), int64(701), int64(9), int64(10001), now, nil, ExamAttemptStatusInProgress, "0.00", "0.00", "0.00", now, now, 90, now.Add(90*time.Minute)))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT eaa.attempt_id, eaa.question_id, eaa.question_version_id, eaa.display_order, eaa.answer_json, epq.score, qv.answer_json, q.question_type
FROM exam_attempt_answers eaa
JOIN exam_attempts ea ON ea.id = eaa.attempt_id
JOIN exam_paper_questions epq ON epq.paper_id = ea.paper_id AND epq.order_no = eaa.display_order
JOIN question_versions qv ON qv.id = eaa.question_version_id
JOIN questions q ON q.id = eaa.question_id
WHERE eaa.attempt_id = ?
ORDER BY eaa.display_order ASC
`)).
		WithArgs(int64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"attempt_id", "question_id", "question_version_id", "display_order", "answer_json", "score", "answer_json", "question_type"}).
			AddRow(int64(801), int64(101), int64(1001), 1, `{"selected_keys":["B"]}`, "2.00", `{"judge_mode":"by_option_key","correct_keys":["A"]}`, "single_choice"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE exam_attempt_answers
SET is_correct = ?, score = ?, judged_at = ?, judge_source = 'auto'
WHERE attempt_id = ? AND display_order = ?
`)).
		WithArgs(false, "0.00", sqlmock.AnyArg(), int64(801), 1).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO user_question_states (tenant_id, user_id, question_id, question_version_id, exam_wrong_count, last_wrong_at, last_answer_json, last_result)
VALUES (?, ?, ?, ?, 1, ?, ?, 'wrong')
ON DUPLICATE KEY UPDATE question_version_id = VALUES(question_version_id), exam_wrong_count = exam_wrong_count + 1, last_wrong_at = VALUES(last_wrong_at), last_answer_json = VALUES(last_answer_json), last_result = VALUES(last_result)
`)).
		WithArgs(int64(9), int64(10001), int64(101), int64(1001), sqlmock.AnyArg(), `{"selected_keys":["B"]}`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE exam_attempts SET status = ?, submit_at = ?, objective_score = ?, final_score = ? WHERE id = ? AND tenant_id = ? AND user_id = ? AND status = ?`)).
		WithArgs(ExamAttemptStatusSubmitted, sqlmock.AnyArg(), "0.00", "0.00", int64(801), int64(9), int64(10001), ExamAttemptStatusInProgress).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	result, err := repo.SubmitAttempt(context.Background(), Scope{TenantID: 9, UserID: 10001}, 801)
	if err != nil {
		t.Fatalf("SubmitAttempt() error = %v", err)
	}
	if result.FinalScore != 0 || result.Attempt.Status != ExamAttemptStatusSubmitted || len(result.Answers) != 1 || result.Answers[0].IsCorrect == nil || *result.Answers[0].IsCorrect {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositorySubmitAttemptUsesExamEndAsTimeoutBoundary(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startedAt := time.Now().UTC().Add(-2 * time.Hour)
	expectAttemptForSubmit(mock, 801, 9, 10001, 701, startedAt, startedAt.Add(time.Hour), ExamAttemptStatusInProgress, 180)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT eaa.attempt_id, eaa.question_id, eaa.question_version_id, eaa.display_order, eaa.answer_json, epq.score, qv.answer_json, q.question_type
FROM exam_attempt_answers eaa
JOIN exam_attempts ea ON ea.id = eaa.attempt_id
JOIN exam_paper_questions epq ON epq.paper_id = ea.paper_id AND epq.order_no = eaa.display_order
JOIN question_versions qv ON qv.id = eaa.question_version_id
JOIN questions q ON q.id = eaa.question_id
WHERE eaa.attempt_id = ?
ORDER BY eaa.display_order ASC
`)).
		WithArgs(int64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"attempt_id", "question_id", "question_version_id", "display_order", "answer_json", "score", "answer_json", "question_type"}))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE exam_attempts SET status = ?, submit_at = ?, objective_score = ?, final_score = ? WHERE id = ? AND tenant_id = ? AND user_id = ? AND status = ?`)).
		WithArgs(ExamAttemptStatusTimeout, sqlmock.AnyArg(), "0.00", "0.00", int64(801), int64(9), int64(10001), ExamAttemptStatusInProgress).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	result, err := repo.SubmitAttempt(context.Background(), Scope{TenantID: 9, UserID: 10001}, 801)
	if err != nil {
		t.Fatalf("SubmitAttempt() error = %v", err)
	}
	if result.Attempt.Status != ExamAttemptStatusTimeout {
		t.Fatalf("status = %s", result.Attempt.Status)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositorySubmitAttemptKeepsSubjectiveQuestionPendingReview(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	now := time.Now().UTC().Add(-10 * time.Minute)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT ea.id, ea.exam_id, ea.paper_id, ea.tenant_id, ea.user_id, ea.start_at, ea.submit_at, ea.status, ea.objective_score, ea.subjective_score, ea.final_score, ea.created_at, ea.updated_at, e.duration_minutes, e.end_time
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id
WHERE ea.id = ? AND ea.tenant_id = ? AND ea.user_id = ?
LIMIT 1
`)).
		WithArgs(int64(801), int64(9), int64(10001)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exam_id", "paper_id", "tenant_id", "user_id", "start_at", "submit_at", "status", "objective_score", "subjective_score", "final_score", "created_at", "updated_at", "duration_minutes", "end_time"}).
			AddRow(int64(801), int64(301), int64(701), int64(9), int64(10001), now, nil, ExamAttemptStatusInProgress, "0.00", "0.00", "0.00", now, now, 90, now.Add(90*time.Minute)))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT eaa.attempt_id, eaa.question_id, eaa.question_version_id, eaa.display_order, eaa.answer_json, epq.score, qv.answer_json, q.question_type
FROM exam_attempt_answers eaa
JOIN exam_attempts ea ON ea.id = eaa.attempt_id
JOIN exam_paper_questions epq ON epq.paper_id = ea.paper_id AND epq.order_no = eaa.display_order
JOIN question_versions qv ON qv.id = eaa.question_version_id
JOIN questions q ON q.id = eaa.question_id
WHERE eaa.attempt_id = ?
ORDER BY eaa.display_order ASC
`)).
		WithArgs(int64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"attempt_id", "question_id", "question_version_id", "display_order", "answer_json", "score", "answer_json", "question_type"}).
			AddRow(int64(801), int64(201), int64(2001), 1, `{"text":"牛顿第一定律"}`, "20.00", `{"text":"牛顿第一定律"}`, "short_answer"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE exam_attempt_answers
SET is_correct = NULL, score = ?, judged_at = NULL, judge_source = 'manual'
WHERE attempt_id = ? AND display_order = ?
`)).
		WithArgs("0.00", int64(801), 1).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE exam_attempts SET status = ?, submit_at = ?, objective_score = ?, final_score = ? WHERE id = ? AND tenant_id = ? AND user_id = ? AND status = ?`)).
		WithArgs(ExamAttemptStatusSubmitted, sqlmock.AnyArg(), "0.00", "0.00", int64(801), int64(9), int64(10001), ExamAttemptStatusInProgress).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	result, err := repo.SubmitAttempt(context.Background(), Scope{TenantID: 9, UserID: 10001}, 801)
	if err != nil {
		t.Fatalf("SubmitAttempt() error = %v", err)
	}
	if result.Attempt.Status != ExamAttemptStatusSubmitted {
		t.Fatalf("status = %s", result.Attempt.Status)
	}
	if len(result.Answers) != 1 {
		t.Fatalf("answers len = %d", len(result.Answers))
	}
	if result.Answers[0].IsCorrect != nil {
		t.Fatalf("is_correct = %+v, want nil", result.Answers[0].IsCorrect)
	}
	if result.Answers[0].Score != 0 || result.FinalScore != 0 {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryListExamsFiltersPublishedStudentTargets(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	now := time.Date(2026, 4, 24, 9, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta(`
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
`)).
		WithArgs(int64(9), ExamStatusPublished, int64(10001), int64(10001), int64(10001)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at"}).
			AddRow(int64(301), int64(9), OwnerOrgTypeSchool, int64(9), int64(7), "期中测验", ExamModeFixed, ExamStatusPublished, now, now.Add(time.Hour), 60, "0.00", nil, now, now))

	result, err := repo.ListExams(context.Background(), Scope{TenantID: 9, UserID: 10001, UserType: "student"}, ExamListFilter{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("ListExams() error = %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Status != ExamStatusPublished {
		t.Fatalf("result = %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestMySQLRepositoryStartAttemptRequiresActiveExamWindow(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewMySQLRepository(db)
	startedAt := time.Date(2026, 4, 24, 9, 10, 0, 0, time.UTC)

	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, exam_id, paper_id, tenant_id, user_id, start_at, submit_at, status, objective_score, subjective_score, final_score, created_at, updated_at
FROM exam_attempts
WHERE exam_id = ? AND tenant_id = ? AND user_id = ?
LIMIT 1
`)).
		WithArgs(int64(301), int64(9), int64(10001)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exam_id", "paper_id", "tenant_id", "user_id", "start_at", "submit_at", "status", "objective_score", "subjective_score", "final_score", "created_at", "updated_at"}))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT COALESCE(e.paper_id, ep.id)
FROM exams e
LEFT JOIN exam_papers ep ON ep.exam_id = e.id
WHERE e.id = ? AND e.tenant_id = ? AND e.status = ? AND e.start_time <= ? AND e.end_time >= ? AND COALESCE(e.paper_id, ep.id) IS NOT NULL
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
`)).
		WithArgs(int64(301), int64(9), ExamStatusPublished, sqlmock.AnyArg(), sqlmock.AnyArg(), int64(10001), int64(10001), int64(10001)).
		WillReturnRows(sqlmock.NewRows([]string{"paper_id"}).AddRow(int64(701)))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO exam_attempts (exam_id, paper_id, tenant_id, user_id, start_at, status)
VALUES (?, ?, ?, ?, ?, ?)
`)).
		WithArgs(int64(301), int64(701), int64(9), int64(10001), sqlmock.AnyArg(), ExamAttemptStatusInProgress).
		WillReturnResult(sqlmock.NewResult(801, 1))
	expectAttemptByID(mock, 801, 9, 10001, 701, startedAt, ExamAttemptStatusInProgress)
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT epq.question_id, epq.question_version_id, epq.order_no, epq.score, q.question_type, qv.content_json
FROM exam_paper_questions epq
JOIN questions q ON q.id = epq.question_id
JOIN question_versions qv ON qv.id = epq.question_version_id
WHERE epq.paper_id = ?
ORDER BY epq.order_no ASC
`)).
		WithArgs(int64(701)).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "order_no", "score", "question_type", "content_json"}).
			AddRow(int64(101), int64(1001), 1, "2.00", "single_choice", `{"stem":{"text":"1+1等于几？"}}`))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT attempt_id, question_id, question_version_id, display_order, answer_json, is_correct, score
FROM exam_attempt_answers
WHERE attempt_id = ?
ORDER BY display_order ASC
`)).
		WithArgs(int64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"attempt_id", "question_id", "question_version_id", "display_order", "answer_json", "is_correct", "score"}))

	result, err := repo.StartAttempt(context.Background(), Scope{TenantID: 9, UserID: 10001}, 301)
	if err != nil {
		t.Fatalf("StartAttempt() error = %v", err)
	}
	if result.Attempt.ID != 801 || len(result.Questions) != 1 {
		t.Fatalf("result = %+v", result)
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

func expectExamDetailQueries(
	mock sqlmock.Sqlmock,
	examID int64,
	tenantID int64,
	name string,
	status string,
	startTime time.Time,
	endTime time.Time,
	durationMinutes int,
	createdAt time.Time,
	updatedAt time.Time,
	targets []ExamTarget,
	fixedQuestions []ExamFixedQuestion,
) {
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at, e.assembly_rule_json
FROM exams e
WHERE e.id = ? AND e.tenant_id = ?
 AND e.owner_org_type <> ?
LIMIT 1
`)).
		WithArgs(examID, tenantID, OwnerOrgTypeUser).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at", "assembly_rule_json"}).
			AddRow(examID, tenantID, "school", tenantID, int64(21), name, "fixed", status, startTime, endTime, durationMinutes, formatExamScore(totalPublishedScore(fixedQuestions)), nil, createdAt, updatedAt, nil))
	targetRows := sqlmock.NewRows([]string{"target_type", "target_id", "created_at"})
	for _, target := range targets {
		targetRows.AddRow(target.TargetType, target.TargetID, target.CreatedAt)
	}
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT target_type, target_id, created_at
FROM exam_targets
WHERE exam_id = ?
ORDER BY id ASC
`)).
		WithArgs(examID).
		WillReturnRows(targetRows)
	questionRows := sqlmock.NewRows([]string{"question_id", "question_version_id", "score", "display_order", "created_at"})
	for _, question := range fixedQuestions {
		questionRows.AddRow(question.QuestionID, question.QuestionVersionID, formatExamScore(question.Score), question.DisplayOrder, question.CreatedAt)
	}
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT question_id, question_version_id, score, display_order, created_at
FROM exam_fixed_question_drafts
WHERE exam_id = ?
ORDER BY display_order ASC, id ASC
`)).
		WithArgs(examID).
		WillReturnRows(questionRows)
}

func expectRandomExamDetailQueries(
	mock sqlmock.Sqlmock,
	examID int64,
	tenantID int64,
	name string,
	status string,
	startTime time.Time,
	endTime time.Time,
	durationMinutes int,
	createdAt time.Time,
	updatedAt time.Time,
	ruleJSON string,
) {
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT e.id, e.tenant_id, e.owner_org_type, e.owner_org_id, e.creator_id, e.name, e.exam_mode, e.status, e.start_time, e.end_time, e.duration_minutes, e.total_score, e.paper_id, e.created_at, e.updated_at, e.assembly_rule_json
FROM exams e
WHERE e.id = ? AND e.tenant_id = ?
 AND e.owner_org_type <> ?
LIMIT 1
`)).
		WithArgs(examID, tenantID, OwnerOrgTypeUser).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "owner_org_type", "owner_org_id", "creator_id", "name", "exam_mode", "status", "start_time", "end_time", "duration_minutes", "total_score", "paper_id", "created_at", "updated_at", "assembly_rule_json"}).
			AddRow(examID, tenantID, "school", tenantID, int64(21), name, "random_assembly", status, startTime, endTime, durationMinutes, "0.00", nil, createdAt, updatedAt, ruleJSON))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT target_type, target_id, created_at
FROM exam_targets
WHERE exam_id = ?
ORDER BY id ASC
`)).
		WithArgs(examID).
		WillReturnRows(sqlmock.NewRows([]string{"target_type", "target_id", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT question_id, question_version_id, score, display_order, created_at
FROM exam_fixed_question_drafts
WHERE exam_id = ?
ORDER BY display_order ASC, id ASC
`)).
		WithArgs(examID).
		WillReturnRows(sqlmock.NewRows([]string{"question_id", "question_version_id", "score", "display_order", "created_at"}))
}

func expectAttemptByID(mock sqlmock.Sqlmock, attemptID int64, tenantID int64, userID int64, paperID int64, now time.Time, status string) {
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, exam_id, paper_id, tenant_id, user_id, start_at, submit_at, status, objective_score, subjective_score, final_score, created_at, updated_at
FROM exam_attempts
WHERE id = ? AND tenant_id = ? AND user_id = ?
LIMIT 1
`)).
		WithArgs(attemptID, tenantID, userID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exam_id", "paper_id", "tenant_id", "user_id", "start_at", "submit_at", "status", "objective_score", "subjective_score", "final_score", "created_at", "updated_at"}).
			AddRow(attemptID, int64(301), paperID, tenantID, userID, now, nil, status, "0.00", "0.00", "0.00", now, now))
}

func expectAttemptForSubmit(mock sqlmock.Sqlmock, attemptID int64, tenantID int64, userID int64, paperID int64, startedAt time.Time, endTime time.Time, status string, durationMinutes int) {
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT ea.id, ea.exam_id, ea.paper_id, ea.tenant_id, ea.user_id, ea.start_at, ea.submit_at, ea.status, ea.objective_score, ea.subjective_score, ea.final_score, ea.created_at, ea.updated_at, e.duration_minutes, e.end_time
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id
WHERE ea.id = ? AND ea.tenant_id = ? AND ea.user_id = ?
LIMIT 1
`)).
		WithArgs(attemptID, tenantID, userID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exam_id", "paper_id", "tenant_id", "user_id", "start_at", "submit_at", "status", "objective_score", "subjective_score", "final_score", "created_at", "updated_at", "duration_minutes", "end_time"}).
			AddRow(attemptID, int64(301), paperID, tenantID, userID, startedAt, nil, status, "0.00", "0.00", "0.00", startedAt, startedAt, durationMinutes, endTime))
}
