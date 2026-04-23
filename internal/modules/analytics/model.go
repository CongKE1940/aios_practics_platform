package analytics

import (
	"context"
	"errors"
	"strconv"
	"time"
)

const (
	CodeInvalidInput = 40000
	CodeForbidden    = 40300
	CodeNotFound     = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
	ErrNotFound     = errors.New("resource not found")
)

type Scope struct {
	TenantID    int64
	UserID      int64
	UserType    string
	Permissions []string
}

type ClassPracticeSummaryQuery struct {
	TenantID int64
	ClassID  int64
	CourseID int64
	StartAt  *time.Time
	EndAt    *time.Time
	Page     int
	PageSize int
}

type ClassPracticeSummary struct {
	ClassID                  int64      `json:"class_id"`
	ClassName                string     `json:"class_name"`
	CourseID                 int64      `json:"course_id"`
	CourseName               string     `json:"course_name"`
	StudentCount             int        `json:"student_count"`
	ParticipatedStudentCount int        `json:"participated_student_count"`
	SessionCount             int        `json:"session_count"`
	AnsweredCount            int        `json:"answered_count"`
	CorrectCount             int        `json:"correct_count"`
	WrongCount               int        `json:"wrong_count"`
	Accuracy                 float64    `json:"accuracy"`
	WrongQuestionCount       int        `json:"wrong_question_count"`
	ConfusedQuestionCount    int        `json:"confused_question_count"`
	LastPracticedAt          *time.Time `json:"last_practiced_at,omitempty"`
}

type ClassPracticeStudentItem struct {
	StudentID             int64      `json:"student_id"`
	StudentName           string     `json:"student_name"`
	StudentNo             *string    `json:"student_no,omitempty"`
	SessionCount          int        `json:"session_count"`
	AnsweredCount         int        `json:"answered_count"`
	CorrectCount          int        `json:"correct_count"`
	WrongCount            int        `json:"wrong_count"`
	Accuracy              float64    `json:"accuracy"`
	WrongQuestionCount    int        `json:"wrong_question_count"`
	ConfusedQuestionCount int        `json:"confused_question_count"`
	LastPracticedAt       *time.Time `json:"last_practiced_at,omitempty"`
}

type CourseOptionItem struct {
	CourseID   int64  `json:"course_id"`
	CourseName string `json:"course_name"`
}

type ClassCourseOption struct {
	ClassID   int64              `json:"class_id"`
	ClassName string             `json:"class_name"`
	Courses   []CourseOptionItem `json:"courses"`
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type ClassPracticeSummaryResult struct {
	Summary  ClassPracticeSummary                 `json:"summary"`
	Students PageResult[ClassPracticeStudentItem] `json:"students"`
}

type ClassCourseOptionsResult struct {
	Items []ClassCourseOption `json:"items"`
}

const (
	StudentDetailTabSessions = "sessions"
	StudentDetailTabWrong    = "wrong"
	StudentDetailTabConfused = "confused"
)

type StudentPracticeDetailQuery struct {
	TenantID       int64
	ClassID        int64
	CourseID       int64
	StudentUserID  int64
	Tab            string
	StartAt        *time.Time
	EndAt          *time.Time
	Page           int
	PageSize       int
}

type StudentPracticeSummary struct {
	StudentUserID         int64      `json:"student_user_id"`
	StudentName           string     `json:"student_name"`
	StudentNo             *string    `json:"student_no,omitempty"`
	ClassID               int64      `json:"class_id"`
	ClassName             string     `json:"class_name"`
	CourseID              int64      `json:"course_id"`
	CourseName            string     `json:"course_name"`
	SessionCount          int        `json:"session_count"`
	AnsweredCount         int        `json:"answered_count"`
	CorrectCount          int        `json:"correct_count"`
	WrongCount            int        `json:"wrong_count"`
	Accuracy              float64    `json:"accuracy"`
	WrongQuestionCount    int        `json:"wrong_question_count"`
	ConfusedQuestionCount int        `json:"confused_question_count"`
	LastPracticedAt       *time.Time `json:"last_practiced_at,omitempty"`
}

type StudentPracticeSessionItem struct {
	SessionID     int64      `json:"session_id"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
	Status        string     `json:"status"`
	TotalCount    int        `json:"total_count"`
	AnsweredCount int        `json:"answered_count"`
	CorrectCount  int        `json:"correct_count"`
	WrongCount    int        `json:"wrong_count"`
	Accuracy      float64    `json:"accuracy"`
}

type StudentPracticeQuestionItem struct {
	QuestionID         int64      `json:"question_id"`
	QuestionVersionID  int64      `json:"question_version_id"`
	QuestionType       string     `json:"question_type"`
	Stem               string     `json:"stem"`
	PracticeWrongCount int        `json:"practice_wrong_count"`
	LastWrongAt        *time.Time `json:"last_wrong_at,omitempty"`
	IsConfused         bool       `json:"is_confused"`
	ConfusedAt         *time.Time `json:"confused_at,omitempty"`
	LastResult         string     `json:"last_result"`
}

type StudentPracticeDetailResult struct {
	StudentSummary    StudentPracticeSummary                  `json:"student_summary"`
	ActiveTab         string                                  `json:"active_tab"`
	Sessions          PageResult[StudentPracticeSessionItem]  `json:"sessions"`
	WrongQuestions    PageResult[StudentPracticeQuestionItem] `json:"wrong_questions"`
	ConfusedQuestions PageResult[StudentPracticeQuestionItem] `json:"confused_questions"`
}

type Repository interface {
	ClassCourseExists(ctx context.Context, tenantID int64, classID int64, courseID int64) (bool, error)
	TeacherCanViewClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error)
	GetClassPracticeSummary(ctx context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error)
	ListClassPracticeStudents(ctx context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error)
	ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
	StudentBelongsToClass(ctx context.Context, tenantID int64, classID int64, studentUserID int64) (bool, error)
	GetStudentPracticeSummary(ctx context.Context, query StudentPracticeDetailQuery) (StudentPracticeSummary, error)
	ListStudentPracticeSessions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeSessionItem], error)
	ListStudentWrongQuestions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error)
	ListStudentConfusedQuestions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error)
}

func pageOf[T any](items []T, page int, pageSize int) PageResult[T] {
	page = normalizePage(page)
	pageSize = normalizePageSize(pageSize)
	total := len(items)
	start := (page - 1) * pageSize
	if start >= total {
		return PageResult[T]{Items: []T{}, Page: page, PageSize: pageSize, Total: total}
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return PageResult[T]{Items: append([]T{}, items[start:end]...), Page: page, PageSize: pageSize, Total: total}
}

func normalizePage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizePageSize(pageSize int) int {
	if pageSize <= 0 {
		return 20
	}
	if pageSize > 100 {
		return 100
	}
	return pageSize
}

func emptyPageResult[T any](page int, pageSize int) PageResult[T] {
	return PageResult[T]{
		Items:    []T{},
		Page:     normalizePage(page),
		PageSize: normalizePageSize(pageSize),
		Total:    0,
	}
}

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}

func parsePositiveInt64(value string) (int64, bool) {
	if value == "" {
		return 0, false
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
}

func parseOptionalPositiveInt64(value string) (*int64, bool) {
	parsed, ok := parsePositiveInt64(value)
	if !ok {
		return nil, false
	}
	return &parsed, true
}
