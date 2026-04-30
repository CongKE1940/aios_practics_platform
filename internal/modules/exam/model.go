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

	ExamAttemptStatusInProgress = "in_progress"
	ExamAttemptStatusSubmitted  = "submitted"
	ExamAttemptStatusTimeout    = "timeout_submitted"

	ExamModeFixed  = "fixed"
	ExamModeRandom = "random_assembly"

	ExamPaperTypeFixed      = "fixed"
	ExamPaperTypeRandomRule = "random_rule"

	TargetTypeClass  = "class"
	TargetTypeCourse = "course"
	TargetTypeUser   = "user"
)

var (
	ErrInvalidInput             = errors.New("invalid input")
	ErrForbidden                = errors.New("forbidden")
	ErrNotFound                 = errors.New("resource not found")
	ErrRepositoryUnavailable    = errors.New("repository unavailable")
	ErrQuestionPoolInsufficient = errors.New("question pool insufficient")
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

type ExamPaperRule struct {
	QuestionType      string         `json:"question_type"`
	ScorePerQuestion  float64        `json:"score_per_question"`
	QuestionCount     int            `json:"question_count"`
	KnowledgeTagIDs   []int64        `json:"knowledge_tag_ids,omitempty"`
	BankIDs           []int64        `json:"bank_ids,omitempty"`
	CourseID          *int64         `json:"course_id,omitempty"`
	DifficultyRange   []string       `json:"difficulty_range,omitempty"`
	PerKnowledgeCount map[string]int `json:"per_knowledge_count,omitempty"`
}

type ExamDetail struct {
	Exam
	Targets        []ExamTarget        `json:"targets"`
	FixedQuestions []ExamFixedQuestion `json:"fixed_questions"`
	PaperRules     []ExamPaperRule     `json:"paper_rules"`
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
	PaperRules      []ExamPaperRule          `json:"paper_rules"`
}

type ExamAttempt struct {
	ID              int64      `json:"id"`
	ExamID          int64      `json:"exam_id"`
	PaperID         int64      `json:"paper_id"`
	TenantID        int64      `json:"tenant_id"`
	UserID          int64      `json:"user_id"`
	StartAt         *time.Time `json:"start_at,omitempty"`
	SubmitAt        *time.Time `json:"submit_at,omitempty"`
	Status          string     `json:"status"`
	ObjectiveScore  float64    `json:"objective_score"`
	SubjectiveScore float64    `json:"subjective_score"`
	FinalScore      float64    `json:"final_score"`
	CreatedAt       time.Time  `json:"created_at,omitempty"`
	UpdatedAt       time.Time  `json:"updated_at,omitempty"`
}

type ExamAttemptQuestion struct {
	QuestionID        int64          `json:"question_id"`
	QuestionVersionID int64          `json:"question_version_id"`
	DisplayOrder      int            `json:"display_order"`
	Score             float64        `json:"score"`
	QuestionType      string         `json:"question_type,omitempty"`
	Content           map[string]any `json:"content,omitempty"`
}

type ExamAttemptAnswer struct {
	AttemptID         int64          `json:"attempt_id"`
	QuestionID        int64          `json:"question_id"`
	QuestionVersionID int64          `json:"question_version_id"`
	DisplayOrder      int            `json:"display_order"`
	Answer            map[string]any `json:"answer"`
	IsCorrect         *bool          `json:"is_correct,omitempty"`
	Score             float64        `json:"score"`
}

type ExamAttemptDetail struct {
	Attempt   ExamAttempt           `json:"attempt"`
	Questions []ExamAttemptQuestion `json:"questions"`
	Answers   []ExamAttemptAnswer   `json:"answers"`
}

type SaveAttemptAnswerInput struct {
	DisplayOrder int            `json:"display_order"`
	Answer       map[string]any `json:"answer"`
}

type ExamAttemptResult struct {
	Attempt        ExamAttempt         `json:"attempt"`
	Answers        []ExamAttemptAnswer `json:"answers"`
	ObjectiveScore float64             `json:"objective_score"`
	FinalScore     float64             `json:"final_score"`
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
	StartAttempt(ctx context.Context, scope Scope, examID int64) (ExamAttemptDetail, error)
	GetAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptDetail, error)
	SaveAttemptAnswer(ctx context.Context, scope Scope, attemptID int64, input SaveAttemptAnswerInput) (ExamAttemptAnswer, error)
	SubmitAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error)
	GetAttemptResult(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error)
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
		if permission == target || permission == "system:manage" || permission == "tenant:manage" {
			return true
		}
		if target == "exam:publish" && permission == "exam:manage" {
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
