package questionbank

import (
	"context"
	"errors"
	"strings"
	"time"
)

const (
	OwnerOrgTypeSchool = "school"
	StatusDraft        = "draft"
	StatusActive       = "active"
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

type QuestionBank struct {
	ID           int64     `json:"id"`
	TenantID     int64     `json:"tenant_id"`
	OwnerOrgType string    `json:"owner_org_type"`
	OwnerOrgID   int64     `json:"owner_org_id"`
	CreatorID    int64     `json:"creator_id"`
	CourseID     *int64    `json:"course_id"`
	Name         string    `json:"name"`
	Description  string    `json:"description,omitempty"`
	Status       string    `json:"status"`
	SourceType   string    `json:"source_type"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
	UpdatedAt    time.Time `json:"updated_at,omitempty"`
}

type QuestionBankInput struct {
	Name        string `json:"name" binding:"required"`
	CourseID    *int64 `json:"course_id"`
	Description string `json:"description"`
}

type QuestionBankVisibilityInput struct {
	Grants []QuestionBankVisibilityGrant `json:"grants" binding:"required"`
}

type QuestionBankVisibilityGrant struct {
	GrantType         string `json:"grant_type" binding:"required"`
	TargetType        string `json:"target_type" binding:"required"`
	TargetID          int64  `json:"target_id" binding:"required"`
	PermissionType    string `json:"permission_type" binding:"required"`
	InheritToChildren bool   `json:"inherit_to_children"`
}

type QuestionBankListFilter struct {
	CourseID *int64
	Status   string
	Keyword  string
	Page     int
	PageSize int
}

type Repository interface {
	ListQuestionBanks(ctx context.Context, tenantID int64, filter QuestionBankListFilter) (PageResult[QuestionBank], error)
	GetQuestionBank(ctx context.Context, tenantID int64, id int64) (QuestionBank, error)
	CreateQuestionBank(ctx context.Context, questionBank QuestionBank) (QuestionBank, error)
	UpdateQuestionBank(ctx context.Context, questionBank QuestionBank) (QuestionBank, error)
	PublishQuestionBank(ctx context.Context, tenantID int64, id int64) (QuestionBank, error)
	ReplaceVisibility(ctx context.Context, tenantID int64, questionBankID int64, grantedBy int64, grants []QuestionBankVisibilityGrant) error
}

func containsKeyword(values ...string) bool {
	if len(values) == 0 {
		return false
	}
	keyword := strings.TrimSpace(values[len(values)-1])
	if keyword == "" {
		return true
	}
	for _, value := range values[:len(values)-1] {
		if strings.Contains(strings.ToLower(value), strings.ToLower(keyword)) {
			return true
		}
	}
	return false
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
