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
	return service.repo.ListQuestions(ctx, scope, normalizeListFilter(filter))
}

func (service *Service) CreateQuestion(ctx context.Context, scope Scope, input QuestionInput) (Question, error) {
	if !isAllowedQuestionType(input.QuestionType) || len(input.Content) == 0 || len(input.Answer) == 0 {
		return Question{}, ErrInvalidInput
	}
	if hasNonPositiveID(input.BankIDs) || hasNonPositiveID(input.CourseIDs) {
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
	}, version, normalizeIDs(input.BankIDs), normalizeIDs(input.CourseIDs))
}

func (service *Service) UpdateQuestion(ctx context.Context, scope Scope, id int64, input QuestionUpdateInput) (Question, error) {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return Question{}, err
	}
	if !canManageQuestion(scope, current) {
		return Question{}, ErrForbidden
	}

	current.Difficulty = strings.TrimSpace(input.Difficulty)
	if status := strings.TrimSpace(input.Status); status != "" {
		current.Status = status
	}
	if hasNonPositiveID(input.BankIDs) || hasNonPositiveID(input.CourseIDs) {
		return Question{}, ErrInvalidInput
	}
	var bankIDs []int64
	if input.BankIDs != nil {
		bankIDs = normalizeIDs(input.BankIDs)
	}
	var courseIDs []int64
	if input.CourseIDs != nil {
		courseIDs = normalizeIDs(input.CourseIDs)
	}
	return service.repo.UpdateQuestion(ctx, current, bankIDs, courseIDs)
}

func (service *Service) ListVersions(ctx context.Context, scope Scope, id int64) ([]QuestionVersion, error) {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return nil, err
	}
	return service.repo.ListVersions(ctx, current.TenantID, id)
}

func (service *Service) CreateVersion(ctx context.Context, scope Scope, id int64, input QuestionVersionInput) (QuestionVersion, error) {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return QuestionVersion{}, err
	}
	if !canManageQuestion(scope, current) {
		return QuestionVersion{}, ErrForbidden
	}
	if len(input.Content) == 0 || len(input.Answer) == 0 {
		return QuestionVersion{}, ErrInvalidInput
	}

	version, _, err := service.repo.CreateVersion(ctx, current.TenantID, id, QuestionVersion{
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

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" {
		return 0
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" {
			return 0
		}
	}
	return scope.TenantID
}

func canManageQuestion(scope Scope, item Question) bool {
	if isSystemScope(scope) {
		return true
	}
	if item.CreatorID == scope.UserID && scope.UserID > 0 {
		return true
	}
	return item.TenantID == scope.TenantID && (isTenantManageScope(scope) || containsExactPermission(scope.Permissions, "question:manage"))
}

func isSystemScope(scope Scope) bool {
	return scope.UserType == "sys_admin" || containsExactPermission(scope.Permissions, "system:manage")
}

func isTenantManageScope(scope Scope) bool {
	return scope.UserType == "tenant_admin" || containsExactPermission(scope.Permissions, "tenant:manage")
}

func containsExactPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
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
