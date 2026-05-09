package org

import (
	"context"
	"strings"
	"time"
)

type orgPeriodRepository interface {
	ListOrgPeriods(ctx context.Context, tenantID int64, filter OrgPeriodListFilter) (PageResult[OrgPeriod], error)
	GetOrgPeriod(ctx context.Context, tenantID int64, id int64) (OrgPeriod, error)
	CreateOrgPeriod(ctx context.Context, period OrgPeriod) (OrgPeriod, error)
	UpdateOrgPeriod(ctx context.Context, period OrgPeriod) (OrgPeriod, error)
	DisableOrgPeriod(ctx context.Context, tenantID int64, id int64) error
	HasOverlappingOrgPeriod(ctx context.Context, tenantID int64, targetType string, targetID int64, startAt time.Time, endAt time.Time, excludeID int64) (bool, error)
	FindCoveringGradePeriod(ctx context.Context, tenantID int64, gradeID int64, startAt time.Time, endAt time.Time) (OrgPeriod, error)
	ListGradePeriodClasses(ctx context.Context, tenantID int64, gradePeriodID int64) ([]GradePeriodClass, error)
	ListStudentMembershipHistories(ctx context.Context, tenantID int64, filter StudentMembershipHistoryFilter) (PageResult[StudentMembershipHistory], error)
}

func (service *Service) ListOrgPeriods(ctx context.Context, scope Scope, filter OrgPeriodListFilter) (PageResult[OrgPeriod], error) {
	repo, err := service.periodRepository()
	if err != nil {
		return PageResult[OrgPeriod]{}, err
	}
	filter.TargetType = normalizePeriodTargetType(filter.TargetType)
	filter.Status = strings.TrimSpace(strings.ToLower(filter.Status))
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return repo.ListOrgPeriods(ctx, readTenantID(scope), filter)
}

func (service *Service) GetOrgPeriod(ctx context.Context, scope Scope, id int64) (OrgPeriod, error) {
	if id <= 0 {
		return OrgPeriod{}, ErrInvalidInput
	}
	repo, err := service.periodRepository()
	if err != nil {
		return OrgPeriod{}, err
	}
	return repo.GetOrgPeriod(ctx, readTenantID(scope), id)
}

func (service *Service) CreateOrgPeriod(ctx context.Context, scope Scope, input OrgPeriodInput) (OrgPeriod, error) {
	if !canManageOrgScope(scope) {
		return OrgPeriod{}, ErrForbidden
	}
	repo, err := service.periodRepository()
	if err != nil {
		return OrgPeriod{}, err
	}
	period, err := service.buildOrgPeriod(ctx, scope, input, nil)
	if err != nil {
		return OrgPeriod{}, err
	}
	if err := service.ensureOrgPeriodDoesNotOverlap(ctx, repo, period, 0); err != nil {
		return OrgPeriod{}, err
	}
	return repo.CreateOrgPeriod(ctx, period)
}

func (service *Service) UpdateOrgPeriod(ctx context.Context, scope Scope, id int64, input OrgPeriodInput) (OrgPeriod, error) {
	if !canManageOrgScope(scope) {
		return OrgPeriod{}, ErrForbidden
	}
	if id <= 0 {
		return OrgPeriod{}, ErrInvalidInput
	}
	repo, err := service.periodRepository()
	if err != nil {
		return OrgPeriod{}, err
	}
	current, err := repo.GetOrgPeriod(ctx, readTenantID(scope), id)
	if err != nil {
		return OrgPeriod{}, err
	}
	period, err := service.buildOrgPeriod(ctx, scope, input, &current)
	if err != nil {
		return OrgPeriod{}, err
	}
	period.ID = current.ID
	period.TenantID = current.TenantID
	period.TargetType = current.TargetType
	period.TargetID = current.TargetID
	period.GradeID = current.GradeID
	period.ClassID = current.ClassID
	period.Status = current.Status
	if normalizePeriodTargetType(input.TargetType) != current.TargetType || input.TargetID != current.TargetID {
		return OrgPeriod{}, ErrInvalidInput
	}
	if err := service.ensureOrgPeriodDoesNotOverlap(ctx, repo, period, current.ID); err != nil {
		return OrgPeriod{}, err
	}
	return repo.UpdateOrgPeriod(ctx, period)
}

