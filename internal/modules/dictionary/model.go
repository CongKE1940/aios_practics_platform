package dictionary

import (
	"context"
	"errors"
	"time"
)

const (
	StatusActive     = "active"
	StatusDisabled   = "disabled"
	CodeInvalidInput = 40000
	CodeForbidden    = 40300
	CodeNotFound     = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
	ErrNotFound     = errors.New("resource not found")
)

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type Scope struct {
	UserType    string
	Permissions []string
}

type Dictionary struct {
	ID        int64     `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Remark    string    `json:"remark,omitempty"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

type DictionaryItem struct {
	ID             int64     `json:"id"`
	DictionaryID   int64     `json:"dictionary_id"`
	DictionaryCode string    `json:"dictionary_code,omitempty"`
	Value          int       `json:"value"`
	Label          string    `json:"label"`
	SortNo         int       `json:"sort_no"`
	Status         string    `json:"status"`
	Remark         string    `json:"remark,omitempty"`
	CreatedAt      time.Time `json:"created_at,omitempty"`
	UpdatedAt      time.Time `json:"updated_at,omitempty"`
}

type DictionaryInput struct {
	Code   string `json:"code" binding:"required"`
	Name   string `json:"name" binding:"required"`
	Status string `json:"status"`
	Remark string `json:"remark"`
}

type DictionaryItemInput struct {
	Value  int    `json:"value" binding:"required"`
	Label  string `json:"label" binding:"required"`
	SortNo int    `json:"sort_no"`
	Status string `json:"status"`
	Remark string `json:"remark"`
}

type DictionaryListFilter struct {
	Status   string
	Keyword  string
	Page     int
	PageSize int
}

type DictionaryItemListFilter struct {
	DictionaryID   int64
	DictionaryCode string
	Status         string
	ActiveOnly     bool
	Page           int
	PageSize       int
}

type Repository interface {
	ListDictionaries(ctx context.Context, filter DictionaryListFilter) (PageResult[Dictionary], error)
	CreateDictionary(ctx context.Context, dictionary Dictionary) (Dictionary, error)
	UpdateDictionary(ctx context.Context, dictionary Dictionary) (Dictionary, error)
	GetDictionary(ctx context.Context, id int64) (Dictionary, error)
	ListItems(ctx context.Context, filter DictionaryItemListFilter) (PageResult[DictionaryItem], error)
	CreateItem(ctx context.Context, item DictionaryItem) (DictionaryItem, error)
	UpdateItem(ctx context.Context, item DictionaryItem) (DictionaryItem, error)
	GetItem(ctx context.Context, id int64) (DictionaryItem, error)
}
