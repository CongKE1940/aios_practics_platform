package question

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListQuestions(ctx context.Context, scope Scope, filter QuestionListFilter) (PageResult[Question], error) {
	return service.repo.ListQuestions(ctx, scope.TenantID, normalizeListFilter(filter))
}

func (service *Service) CreateQuestion(ctx context.Context, scope Scope, input QuestionInput) (Question, error) {
	if !isAllowedQuestionType(input.QuestionType) || len(input.Content) == 0 || len(input.Answer) == 0 {
		return Question{}, ErrInvalidInput
	}

	version := QuestionVersion{
		VersionNo:     1,
		Content:       input.Content,
		Answer:        input.Answer,
		Analysis:      input.Analysis,
		StructureHash: buildStructureHash(input.QuestionType, input.Content, input.Answer),
		ChangeSummary: "初始版本",
		IsPublished:   true,
		CreatedBy:     scope.UserID,
	}

	return service.repo.CreateQuestion(ctx, Question{
		TenantID:     scope.TenantID,
		OwnerOrgType: OwnerOrgTypeSchool,
		OwnerOrgID:   scope.TenantID,
		QuestionType: input.QuestionType,
		Difficulty:   strings.TrimSpace(input.Difficulty),
		Status:       StatusActive,
		SourceType:   SourceTypeManual,
		CreatorID:    scope.UserID,
	}, version, input.BankIDs)
}

func (service *Service) UpdateQuestion(ctx context.Context, scope Scope, id int64, input QuestionUpdateInput) (Question, error) {
	current, err := service.repo.GetQuestion(ctx, scope.TenantID, id)
	if err != nil {
		return Question{}, err
	}

	current.Difficulty = strings.TrimSpace(input.Difficulty)
	if status := strings.TrimSpace(input.Status); status != "" {
		current.Status = status
	}
	return service.repo.UpdateQuestion(ctx, current)
}

func (service *Service) ListVersions(ctx context.Context, scope Scope, id int64) ([]QuestionVersion, error) {
	return service.repo.ListVersions(ctx, scope.TenantID, id)
}

func (service *Service) CreateVersion(ctx context.Context, scope Scope, id int64, input QuestionVersionInput) (QuestionVersion, error) {
	current, err := service.repo.GetQuestion(ctx, scope.TenantID, id)
	if err != nil {
		return QuestionVersion{}, err
	}
	if len(input.Content) == 0 || len(input.Answer) == 0 {
		return QuestionVersion{}, ErrInvalidInput
	}

	version, _, err := service.repo.CreateVersion(ctx, scope.TenantID, id, QuestionVersion{
		Content:       input.Content,
		Answer:        input.Answer,
		Analysis:      input.Analysis,
		StructureHash: buildStructureHash(current.QuestionType, input.Content, input.Answer),
		ChangeSummary: strings.TrimSpace(input.ChangeSummary),
		IsPublished:   true,
		CreatedBy:     scope.UserID,
	})
	if err != nil {
		return QuestionVersion{}, err
	}
	return version, nil
}

func normalizeListFilter(filter QuestionListFilter) QuestionListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func isAllowedQuestionType(questionType string) bool {
	switch strings.TrimSpace(questionType) {
	case "single_choice", "multiple_choice", "true_false":
		return true
	default:
		return false
	}
}

func buildStructureHash(questionType string, content map[string]any, answer map[string]any) string {
	payload, _ := json.Marshal(map[string]any{
		"question_type": questionType,
		"content":       content,
		"answer":        answer,
	})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