func (service *Service) DisableOrgPeriod(ctx context.Context, scope Scope, id int64) error {
	if !canManageOrgScope(scope) {
		return ErrForbidden
	}
	if id <= 0 {
		return ErrInvalidInput
	}
	repo, err := service.periodRepository()
	if err != nil {
		return err
	}
	current, err := repo.GetOrgPeriod(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	return repo.DisableOrgPeriod(ctx, current.TenantID, id)
}

func (service *Service) ListGradePeriodClasses(ctx context.Context, scope Scope, gradePeriodID int64) ([]GradePeriodClass, error) {
	if gradePeriodID <= 0 {
		return nil, ErrInvalidInput
	}
	repo, err := service.periodRepository()
	if err != nil {
		return nil, err
	}
	period, err := repo.GetOrgPeriod(ctx, readTenantID(scope), gradePeriodID)
	if err != nil {
		return nil, err
	}
	if period.TargetType != OrgPeriodTargetGrade {
		return nil, ErrInvalidInput
	}
	return repo.ListGradePeriodClasses(ctx, period.TenantID, period.ID)
}

func (service *Service) ListStudentMembershipHistories(ctx context.Context, scope Scope, filter StudentMembershipHistoryFilter) (PageResult[StudentMembershipHistory], error) {
	repo, err := service.periodRepository()
	if err != nil {
		return PageResult[StudentMembershipHistory]{}, err
	}
	tenantID := readTenantID(scope)
	if filter.PeriodID > 0 {
		period, err := repo.GetOrgPeriod(ctx, tenantID, filter.PeriodID)
		if err != nil {
			return PageResult[StudentMembershipHistory]{}, err
		}
		tenantID = period.TenantID
		filter.StartAt = &period.StartAt
		filter.EndAt = &period.EndAt
		filter.SchoolID = period.SchoolID
		filter.GradeID = period.GradeID
		if period.TargetType == OrgPeriodTargetClass && period.ClassID != nil {
			filter.ClassID = *period.ClassID
		}
	}
	if filter.StartAt != nil && filter.EndAt != nil && !filter.StartAt.Before(*filter.EndAt) {
		return PageResult[StudentMembershipHistory]{}, ErrInvalidInput
	}
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return repo.ListStudentMembershipHistories(ctx, tenantID, filter)
}

func (service *Service) buildOrgPeriod(ctx context.Context, scope Scope, input OrgPeriodInput, current *OrgPeriod) (OrgPeriod, error) {
	input.TargetType = normalizePeriodTargetType(input.TargetType)
	input.Code = strings.TrimSpace(input.Code)
	input.Name = strings.TrimSpace(input.Name)
	if input.TargetType == "" || input.TargetID <= 0 || input.Code == "" || input.Name == "" || !input.StartAt.Before(input.EndAt) {
		return OrgPeriod{}, ErrInvalidInput
	}

	tenantID := readTenantID(scope)
	period := OrgPeriod{
		TargetType: input.TargetType,
		TargetID:   input.TargetID,
		Code:       input.Code,
		Name:       input.Name,
		StartAt:    input.StartAt,
		EndAt:      input.EndAt,
		Status:     StatusActive,
	}
	if current != nil {
		tenantID = current.TenantID
		period.TenantID = current.TenantID
		period.Status = current.Status
	}

	switch input.TargetType {
	case OrgPeriodTargetGrade:
		grade, err := service.repo.GetGrade(ctx, tenantID, input.TargetID)
		if err != nil {
			return OrgPeriod{}, err
		}
		if input.ParentPeriodID > 0 {
			return OrgPeriod{}, ErrInvalidInput
		}
		period.TenantID = grade.TenantID
		period.SchoolID = grade.SchoolID
		period.GradeID = grade.ID
	case OrgPeriodTargetClass:
		classItem, err := service.repo.GetClass(ctx, tenantID, input.TargetID)
		if err != nil {
			return OrgPeriod{}, err
		}
		grade, err := service.repo.GetGrade(ctx, classItem.TenantID, classItem.GradeID)
		if err != nil {
			return OrgPeriod{}, err
		}
		period.TenantID = classItem.TenantID
		period.SchoolID = classItem.SchoolID
		period.GradeID = classItem.GradeID
		period.ClassID = &classItem.ID
		parentPeriod, err := service.resolveCoveringGradePeriod(ctx, period.TenantID, grade.ID, input.ParentPeriodID, input.StartAt, input.EndAt)
		if err != nil {
			return OrgPeriod{}, err
		}
		period.ParentPeriodID = &parentPeriod.ID
	default:
		return OrgPeriod{}, ErrInvalidInput
	}
	return period, nil
}

func (service *Service) resolveCoveringGradePeriod(ctx context.Context, tenantID int64, gradeID int64, parentPeriodID int64, startAt time.Time, endAt time.Time) (OrgPeriod, error) {
	repo, err := service.periodRepository()
	if err != nil {
		return OrgPeriod{}, err
	}
	if parentPeriodID <= 0 {
		return repo.FindCoveringGradePeriod(ctx, tenantID, gradeID, startAt, endAt)
	}
	parentPeriod, err := repo.GetOrgPeriod(ctx, tenantID, parentPeriodID)
	if err != nil {
		return OrgPeriod{}, err
	}
	if parentPeriod.TargetType != OrgPeriodTargetGrade || parentPeriod.GradeID != gradeID || parentPeriod.Status != StatusActive {
		return OrgPeriod{}, ErrInvalidInput
	}
	if parentPeriod.StartAt.After(startAt) || parentPeriod.EndAt.Before(endAt) {
		return OrgPeriod{}, ErrInvalidInput
	}
	return parentPeriod, nil
}

func (service *Service) ensureOrgPeriodDoesNotOverlap(ctx context.Context, repo orgPeriodRepository, period OrgPeriod, excludeID int64) error {
	overlapped, err := repo.HasOverlappingOrgPeriod(ctx, period.TenantID, period.TargetType, period.TargetID, period.StartAt, period.EndAt, excludeID)
	if err != nil {
		return err
	}
	if overlapped {
		return ErrInvalidInput
	}
	return nil
}

func (service *Service) periodRepository() (orgPeriodRepository, error) {
	if service == nil || service.repo == nil {
		return nil, ErrInvalidInput
	}
	repo, ok := service.repo.(orgPeriodRepository)
	if !ok {
		return nil, ErrInvalidInput
	}
	return repo, nil
}

func normalizePeriodTargetType(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case OrgPeriodTargetGrade:
		return OrgPeriodTargetGrade
	case OrgPeriodTargetClass:
		return OrgPeriodTargetClass
	default:
		return ""
	}
}

func canManageOrgScope(scope Scope) bool {
	if isSystemAdmin(scope) {
		return true
	}
	return containsPermission(scope.Permissions, "org:manage")
}

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}
