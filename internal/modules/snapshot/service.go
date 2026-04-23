package snapshot

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

func (service *Service) ListAuditLogs(ctx context.Context, scope Scope, filter AuditLogListFilter) (PageResult[AuditLog], error) {
	if service == nil || service.repo == nil {
		return PageResult[AuditLog]{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "audit:view") {
		return PageResult[AuditLog]{}, ErrForbidden
	}
	filter.ModuleName = strings.TrimSpace(filter.ModuleName)
	filter.ResourceType = strings.TrimSpace(filter.ResourceType)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListAuditLogs(ctx, scope.TenantID, filter)
}

func (service *Service) ListEntitySnapshots(
	ctx context.Context,
	scope Scope,
	filter EntitySnapshotListFilter,
) (PageResult[EntitySnapshot], error) {
	if service == nil || service.repo == nil {
		return PageResult[EntitySnapshot]{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "audit:view") {
		return PageResult[EntitySnapshot]{}, ErrForbidden
	}
	filter.EntityType = strings.TrimSpace(filter.EntityType)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListEntitySnapshots(ctx, scope.TenantID, filter)
}

func (service *Service) ListStudentTransitions(
	ctx context.Context,
	scope Scope,
	filter StudentTransitionListFilter,
) (PageResult[StudentTransition], error) {
	if service == nil || service.repo == nil {
		return PageResult[StudentTransition]{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "audit:view") {
		return PageResult[StudentTransition]{}, ErrForbidden
	}
	filter.TransitionType = strings.TrimSpace(strings.ToLower(filter.TransitionType))
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListStudentTransitions(ctx, scope.TenantID, filter)
}

func (service *Service) RecordStudentTransition(
	ctx context.Context,
	scope Scope,
	input StudentTransitionInput,
) (StudentTransition, error) {
	if service == nil || service.repo == nil {
		return StudentTransition{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "org:manage") {
		return StudentTransition{}, ErrForbidden
	}
	input.TransitionType = strings.TrimSpace(strings.ToLower(input.TransitionType))
	input.Remark = strings.TrimSpace(input.Remark)
	if scope.UserID <= 0 || input.StudentID <= 0 || input.OccurredAt.IsZero() || !isSupportedStudentTransitionType(input.TransitionType) {
		return StudentTransition{}, ErrInvalidInput
	}
	if requiresTargetClass(input.TransitionType) && input.ToClassID <= 0 {
		return StudentTransition{}, ErrInvalidInput
	}
	if !requiresTargetClass(input.TransitionType) {
		input.ToClassID = 0
	}
	return service.repo.ApplyStudentTransition(ctx, scope.TenantID, scope.UserID, input)
}

func (service *Service) ListTeacherAssignmentHistories(
	ctx context.Context,
	scope Scope,
	filter TeacherAssignmentHistoryListFilter,
) (PageResult[TeacherAssignmentHistory], error) {
	if service == nil || service.repo == nil {
		return PageResult[TeacherAssignmentHistory]{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "audit:view") {
		return PageResult[TeacherAssignmentHistory]{}, ErrForbidden
	}
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListTeacherAssignmentHistories(ctx, scope.TenantID, filter)
}

func (service *Service) RecordTeacherAssignmentChange(
	ctx context.Context,
	scope Scope,
	input TeacherAssignmentChangeInput,
) (TeacherAssignmentHistory, error) {
	if service == nil || service.repo == nil {
		return TeacherAssignmentHistory{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "org:manage") {
		return TeacherAssignmentHistory{}, ErrForbidden
	}
	input.ChangeType = strings.TrimSpace(strings.ToLower(input.ChangeType))
	if scope.UserID <= 0 || input.TeacherID <= 0 || input.ClassID <= 0 || input.CourseID <= 0 || input.EffectiveAt.IsZero() {
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}
	if input.ChangeType != TeacherAssignmentChangeAssign && input.ChangeType != TeacherAssignmentChangeUnassign {
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}
	return service.repo.ApplyTeacherAssignmentChange(ctx, scope.TenantID, scope.UserID, input)
}

func isSupportedStudentTransitionType(value string) bool {
	switch value {
	case TransitionTypeClassChange,
		TransitionTypePromote,
		TransitionTypeTransferIn,
		TransitionTypeTransferOut,
		TransitionTypeGraduate,
		TransitionTypeLeaveSchool,
		TransitionTypeReEnroll:
		return true
	default:
		return false
	}
}

func requiresTargetClass(value string) bool {
	switch value {
	case TransitionTypeClassChange, TransitionTypePromote, TransitionTypeTransferIn, TransitionTypeReEnroll:
		return true
	default:
		return false
	}
}
