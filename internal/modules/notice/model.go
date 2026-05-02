package notice

import (
	"context"
	"errors"
	"time"
)

const (
	NoticeStatusDraft              = "draft"
	NoticeStatusPublished          = "published"
	NoticeStatusRecalled           = "recalled"
	NoticeScopeAll                 = "all"
	NoticeScopeUserIDs             = "user_ids"
	NoticeScopeUserTypes           = "user_types"
	NoticeScopeExcludeUserTypes    = "exclude_user_types"
	NoticeScopeTenantAdmins        = "tenant_admins"
	NoticeScopeAllAdmins           = "all_admins"
	NoticeScopeNonStudents         = "non_students"
	NoticeScopeClassIDs            = "class_ids"
	NotificationStatusUnread       = "unread"
	NotificationStatusRead         = "read"
	NotificationCategoryNotice     = "notice"
	NotificationCategoryDirect     = "direct"
	NotificationSourceTypeNotice   = "notice"
	NotificationSourceTypeUser     = "user"
	NotificationTargetSingleUser   = "single_user"
	NotificationTargetAll          = "all"
	NotificationTargetUserTypes    = "user_types"
	NotificationTargetExcludeTypes = "exclude_user_types"
	NotificationTargetTenantAdmins = "tenant_admins"
	NotificationTargetAllAdmins    = "all_admins"
	NotificationTargetNonStudents  = "non_students"
	NotificationTargetClassIDs     = "class_ids"
	CodeInvalidInput               = 40000
	CodeForbidden                  = 40300
	CodeNotFound                   = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
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
	PublisherName    string         `json:"publisher_name,omitempty"`
	PublishScopeType string         `json:"publish_scope_type"`
	PublishScope     map[string]any `json:"publish_scope"`
	PublishAt        time.Time      `json:"publish_at"`
	ExpireAt         *time.Time     `json:"expire_at"`
	Status           string         `json:"status"`
	ReadAt           *time.Time     `json:"read_at,omitempty"`
	ReadStatus       string         `json:"read_status,omitempty"`
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
	SenderUserID    *int64     `json:"sender_user_id,omitempty"`
	SenderName      string     `json:"sender_name,omitempty"`
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
	TargetTenantID   int64          `json:"target_tenant_id"`
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

type AnnouncementListFilter struct {
	NoticeType  string
	ReadStatus  string
	Page        int
	PageSize    int
	IncludeRead bool
}

type NotificationInput struct {
	Title          string         `json:"title" binding:"required"`
	Content        string         `json:"content" binding:"required"`
	TargetType     string         `json:"target_type" binding:"required"`
	TargetUserID   int64          `json:"target_user_id"`
	TargetScope    map[string]any `json:"target_scope"`
	TargetTenantID int64          `json:"target_tenant_id"`
}

type NotificationSendResult struct {
	Items []Notification `json:"items"`
	Total int            `json:"total"`
}

type Repository interface {
	ListNotices(ctx context.Context, tenantID int64, filter NoticeListFilter) (PageResult[Notice], error)
	GetNotice(ctx context.Context, tenantID int64, id int64) (Notice, error)
	CreateNotice(ctx context.Context, notice Notice) (Notice, error)
	UpdateNotice(ctx context.Context, notice Notice) (Notice, error)
	PublishNotice(ctx context.Context, tenantID int64, id int64) (Notice, error)
	RecallNotice(ctx context.Context, tenantID int64, id int64) (Notice, error)
	ListAnnouncements(ctx context.Context, tenantID int64, recipientUserID int64, filter AnnouncementListFilter) (PageResult[Notice], error)
	MarkAnnouncementRead(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notice, error)
	ListNotifications(ctx context.Context, tenantID int64, recipientUserID int64, filter NotificationListFilter) (PageResult[Notification], error)
	MarkNotificationRead(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notification, error)
	CreateNotification(ctx context.Context, scope Scope, input NotificationInput) (NotificationSendResult, error)
}
