package exam

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

	OwnerOrgTypeSchool = "school"

	ExamStatusDraft     = "draft"
	ExamStatusPublished = "published"

	ExamModeFixed  = "fixed"
	ExamModeRandom = "random_assembly"

	ExamPaperTypeFixed = "fixed"

	TargetTypeClass  = "class"
	TargetTypeCourse = "course"
	TargetTypeUser   = "user"
)

var (
	ErrInvalidInput          = errors.New("invalid input")
	ErrForbidden             = errors.New("forbidden")
	ErrNotFound              = errors.New("resource not found")
	ErrRepositoryUnavailable = errors.New("repository unavailable")
)

type Scope struct {
	TenantID    int64
	UserID      int64
	UserType    string
	Permissions []string
}

type Exam struct {
	ID              int64     `json:"id"`
	TenantID        int64     `json:"tenant_id"`
	OwnerOrgType    string    `json:"owner_org_type"`
	OwnerOrgID      int64     `json:"owner_org_id"`
	CreatorID       int64     `json:"creator_id"`
	Name            string    `json:"name"`
	ExamMode        string    `json:"exam_mode"`
	Status          string    `json:"status"`
	StartTime       time.Time `json:"start_time"`
	EndTime         time.Time `json:"end_time"`
	DurationMinutes int       `json:"duration_minutes"`
	CreatedAt       time.Time `json:"created_at,omitempty"`
	UpdatedAt       time.Time `json:"updated_at,omitempty"`
}

type ExamTarget struct {
	TargetType string    `json:"target_type"`
	TargetID   int64     `json:"target_id"`
	CreatedAt  time.Time `json:"created_at,omitempty"`
}

type ExamFixedQuestion struct {
	QuestionID        int64     `json:"question_id"`
	QuestionVersionID int64     `json:"question_version_id"`
	Score             float64   `json:"score"`
	DisplayOrder      int       `json:"display_order"`
	CreatedAt         time.Time `json:"created_at,omitempty"`
}

type ExamDetail struct {
	Exam
	Targets        []ExamTarget        `json:"targets"`
	FixedQuestions []ExamFixedQuestion `json:"fixed_questions"`
}

type ExamTargetInput struct {
	TargetType string `json:"target_type"`
	TargetID   int64  `json:"target_id"`
}

type ExamFixedQuestionInput struct {
	QuestionID        int64   `json:"question_id"`
	QuestionVersionID int64   `json:"question_version_id"`
	Score             float64 `json:"score"`
	DisplayOrder      int     `json:"display_order"`
}

type ExamInput struct {
	Name            string                   `json:"name"`
	ExamMode        string                   `json:"exam_mode"`
	StartTime       time.Time                `json:"start_time"`
	EndTime         time.Time                `json:"end_time"`
	DurationMinutes int                      `json:"duration_minutes"`
	Targets         []ExamTargetInput        `json:"targets"`
	FixedQuestions  []ExamFixedQuestionInput `json:"fixed_questions"`
}

type ExamListFilter struct {
	Page     int
	PageSize int
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type Repository interface {
	ListExams(ctx context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error)
	CreateExam(ctx context.Context, scope Scope, input ExamInput) (ExamDetail, error)
	GetExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error)
	UpdateExam(ctx context.Context, scope Scope, id int64, input ExamInput) (ExamDetail, error)
	PublishExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error)
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

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}

func parseInt(value string) int {
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}
