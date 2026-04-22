package practice

import (
	"context"
	"errors"
	"strconv"
	"time"
)

const (
	PracticeModeRandom     = "random"
	PracticeModeSequential = "sequential"
	SourceModeSingleBank   = "single_bank"
	SourceModeMultiBank    = "multi_bank"
	FlowModeFixedCount     = "fixed_count"
	FlowModeContinuous     = "continuous"
	StatusActive           = "active"
	StatusFinished         = "finished"
	StateTypeWrong         = "wrong"
	StateTypeMastered      = "mastered"
	StateTypeConfused      = "confused"
	CodeInvalidInput       = 40000
	CodeNoCandidates       = 40001
	CodeForbidden          = 40300
	CodeNotFound           = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrNotFound     = errors.New("resource not found")
	ErrNoCandidates = errors.New("no practice candidates")
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

type PracticeSessionInput struct {
	PracticeMode    string  `json:"practice_mode"`
	SourceMode      string  `json:"source_mode"`
	FlowMode        string  `json:"flow_mode"`
	CourseID        *int64  `json:"course_id"`
	BankIDs         []int64 `json:"bank_ids" binding:"required"`
	ExcludeMastered bool    `json:"exclude_mastered"`
	QuestionCount   int     `json:"question_count"`
	RandomSeed      int64   `json:"random_seed"`
}

type PracticeSession struct {
	ID              int64          `json:"id"`
	TenantID        int64          `json:"tenant_id"`
	UserID          int64          `json:"user_id"`
	PracticeMode    string         `json:"practice_mode"`
	SourceMode      string         `json:"source_mode"`
	FlowMode        string         `json:"flow_mode"`
	CourseID        *int64         `json:"course_id,omitempty"`
	BankScope       map[string]any `json:"bank_scope"`
	BankIDs         []int64        `json:"bank_ids"`
	ExcludeMastered bool           `json:"exclude_mastered"`
	QuestionCount   int            `json:"question_count,omitempty"`
	RandomSeed      int64          `json:"random_seed"`
	RoundNo         int            `json:"round_no"`
	StartedAt       time.Time      `json:"started_at,omitempty"`
	EndedAt         *time.Time     `json:"ended_at,omitempty"`
	Status          string         `json:"status"`
}

type PracticeSessionQuestion struct {
	ID                int64          `json:"session_question_id"`
	SessionID         int64          `json:"session_id"`
	QuestionID        int64          `json:"question_id"`
	QuestionVersionID int64          `json:"question_version_id"`
	DisplayOrder      int            `json:"display_order"`
	QuestionType      string         `json:"question_type"`
	Content           map[string]any `json:"content"`
	Answer            map[string]any `json:"-"`
	Analysis          map[string]any `json:"analysis,omitempty"`
	RoundNo           int            `json:"round_no"`
	Answered          bool           `json:"answered"`
	IsCorrect         *bool          `json:"is_correct,omitempty"`
	CreatedAt         time.Time      `json:"created_at,omitempty"`
}

type PracticeSessionDetail struct {
	PracticeSession
	Questions []PracticeSessionQuestion `json:"questions"`
}

type QuestionCandidate struct {
	BankID            int64
	QuestionID        int64
	QuestionVersionID int64
	QuestionType      string
	Content           map[string]any
	Answer            map[string]any
	Analysis          map[string]any
}

type CandidateFilter struct {
	BankIDs         []int64
	ExcludeMastered bool
}

type NextQuestionResult struct {
	Question PracticeSessionQuestion `json:"question"`
	RoundNo  int                     `json:"round_no"`
}

type PracticeAnswerInput struct {
	SessionQuestionID int64          `json:"session_question_id" binding:"required"`
	Answer            map[string]any `json:"answer" binding:"required"`
}

type PracticeAnswer struct {
	ID                int64          `json:"id"`
	SessionID         int64          `json:"session_id"`
	SessionQuestionID int64          `json:"session_question_id"`
	UserID            int64          `json:"user_id"`
	QuestionID        int64          `json:"question_id"`
	QuestionVersionID int64          `json:"question_version_id"`
	Answer            map[string]any `json:"answer"`
	IsCorrect         bool           `json:"is_correct"`
	AnsweredAt        time.Time      `json:"answered_at,omitempty"`
}

type PracticeAnswerResult struct {
	IsCorrect     bool              `json:"is_correct"`
	CorrectAnswer map[string]any    `json:"correct_answer"`
	Analysis      map[string]any    `json:"analysis,omitempty"`
	State         UserQuestionState `json:"state"`
}

type QuestionStateInput struct {
	Value bool `json:"value"`
}

type QuestionStateUpdate struct {
	Mastered *bool
	Confused *bool
}

type UserQuestionState struct {
	ID                   int64          `json:"id"`
	TenantID             int64          `json:"tenant_id"`
	UserID               int64          `json:"user_id"`
	QuestionID           int64          `json:"question_id"`
	QuestionVersionID    int64          `json:"question_version_id"`
	PracticeCorrectCount int            `json:"practice_correct_count"`
	PracticeWrongCount   int            `json:"practice_wrong_count"`
	ExamWrongCount       int            `json:"exam_wrong_count"`
	IsMastered           bool           `json:"is_mastered"`
	MasteredAt           *time.Time     `json:"mastered_at,omitempty"`
	IsConfused           bool           `json:"is_confused"`
	ConfusedAt           *time.Time     `json:"confused_at,omitempty"`
	LastWrongAt          *time.Time     `json:"last_wrong_at,omitempty"`
	LastAnswer           map[string]any `json:"last_answer,omitempty"`
	LastResult           string         `json:"last_result,omitempty"`
	UpdatedAt            time.Time      `json:"updated_at,omitempty"`
}

type UserQuestionStateFilter struct {
	StateType string
	BankID    *int64
	Page      int
	PageSize  int
}

type PracticeSessionListFilter struct {
	Status       string
	FlowMode     string
	PracticeMode string
	Page         int
	PageSize     int
}

type PracticeSessionListItem struct {
	ID            int64      `json:"id"`
	Status        string     `json:"status"`
	PracticeMode  string     `json:"practice_mode"`
	SourceMode    string     `json:"source_mode"`
	FlowMode      string     `json:"flow_mode"`
	BankIDs       []int64    `json:"bank_ids"`
	StartedAt     time.Time  `json:"started_at,omitempty"`
	EndedAt       *time.Time `json:"ended_at,omitempty"`
	TotalCount    int        `json:"total_count"`
	AnsweredCount int        `json:"answered_count"`
	CorrectCount  int        `json:"correct_count"`
	WrongCount    int        `json:"wrong_count"`
	Accuracy      float64    `json:"accuracy"`
}

type PracticeSessionResults struct {
	Session   PracticeSessionListItem         `json:"session"`
	Questions []PracticeSessionResultQuestion `json:"questions"`
}

type PracticeSessionResultQuestion struct {
	SessionQuestionID int64             `json:"session_question_id"`
	QuestionID        int64             `json:"question_id"`
	QuestionVersionID int64             `json:"question_version_id"`
	DisplayOrder      int               `json:"display_order"`
	QuestionType      string            `json:"question_type"`
	Content           map[string]any    `json:"content"`
	Answer            map[string]any    `json:"answer"`
	CorrectAnswer     map[string]any    `json:"correct_answer"`
	IsCorrect         bool              `json:"is_correct"`
	Analysis          map[string]any    `json:"analysis,omitempty"`
	State             UserQuestionState `json:"state"`
}

type PracticeSessionFromQuestionsInput struct {
	QuestionIDs     []int64 `json:"question_ids" binding:"required"`
	PracticeMode    string  `json:"practice_mode"`
	FlowMode        string  `json:"flow_mode"`
	QuestionCount   int     `json:"question_count"`
	ExcludeMastered bool    `json:"exclude_mastered"`
	RandomSeed      int64   `json:"random_seed"`
}

type UserQuestionStateDetail struct {
	UserQuestionState
	QuestionType string         `json:"question_type"`
	Content      map[string]any `json:"content"`
}

type PracticeSessionSummary struct {
	ID            int64  `json:"id"`
	Status        string `json:"status"`
	AnsweredCount int    `json:"answered_count"`
	CorrectCount  int    `json:"correct_count"`
	WrongCount    int    `json:"wrong_count"`
}

type Repository interface {
	ListCandidates(ctx context.Context, scope Scope, input CandidateFilter) ([]QuestionCandidate, error)
	CreateSession(ctx context.Context, session PracticeSession, questions []PracticeSessionQuestion) (PracticeSessionDetail, error)
	GetSession(ctx context.Context, scope Scope, id int64) (PracticeSessionDetail, error)
	AddSessionQuestion(ctx context.Context, scope Scope, sessionID int64, question PracticeSessionQuestion) (PracticeSessionQuestion, error)
	FinishSession(ctx context.Context, scope Scope, id int64) (PracticeSessionSummary, error)
	SaveAnswerAndState(ctx context.Context, scope Scope, answer PracticeAnswer, isCorrect bool) (UserQuestionState, error)
	SetQuestionState(ctx context.Context, scope Scope, questionID int64, input QuestionStateUpdate) (UserQuestionState, error)
	ListStates(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionState], error)
	ListSessions(ctx context.Context, scope Scope, filter PracticeSessionListFilter) (PageResult[PracticeSessionListItem], error)
	GetSessionResults(ctx context.Context, scope Scope, id int64) (PracticeSessionResults, error)
	ListCandidatesByQuestionIDs(ctx context.Context, scope Scope, questionIDs []int64, excludeMastered bool) ([]QuestionCandidate, error)
	ListStateDetails(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionStateDetail], error)
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

func containsInt64(values []int64, target int64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func stateKey(userID int64, questionID int64) string {
	return strconv.FormatInt(userID, 10) + ":" + strconv.FormatInt(questionID, 10)
}
