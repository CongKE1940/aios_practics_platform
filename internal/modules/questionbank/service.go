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
	return service.repo.ListQuestionBanks(ctx, scope, normalizeListFilter(filter))
}

func (service *Service) CreateQuestionBank(ctx context.Context, scope Scope, input QuestionBankInput) (QuestionBank, error) {
	if strings.TrimSpace(input.Name) == "" {
		return QuestionBank{}, ErrInvalidInput
	}

	grants, shouldReplace, err := normalizeCreateVisibilityGrants(scope, input.VisibilityGrants)
	if err != nil {
		return QuestionBank{}, err
	}

	created, err := service.repo.CreateQuestionBank(ctx, QuestionBank{
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
	if err != nil {
		return QuestionBank{}, err
	}
	if shouldReplace {
		if err := service.repo.ReplaceVisibility(ctx, created.TenantID, created.ID, scope.UserID, grants); err != nil {
			return QuestionBank{}, err
		}
	}
	return created, nil
}

func (service *Service) UpdateQuestionBank(ctx context.Context, scope Scope, id int64, input QuestionBankInput) (QuestionBank, error) {
	if strings.TrimSpace(input.Name) == "" {
		return QuestionBank{}, ErrInvalidInput
	}

	current, err := service.repo.GetQuestionBank(ctx, scope, id)
	if err != nil {
		return QuestionBank{}, err
	}
	if !canManageQuestionBank(scope, current) {
		return QuestionBank{}, ErrForbidden
	}

	current.Name = strings.TrimSpace(input.Name)
	current.CourseID = input.CourseID
	current.Description = strings.TrimSpace(input.Description)
	updated, err := service.repo.UpdateQuestionBank(ctx, current)
	if err != nil {
		return QuestionBank{}, err
	}
	if input.VisibilityGrants != nil {
		grants, err := normalizeVisibilityGrants(input.VisibilityGrants)
		if err != nil {
			return QuestionBank{}, err
		}
		if err := service.repo.ReplaceVisibility(ctx, updated.TenantID, id, scope.UserID, grants); err != nil {
			return QuestionBank{}, err
		}
	}
	return updated, nil
}

func (service *Service) PublishQuestionBank(ctx context.Context, scope Scope, id int64) (QuestionBank, error) {
	current, err := service.repo.GetQuestionBank(ctx, scope, id)
	if err != nil {
		return QuestionBank{}, err
	}
	if !canManageQuestionBank(scope, current) {
		return QuestionBank{}, ErrForbidden
	}
	return service.repo.PublishQuestionBank(ctx, current.TenantID, id)
}

func (service *Service) AssignVisibility(ctx context.Context, scope Scope, id int64, input QuestionBankVisibilityInput) error {
	if len(input.Grants) == 0 {
		return ErrInvalidInput
	}
	current, err := service.repo.GetQuestionBank(ctx, scope, id)
	if err != nil {
		return err
	}
	if !canManageQuestionBank(scope, current) {
		return ErrForbidden
	}
	grants, err := normalizeVisibilityGrants(input.Grants)
	if err != nil {
		return err
	}
	return service.repo.ReplaceVisibility(ctx, current.TenantID, id, scope.UserID, grants)
}

func normalizeListFilter(filter QuestionBankListFilter) QuestionBankListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeCreateVisibilityGrants(scope Scope, grants []QuestionBankVisibilityGrant) ([]QuestionBankVisibilityGrant, bool, error) {
	if grants != nil {
		normalized, err := normalizeVisibilityGrants(grants)
		return normalized, true, err
	}
	switch {
	case isSystemScope(scope):
		return []QuestionBankVisibilityGrant{
			{
				GrantType:         GrantTypeVisibility,
				TargetType:        TargetTypeAll,
				TargetID:          0,
				PermissionType:    PermissionTypeView,
				InheritToChildren: true,
			},
		}, true, nil
	case isTenantManageScope(scope):
		return []QuestionBankVisibilityGrant{
			{
				GrantType:         GrantTypeVisibility,
				TargetType:        TargetTypeTenant,
				TargetID:          scope.TenantID,
				PermissionType:    PermissionTypeView,
				InheritToChildren: true,
			},
		}, true, nil
	default:
		return nil, false, nil
	}
}

func normalizeVisibilityGrants(grants []QuestionBankVisibilityGrant) ([]QuestionBankVisibilityGrant, error) {
	normalized := make([]QuestionBankVisibilityGrant, 0, len(grants))
	for _, grant := range grants {
		grant.GrantType = strings.TrimSpace(strings.ToLower(grant.GrantType))
		grant.TargetType = strings.TrimSpace(strings.ToLower(grant.TargetType))
		grant.PermissionType = strings.TrimSpace(strings.ToLower(grant.PermissionType))
		if grant.GrantType == "" || grant.TargetType == "" || grant.PermissionType == "" {
			return nil, ErrInvalidInput
		}
		if grant.TargetID < 0 || (grant.TargetID == 0 && !allowsZeroTarget(grant.TargetType)) {
			return nil, ErrInvalidInput
		}
		normalized = append(normalized, grant)
	}
	return normalized, nil
}

func allowsZeroTarget(targetType string) bool {
	switch targetType {
	case TargetTypeAll, TargetTypeTenant, TargetTypeTeacher, TargetTypeStudent, TargetTypeTenantAdmin, "school_admin":
		return true
	default:
		return false
	}
}

func canManageQuestionBank(scope Scope, item QuestionBank) bool {
	if isSystemScope(scope) {
		return true
	}
	if item.CreatorID == scope.UserID && scope.UserID > 0 {
		return true
	}
	return item.TenantID == scope.TenantID && (isTenantManageScope(scope) || containsExactPermission(scope.Permissions, "question_bank:manage"))
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
