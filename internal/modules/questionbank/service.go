package questionbank

import (
	"context"
	"strings"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListQuestionBanks(ctx context.Context, scope Scope, filter QuestionBankListFilter) (PageResult[QuestionBank], error) {
	return service.repo.ListQuestionBanks(ctx, readTenantID(scope), normalizeListFilter(filter))
}

func (service *Service) CreateQuestionBank(ctx context.Context, scope Scope, input QuestionBankInput) (QuestionBank, error) {
	if strings.TrimSpace(input.Name) == "" {
		return QuestionBank{}, ErrInvalidInput
	}

	return service.repo.CreateQuestionBank(ctx, QuestionBank{
		TenantID:     scope.TenantID,
		OwnerOrgType: OwnerOrgTypeSchool,
		OwnerOrgID:   scope.TenantID,
		CreatorID:    scope.UserID,
		CourseID:     input.CourseID,
		Name:         strings.TrimSpace(input.Name),
		Description:  strings.TrimSpace(input.Description),
		Status:       StatusDraft,
		SourceType:   SourceTypeManual,
	})
}

func (service *Service) UpdateQuestionBank(ctx context.Context, scope Scope, id int64, input QuestionBankInput) (QuestionBank, error) {
	if strings.TrimSpace(input.Name) == "" {
		return QuestionBank{}, ErrInvalidInput
	}

	current, err := service.repo.GetQuestionBank(ctx, readTenantID(scope), id)
	if err != nil {
		return QuestionBank{}, err
	}

	current.Name = strings.TrimSpace(input.Name)
	current.CourseID = input.CourseID
	current.Description = strings.TrimSpace(input.Description)
	return service.repo.UpdateQuestionBank(ctx, current)
}

func (service *Service) PublishQuestionBank(ctx context.Context, scope Scope, id int64) (QuestionBank, error) {
	current, err := service.repo.GetQuestionBank(ctx, readTenantID(scope), id)
	if err != nil {
		return QuestionBank{}, err
	}
	return service.repo.PublishQuestionBank(ctx, current.TenantID, id)
}

func (service *Service) AssignVisibility(ctx context.Context, scope Scope, id int64, input QuestionBankVisibilityInput) error {
	if len(input.Grants) == 0 {
		return ErrInvalidInput
	}
	current, err := service.repo.GetQuestionBank(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	for _, grant := range input.Grants {
		if strings.TrimSpace(grant.GrantType) == "" || strings.TrimSpace(grant.TargetType) == "" || grant.TargetID <= 0 || strings.TrimSpace(grant.PermissionType) == "" {
			return ErrInvalidInput
		}
	}
	return service.repo.ReplaceVisibility(ctx, current.TenantID, id, scope.UserID, input.Grants)
}

func normalizeListFilter(filter QuestionBankListFilter) QuestionBankListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" {
		return 0
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" || permission == "tenant:manage" {
			return 0
		}
	}
	return scope.TenantID
}
