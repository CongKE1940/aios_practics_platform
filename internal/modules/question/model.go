package question

import (
	"context"
	"errors"
	"time"
)

const (
	OwnerOrgTypeSchool = "school"
	ChallengerOrgType  = "tenant"
	StatusActive       = "active"
	StatusDisabled     = "disabled"
	StatusPending      = "pending"
	StatusReviewing    = "reviewing"
	StatusResolved     = "resolved"
	StatusRejected     = "rejected"
	StatusAccepted     = "accepted"
	StatusMerged       = "merged"
	SourceTypeManual   = "manual"
	TagTypeSystem      = "system"
	TagStatusActive    = "active"
	CodeInvalidInput   = 40000
	CodeForbidden      = 40300
	CodeNotFound       = 40400
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

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type Question struct {
	ID               int64          `json:"id"`
	TenantID         int64          `json:"tenant_id"`
	OwnerOrgType     string         `json:"owner_org_type"`
	OwnerOrgID       int64          `json:"owner_org_id"`
	QuestionType     string         `json:"question_type"`
	Difficulty       string         `json:"difficulty,omitempty"`
	CurrentVersionID *int64         `json:"current_version_id"`
	CurrentVersionNo *int           `json:"current_version_no"`
	CurrentContent   map[string]any `json:"current_content,omitempty"`
	Status           string         `json:"status"`
	SourceType       string         `json:"source_type"`
	CreatorID        int64          `json:"creator_id"`
	BankIDs          []int64        `json:"bank_ids"`
	CourseIDs        []int64        `json:"course_ids"`
	CreatedAt        time.Time      `json:"created_at,omitempty"`
	UpdatedAt        time.Time      `json:"updated_at,omitempty"`
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

type QuestionVersionCompareResult struct {
	QuestionID int64           `json:"question_id"`
	Left       QuestionVersion `json:"left"`
	Right      QuestionVersion `json:"right"`
}

type QuestionInput struct {
	QuestionType string         `json:"question_type" binding:"required"`
	Difficulty   string         `json:"difficulty"`
	Content      map[string]any `json:"content" binding:"required"`
	Answer       map[string]any `json:"answer" binding:"required"`
	Analysis     map[string]any `json:"analysis"`
	BankIDs      []int64        `json:"bank_ids"`
	CourseIDs    []int64        `json:"course_ids"`
}

type QuestionUpdateInput struct {
	Difficulty string  `json:"difficulty"`
	Status     string  `json:"status"`
	BankIDs    []int64 `json:"bank_ids"`
	CourseIDs  []int64 `json:"course_ids"`
}

type QuestionVersionInput struct {
	Content       map[string]any `json:"content" binding:"required"`
	Answer        map[string]any `json:"answer" binding:"required"`
	Analysis      map[string]any `json:"analysis"`
	ChangeSummary string         `json:"change_summary"`
}

type QuestionTagInput struct {
	TagIDs   []int64  `json:"tag_ids"`
	TagNames []string `json:"tag_names"`
}

type QuestionCommentInput struct {
	QuestionVersionID int64  `json:"question_version_id" binding:"required"`
	Content           string `json:"content" binding:"required"`
	CommentType       string `json:"comment_type"`
	IsPrivate         bool   `json:"is_private"`
	ParentCommentID   *int64 `json:"parent_comment_id"`
}

type QuestionChallengeAttachmentInput struct {
	URL  string `json:"url"`
	Type string `json:"type"`
}

type QuestionChallengeInput struct {
	QuestionVersionID int64                              `json:"question_version_id" binding:"required"`
	ChallengeType     string                             `json:"challenge_type" binding:"required"`
	Description       string                             `json:"description" binding:"required"`
	Attachments       []QuestionChallengeAttachmentInput `json:"attachments"`
}

type QuestionChallenge struct {
	TenantID          int64
	QuestionID        int64
	QuestionVersionID int64
	ChallengerUserID  int64
	ChallengerOrgType string
	ChallengerOrgID   int64
	ChallengeType     string
	Description       string
	Attachments       []QuestionChallengeAttachmentInput
	Status            string
}

type QuestionChallengeListItem struct {
	ID                int64                              `json:"id"`
	TenantID          int64                              `json:"tenant_id"`
	QuestionID        int64                              `json:"question_id"`
	QuestionVersionID int64                              `json:"question_version_id"`
	ChallengeType     string                             `json:"challenge_type"`
	Description       string                             `json:"description"`
	Attachments       []QuestionChallengeAttachmentInput `json:"attachments"`
	Status            string                             `json:"status"`
	ChallengerUserID  int64                              `json:"challenger_user_id"`
	Challenger        string                             `json:"challenger"`
	QuestionBank      string                             `json:"question_bank"`
	Title             string                             `json:"title"`
	CurrentVersion    string                             `json:"current_version"`
	CurrentContent    map[string]any                     `json:"current_content,omitempty"`
	CurrentAnswer     map[string]any                     `json:"current_answer,omitempty"`
	CurrentAnalysis   map[string]any                     `json:"current_analysis,omitempty"`
	SuggestedFix      string                             `json:"suggested_fix"`
	HistoryVersions   []string                           `json:"history_versions"`
	ReviewComment     string                             `json:"review_comment,omitempty"`
	ReviewedBy        *int64                             `json:"reviewed_by,omitempty"`
	ReviewedAt        *time.Time                         `json:"reviewed_at,omitempty"`
	ResolvedVersionID *int64                             `json:"resolved_version_id,omitempty"`
	CreatedAt         time.Time                          `json:"created_at,omitempty"`
	UpdatedAt         time.Time                          `json:"updated_at,omitempty"`
}

type QuestionChallengeListFilter struct {
	Status   string
	Page     int
	PageSize int
}

type QuestionChallengeReviewInput struct {
	Status            string                `json:"status" binding:"required"`
	ReviewComment     string                `json:"review_comment"`
	ResolvedVersionID *int64                `json:"resolved_version_id"`
	NewVersion        *QuestionVersionInput `json:"new_version"`
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

type QuestionVersionCompareFilter struct {
	LeftVersionID  int64
	RightVersionID int64
	LeftVersionNo  int
	RightVersionNo int
}

type Repository interface {
	ListQuestions(ctx context.Context, scope Scope, filter QuestionListFilter) (PageResult[Question], error)
	GetQuestion(ctx context.Context, scope Scope, id int64) (Question, error)
	CreateQuestion(ctx context.Context, question Question, version QuestionVersion, bankIDs []int64, courseIDs []int64) (Question, error)
	UpdateQuestion(ctx context.Context, question Question, bankIDs []int64, courseIDs []int64) (Question, error)
	ListVersions(ctx context.Context, tenantID int64, questionID int64) ([]QuestionVersion, error)
	CompareVersions(ctx context.Context, tenantID int64, questionID int64, filter QuestionVersionCompareFilter) (QuestionVersionCompareResult, error)
	CreateVersion(ctx context.Context, tenantID int64, questionID int64, version QuestionVersion) (QuestionVersion, Question, error)
	SetQuestionTags(ctx context.Context, tenantID int64, questionID int64, tagIDs []int64, tagNames []string) error
	CreateComment(ctx context.Context, tenantID int64, questionID int64, userID int64, input QuestionCommentInput) error
	CreateChallenge(ctx context.Context, challenge QuestionChallenge) error
	ListChallenges(ctx context.Context, scope Scope, filter QuestionChallengeListFilter) (PageResult[QuestionChallengeListItem], error)
	UpdateChallengeReview(ctx context.Context, scope Scope, id int64, input QuestionChallengeReviewInput) (QuestionChallengeListItem, error)
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

func hasNonPositiveID(values []int64) bool {
	for _, value := range values {
		if value <= 0 {
			return true
		}
	}
	return false
}

func normalizeIDs(values []int64) []int64 {
	seen := make(map[int64]struct{}, len(values))
	result := make([]int64, 0, len(values))
	for _, value := range values {
		if value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func intPtr(value int) *int {
	return &value
}
