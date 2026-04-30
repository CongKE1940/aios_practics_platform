package importjob

import (
	"context"
	"errors"
	"strings"
	"time"
)

const (
	ImportTypeQuestionBank = "question_bank"
	ImportTypeQuestion     = "question"
	ImportTypeExam         = "exam"

	StatusUploaded       = "uploaded"
	StatusParsing        = "parsing"
	StatusValidating     = "validating"
	StatusImporting      = "importing"
	StatusSuccess        = "success"
	StatusPartialSuccess = "partial_success"
	StatusFailed         = "failed"

	RowStatusSuccess = "success"
	RowStatusFailed  = "failed"

	TargetQuestionBank = "question_bank"
	TargetQuestion     = "question"

	ErrorInvalidTemplate    = "invalid_template"
	ErrorRequiredField      = "required_field_missing"
	ErrorInvalidStatus      = "invalid_status"
	ErrorCourseNotFound     = "course_not_found"
	ErrorBankNotFound       = "bank_not_found"
	ErrorInvalidQuestion    = "invalid_question_type"
	ErrorInvalidAnswer      = "invalid_answer"
	ErrorInvalidDifficulty  = "invalid_difficulty"
	ErrorUnsupportedImport  = "unsupported_import_type"
	ErrorBusinessWriteError = "business_write_failed"

	OwnerOrgTypeSchool = "school"
	SourceTypeImport   = "import"
	CodeInvalidInput   = 40000
	CodeForbidden      = 40300
	CodeNotFound       = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
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

type ImportJob struct {
	ID              int64      `json:"id"`
	TenantID        int64      `json:"tenant_id"`
	ImportType      string     `json:"import_type"`
	TemplateVersion string     `json:"template_version"`
	FileAssetID     *int64     `json:"file_asset_id,omitempty"`
	FileURL         string     `json:"file_url"`
	Status          string     `json:"status"`
	TotalRows       int        `json:"total_rows"`
	SuccessRows     int        `json:"success_rows"`
	FailedRows      int        `json:"failed_rows"`
	ErrorSummary    string     `json:"error_summary,omitempty"`
	OperatorID      int64      `json:"operator_id"`
	StartedAt       *time.Time `json:"started_at,omitempty"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at,omitempty"`
}

type ImportJobRow struct {
	ID               int64          `json:"id"`
	JobID            int64          `json:"job_id"`
	RowNo            int            `json:"row_no"`
	RawData          map[string]any `json:"raw_data"`
	NormalizedData   map[string]any `json:"normalized_data,omitempty"`
	Status           string         `json:"status"`
	ErrorCode        string         `json:"error_code,omitempty"`
	ErrorMessage     string         `json:"error_message,omitempty"`
	TargetEntityType string         `json:"target_entity_type,omitempty"`
	TargetEntityID   *int64         `json:"target_entity_id,omitempty"`
	CreatedAt        time.Time      `json:"created_at,omitempty"`
}

type ImportJobInput struct {
	ImportType      string `json:"import_type" binding:"required"`
	TemplateVersion string `json:"template_version"`
	FileAssetID     *int64 `json:"file_asset_id"`
	FileURL         string `json:"file_url" binding:"required"`
	Content         string `json:"content" binding:"required"`
}

type ImportJobListFilter struct {
	ImportType string
	Status     string
	Page       int
	PageSize   int
}

type ImportJobRowFilter struct {
	Status   string
	Page     int
	PageSize int
}

type CourseRef struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type QuestionBankRef struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	CourseID *int64 `json:"course_id,omitempty"`
}

type ImportedQuestionBank struct {
	ID             int64
	TenantID       int64
	OwnerOrgType   string
	OwnerOrgID     int64
	CreatorID      int64
	CourseID       *int64
	Name           string
	Description    string
	Status         string
	SourceType     string
	NormalizedData map[string]any
}

type ImportedQuestion struct {
	ID             int64
	TenantID       int64
	OwnerOrgType   string
	OwnerOrgID     int64
	CreatorID      int64
	QuestionType   string
	Difficulty     string
	Content        map[string]any
	Answer         map[string]any
	Analysis       map[string]any
	BankIDs        []int64
	SourceType     string
	StructureHash  string
	NormalizedData map[string]any
}

type Repository interface {
	CreateJob(ctx context.Context, job ImportJob) (ImportJob, error)
	UpdateJobWithRows(ctx context.Context, job ImportJob, rows []ImportJobRow) (ImportJob, error)
	ListJobs(ctx context.Context, tenantID int64, filter ImportJobListFilter) (PageResult[ImportJob], error)
	GetJob(ctx context.Context, tenantID int64, id int64) (ImportJob, error)
	ListRows(ctx context.Context, tenantID int64, jobID int64, filter ImportJobRowFilter) (PageResult[ImportJobRow], error)
	FindCourseByName(ctx context.Context, tenantID int64, name string) (CourseRef, error)
	FindQuestionBankByName(ctx context.Context, tenantID int64, name string) (QuestionBankRef, error)
	CreateQuestionBank(ctx context.Context, bank ImportedQuestionBank) (int64, error)
	CreateQuestion(ctx context.Context, question ImportedQuestion) (int64, error)
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

func isSupportedImportType(importType string) bool {
	switch strings.TrimSpace(importType) {
	case ImportTypeQuestionBank, ImportTypeQuestion:
		return true
	default:
		return false
	}
}
