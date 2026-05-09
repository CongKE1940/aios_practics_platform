package org

import (
	"context"
	"time"
)

type orgLifecycleRepository interface {
	GetGradeLifecycle(ctx context.Context, tenantID int64, gradeID int64) (orgLifecycle, error)
	GetClassLifecycle(ctx context.Context, tenantID int64, classID int64) (orgLifecycle, error)
	EndGrade(ctx context.Context, tenantID int64, gradeID int64, endedAt time.Time) error
	EndClass(ctx context.Context, tenantID int64, classID int64, endedAt time.Time) error
}

func (service *Service) EndGrade(ctx context.Context, scope Scope, id int64, input EndGradeInput) error {
	if !canManageOrgScope(scope) {
		return ErrForbidden
	}
	if id <= 0 || input.EndedAt.IsZero() {
		return ErrInvalidInput
	}
	repo, err := service.lifecycleRepository()
	if err != nil {
		return err
	}
	current, err := repo.GetGradeLifecycle(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	if current.EndedAt != nil && !input.EndedAt.Equal(*current.EndedAt) {
		return ErrInvalidInput
	}
	return repo.EndGrade(ctx, current.TenantID, id, input.EndedAt)
}

func (service *Service) EndClass(ctx context.Context, scope Scope, id int64, input EndClassInput) error {
	if !canManageOrgScope(scope) {
		return ErrForbidden
	}
	if id <= 0 || input.EndedAt.IsZero() {
		return ErrInvalidInput
	}
	repo, err := service.lifecycleRepository()
	if err != nil {
		return err
	}
	current, err := repo.GetClassLifecycle(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	if current.EndedAt != nil && !input.EndedAt.Equal(*current.EndedAt) {
		return ErrInvalidInput
	}
	return repo.EndClass(ctx, current.TenantID, id, input.EndedAt)
}

func (service *Service) lifecycleRepository() (orgLifecycleRepository, error) {
	if service == nil || service.repo == nil {
		return nil, ErrInvalidInput
	}
	repo, ok := service.repo.(orgLifecycleRepository)
	if !ok {
		return nil, ErrInvalidInput
	}
	return repo, nil
}
