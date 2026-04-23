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
	ID        int64     `json:"id"`
	TenantID  int64     `json:"tenant_id"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
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
