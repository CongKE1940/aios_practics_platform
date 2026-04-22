package question

import (
	"context"
	"errors"
	"time"
)

const (
	OwnerOrgTypeSchool = "school"
	StatusActive       = "active"
	StatusDisabled     = "disabled"
	SourceTypeManual   = "manual"
	CodeInvalidInput   = 40000
	CodeForbidden      = 40300
	CodeNotFound       = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrNotFound     = errors.New("resource not found")
)

type Scope struct {
	TenantID int64
	UserID   int64
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type Question struct {
	ID               int64     `json:"id"`
	TenantID         int64     `json:"tenant_id"`
	OwnerOrgType     string    `json:"owner_org_type"`
	OwnerOrgID       int64     `json:"owner_org_id"`
	QuestionType     string    `json:"question_type"`
	Difficulty       string    `json:"difficulty,omitempty"`
	CurrentVersionID *int64    `json:"current_version_id"`
	CurrentVersionNo *int      `json:"current_version_no"`
	Status           string    `json:"status"`
	SourceType       string    `json:"source_type"`
	CreatorID        int64     `json:"creator_id"`
	BankIDs          []int64   `json:"bank_ids"`
	CreatedAt        time.Time `json:"created_at,omitempty"`
	UpdatedAt        time.Time `json:"updated_at,omitempty"`
}

type QuestionVersion struct {
	ID            int64          `json:"id"`
	QuestionID    int64          `json:"question_id"`
	VersionNo     int            `json:"version_no"`
	Content       map[string]any `json:"content"`
	Answer        map[string]any `json:"answer"`
	Analysis      map[string]any `json:"analysis,omitempty"`
	StructureHash string         `json:"structure_hash"`
	ChangeSummary string         `json:"change_summary,omitempty"`
	IsPublished   bool           `json:"is_published"`
	CreatedBy     int64          `json:"created_by"`
	CreatedAt     time.Time      `json:"created_at,omitempty"`
}

type QuestionInput struct {
	QuestionType string         `json:"question_type" binding:"required"`
	Difficulty   string         `json:"difficulty"`
	Content      map[string]any `json:"content" binding:"required"`
	Answer       map[string]any `json:"answer" binding:"required"`
	Analysis     map[string]any `json:"analysis"`
	BankIDs      []int64        `json:"bank_ids"`
}

type QuestionUpdateInput struct {
	Difficulty string `json:"difficulty"`
	Status     string `json:"status"`
}

type QuestionVersionInput struct {
	Content       map[string]any `json:"content" binding:"required"`
	Answer        map[string]any `json:"answer" binding:"required"`
	Analysis      map[string]any `json:"analysis"`
	ChangeSummary string         `json:"change_summary"`
}

type QuestionListFilter struct {
	QuestionType string
	CourseID     *int64
	BankID       *int64
	Status       string
	Keyword      string
	Page         int
	PageSize     int
}

type Repository interface {
	ListQuestions(ctx context.Context, tenantID int64, filter QuestionListFilter) (PageResult[Question], error)
	GetQuestion(ctx context.Context, tenantID int64, id int64) (Question, error)
	CreateQuestion(ctx context.Context, question Question, version QuestionVersion, bankIDs []int64) (Question, error)
	UpdateQuestion(ctx context.Context, question Question) (Question, error)
	ListVersions(ctx context.Context, tenantID int64, questionID int64) ([]QuestionVersion, error)
	CreateVersion(ctx context.Context, tenantID int64, questionID int64, version QuestionVersion) (QuestionVersion, Question, error)
}

func pageOf[T any](items []T, page int, pageSize int) PageResult[T] {
	page = normalizePage(page)
	pageSize = normalizePageSize(pageSize)
	total := len(items)
	start := (page - 1) * pageSize
	if start >= total {
		return PageResult[T]{
			Items:    []T{},
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		}
	}

	end := start + pageSize
	if end > total {
		end = total
	}

	return PageResult[T]{
		Items:    append([]T{}, items[start:end]...),
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}
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
	return pageSize
}

func containsInt64(values []int64, target int64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func intPtr(value int) *int {
	return &value
}
