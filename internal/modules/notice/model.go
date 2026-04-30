package notice

import (
	"context"
	"errors"
	"time"
)

const (
	NoticeStatusDraft          = "draft"
	NoticeStatusPublished      = "published"
	NoticeStatusRecalled       = "recalled"
	NotificationStatusUnread   = "unread"
	NotificationStatusRead     = "read"
	NotificationCategoryNotice = "notice"
	CodeInvalidInput           = 40000
	CodeForbidden              = 40300
	CodeNotFound               = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrNotFound     = errors.New("resource not found")
)

type Scope struct {
	UserID      int64
	TenantID    int64
	UserType    string
	Permissions []string
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type Notice struct {
	ID               int64          `json:"id"`
	TenantID         int64          `json:"tenant_id"`
	Title            string         `json:"title"`
	Content          string         `json:"content"`
	NoticeType       string         `json:"notice_type"`
	PublisherID      int64          `json:"publisher_id"`
	PublishScopeType string         `json:"publish_scope_type"`
	PublishScope     map[string]any `json:"publish_scope"`
	PublishAt        time.Time      `json:"publish_at"`
	ExpireAt         *time.Time     `json:"expire_at"`
	Status           string         `json:"status"`
	CreatedAt        time.Time      `json:"created_at,omitempty"`
	UpdatedAt        time.Time      `json:"updated_at,omitempty"`
}

type Notification struct {
	ID              int64      `json:"id"`
	TenantID        int64      `json:"tenant_id"`
	RecipientUserID int64      `json:"recipient_user_id"`
	Category        string     `json:"category"`
	Title           string     `json:"title"`
	Content         string     `json:"content"`
	SourceType      string     `json:"source_type,omitempty"`
	SourceID        *int64     `json:"source_id"`
	ReadAt          *time.Time `json:"read_at"`
	Status          string     `json:"status"`
	CreatedAt       time.Time  `json:"created_at,omitempty"`
}

type NoticeInput struct {
	Title            string         `json:"title" binding:"required"`
	Content          string         `json:"content" binding:"required"`
	NoticeType       string         `json:"notice_type" binding:"required"`
	PublishScopeType string         `json:"publish_scope_type" binding:"required"`
	PublishScope     map[string]any `json:"publish_scope" binding:"required"`
	PublishAt        *time.Time     `json:"publish_at" binding:"required"`
	ExpireAt         *time.Time     `json:"expire_at"`
}

type NoticeListFilter struct {
	Status     string
	NoticeType string
	Page       int
	PageSize   int
}

type NotificationListFilter struct {
	Status   string
	Category string
	Page     int
	PageSize int
}

type Repository interface {
	ListNotices(ctx context.Context, tenantID int64, filter NoticeListFilter) (PageResult[Notice], error)
	GetNotice(ctx context.Context, tenantID int64, id int64) (Notice, error)
	CreateNotice(ctx context.Context, notice Notice) (Notice, error)
	UpdateNotice(ctx context.Context, notice Notice) (Notice, error)
	PublishNotice(ctx context.Context, tenantID int64, id int64) (Notice, error)
	RecallNotice(ctx context.Context, tenantID int64, id int64) (Notice, error)
	ListNotifications(ctx context.Context, tenantID int64, recipientUserID int64, filter NotificationListFilter) (PageResult[Notification], error)
	MarkNotificationRead(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notification, error)
}
