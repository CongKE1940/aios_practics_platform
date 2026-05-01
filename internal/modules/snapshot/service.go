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
	if !canViewAudit(scope) {
		return PageResult[AuditLog]{}, ErrForbidden
	}
	filter.ModuleName = strings.TrimSpace(filter.ModuleName)
	filter.ResourceType = strings.TrimSpace(filter.ResourceType)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListAuditLogs(ctx, readTenantID(scope), filter)
}

func (service *Service) ListEntitySnapshots(
	ctx context.Context,
	scope Scope,
	filter EntitySnapshotListFilter,
) (PageResult[EntitySnapshot], error) {
	if service == nil || service.repo == nil {
		return PageResult[EntitySnapshot]{}, ErrRepositoryUnavailable
	}
	if !canViewAudit(scope) {
		return PageResult[EntitySnapshot]{}, ErrForbidden
	}
	filter.EntityType = strings.TrimSpace(filter.EntityType)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListEntitySnapshots(ctx, readTenantID(scope), filter)
}

func (service *Service) ListStudentTransitions(
	ctx context.Context,
	scope Scope,
	filter StudentTransitionListFilter,
) (PageResult[StudentTransition], error) {
	if service == nil || service.repo == nil {
		return PageResult[StudentTransition]{}, ErrRepositoryUnavailable
	}
	if !canViewAudit(scope) {
		return PageResult[StudentTransition]{}, ErrForbidden
	}
	filter.TransitionType = strings.TrimSpace(strings.ToLower(filter.TransitionType))
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListStudentTransitions(ctx, readTenantID(scope), filter)
}

func (service *Service) RecordStudentTransition(
	ctx context.Context,
	scope Scope,
	input StudentTransitionInput,
) (StudentTransition, error) {
	if service == nil || service.repo == nil {
		return StudentTransition{}, ErrRepositoryUnavailable
	}
	if !canManageOrg(scope) {
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
	if !canViewAudit(scope) {
		return PageResult[TeacherAssignmentHistory]{}, ErrForbidden
	}
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	filter.AssignmentType = strings.TrimSpace(strings.ToLower(filter.AssignmentType))
	if filter.AssignmentType != "" && !isSupportedTeacherAssignmentType(filter.AssignmentType) {
		return PageResult[TeacherAssignmentHistory]{}, ErrInvalidInput
	}
	return service.repo.ListTeacherAssignmentHistories(ctx, readTenantID(scope), filter)
}

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" || containsPermission(scope.Permissions, "system:manage") || containsPermission(scope.Permissions, "tenant:manage") {
		return 0
	}
	return scope.TenantID
}

func canViewAudit(scope Scope) bool {
	return scope.UserType == "sys_admin" || containsPermission(scope.Permissions, "audit:view") || containsPermission(scope.Permissions, "system:manage") || containsPermission(scope.Permissions, "tenant:manage")
}

func canManageOrg(scope Scope) bool {
	return scope.UserType == "sys_admin" || containsPermission(scope.Permissions, "org:manage") || containsPermission(scope.Permissions, "system:manage") || containsPermission(scope.Permissions, "tenant:manage")
}

func (service *Service) RecordTeacherAssignmentChange(
	ctx context.Context,
	scope Scope,
	input TeacherAssignmentChangeInput,
) (TeacherAssignmentHistory, error) {
	if service == nil || service.repo == nil {
		return TeacherAssignmentHistory{}, ErrRepositoryUnavailable
	}
	if !canManageOrg(scope) {
		return TeacherAssignmentHistory{}, ErrForbidden
	}
	input.AssignmentType = strings.TrimSpace(strings.ToLower(input.AssignmentType))
	if input.AssignmentType == "" {
		input.AssignmentType = TeacherAssignmentTypeCourseTeacher
	}
	input.ChangeType = strings.TrimSpace(strings.ToLower(input.ChangeType))
	if scope.UserID <= 0 || input.TeacherID <= 0 || input.ClassID <= 0 || input.EffectiveAt.IsZero() {
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}
	if !isSupportedTeacherAssignmentType(input.AssignmentType) {
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}
	if input.AssignmentType == TeacherAssignmentTypeCourseTeacher && input.CourseID <= 0 {
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}
	if input.AssignmentType == TeacherAssignmentTypeHeadTeacher {
		input.CourseID = 0
	}
	if input.ChangeType != TeacherAssignmentChangeAssign && input.ChangeType != TeacherAssignmentChangeUnassign {
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}
	return service.repo.ApplyTeacherAssignmentChange(ctx, scope.TenantID, scope.UserID, input)
}

func isSupportedTeacherAssignmentType(value string) bool {
	switch value {
	case TeacherAssignmentTypeCourseTeacher, TeacherAssignmentTypeHeadTeacher:
		return true
	default:
		return false
	}
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
