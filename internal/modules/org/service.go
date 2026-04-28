package org

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListSchools(ctx context.Context, scope Scope, filter SchoolListFilter) (PageResult[School], error) {
	return service.repo.ListSchools(ctx, scope.TenantID, normalizeSchoolListFilter(filter))
}

func (service *Service) GetSchool(ctx context.Context, scope Scope, id int64) (School, error) {
	return service.repo.GetSchool(ctx, scope.TenantID, id)
}

func (service *Service) CreateSchool(ctx context.Context, scope Scope, input SchoolInput) (School, error) {
	if !isSystemAdmin(scope) {
		return School{}, ErrForbidden
	}

	objectType := normalizeObjectType(input.ObjectType)
	if objectType == "" || strings.TrimSpace(input.Name) == "" {
		return School{}, ErrInvalidInput
	}

	return service.repo.CreateSchool(ctx, School{
		TenantID:    scope.TenantID,
		ObjectType:  objectType,
		Code:        generateSchoolCode(objectType),
		Name:        strings.TrimSpace(input.Name),
		EnglishName: strings.TrimSpace(input.EnglishName),
		Address:     strings.TrimSpace(input.Address),
		LogoURL:     strings.TrimSpace(input.LogoURL),
		Status:      StatusActive,
	})
}

func (service *Service) UpdateSchool(ctx context.Context, scope Scope, id int64, input SchoolInput) (School, error) {
	current, err := service.repo.GetSchool(ctx, scope.TenantID, id)
	if err != nil {
		return School{}, err
	}
	if !isSystemAdmin(scope) && current.TenantID != scope.TenantID {
		return School{}, ErrForbidden
	}

	objectType := normalizeObjectType(input.ObjectType)
	if objectType != "" && isSystemAdmin(scope) {
		current.ObjectType = objectType
	}
	if strings.TrimSpace(input.Name) == "" {
		return School{}, ErrInvalidInput
	}

	current.Name = strings.TrimSpace(input.Name)
	current.EnglishName = strings.TrimSpace(input.EnglishName)
	current.Address = strings.TrimSpace(input.Address)
	current.LogoURL = strings.TrimSpace(input.LogoURL)
	return service.repo.UpdateSchool(ctx, current)
}

func (service *Service) DisableSchool(ctx context.Context, scope Scope, id int64) error {
	if !isSystemAdmin(scope) {
		return ErrForbidden
	}
	return service.repo.DisableSchool(ctx, scope.TenantID, id)
}

func (service *Service) EnableSchool(ctx context.Context, scope Scope, id int64) error {
	if !isSystemAdmin(scope) {
		return ErrForbidden
	}
	return service.repo.EnableSchool(ctx, scope.TenantID, id)
}

func (service *Service) DeleteSchool(ctx context.Context, scope Scope, id int64) error {
	if !isSystemAdmin(scope) {
		return ErrForbidden
	}
	return service.repo.DeleteSchool(ctx, scope.TenantID, id)
}

func (service *Service) ListGrades(ctx context.Context, scope Scope, filter GradeListFilter) (PageResult[Grade], error) {
	return service.repo.ListGrades(ctx, scope.TenantID, normalizeGradeListFilter(filter))
}

func (service *Service) GetGrade(ctx context.Context, scope Scope, id int64) (Grade, error) {
	return service.repo.GetGrade(ctx, scope.TenantID, id)
}

func (service *Service) CreateGrade(ctx context.Context, scope Scope, input GradeInput) (Grade, error) {
	return service.repo.CreateGrade(ctx, Grade{
		TenantID:   scope.TenantID,
		SchoolID:   input.SchoolID,
		Code:       input.Code,
		Name:       input.Name,
		GradeLevel: input.GradeLevel,
		SchoolYear: input.SchoolYear,
		Status:     StatusActive,
	})
}

func (service *Service) UpdateGrade(ctx context.Context, scope Scope, id int64, input GradeInput) (Grade, error) {
	current, err := service.repo.GetGrade(ctx, scope.TenantID, id)
	if err != nil {
		return Grade{}, err
	}

	current.SchoolID = input.SchoolID
	current.Code = input.Code
	current.Name = input.Name
	current.GradeLevel = input.GradeLevel
	current.SchoolYear = input.SchoolYear
	return service.repo.UpdateGrade(ctx, current)
}

func (service *Service) DisableGrade(ctx context.Context, scope Scope, id int64) error {
	return service.repo.DisableGrade(ctx, scope.TenantID, id)
}

func (service *Service) ListClasses(ctx context.Context, scope Scope, filter ClassListFilter) (PageResult[Class], error) {
	return service.repo.ListClasses(ctx, scope.TenantID, normalizeClassListFilter(filter))
}

func (service *Service) GetClass(ctx context.Context, scope Scope, id int64) (Class, error) {
	return service.repo.GetClass(ctx, scope.TenantID, id)
}

func (service *Service) CreateClass(ctx context.Context, scope Scope, input ClassInput) (Class, error) {
	return service.repo.CreateClass(ctx, Class{
		TenantID: scope.TenantID,
		SchoolID: input.SchoolID,
		GradeID:  input.GradeID,
		Code:     input.Code,
		Name:     input.Name,
		ClassNo:  input.ClassNo,
		Status:   StatusActive,
	})
}

func (service *Service) UpdateClass(ctx context.Context, scope Scope, id int64, input ClassInput) (Class, error) {
	current, err := service.repo.GetClass(ctx, scope.TenantID, id)
	if err != nil {
		return Class{}, err
	}

	current.SchoolID = input.SchoolID
	current.GradeID = input.GradeID
	current.Code = input.Code
	current.Name = input.Name
	current.ClassNo = input.ClassNo
	return service.repo.UpdateClass(ctx, current)
}

func (service *Service) DisableClass(ctx context.Context, scope Scope, id int64) error {
	return service.repo.DisableClass(ctx, scope.TenantID, id)
}

func (service *Service) ListCourses(ctx context.Context, scope Scope, filter CourseListFilter) (PageResult[Course], error) {
	return service.repo.ListCourses(ctx, scope.TenantID, normalizeCourseListFilter(filter))
}

func (service *Service) GetCourse(ctx context.Context, scope Scope, id int64) (Course, error) {
	return service.repo.GetCourse(ctx, scope.TenantID, id)
}

func (service *Service) CreateCourse(ctx context.Context, scope Scope, input CourseInput) (Course, error) {
	if input.StartAt != nil && input.EndAt != nil && input.StartAt.After(*input.EndAt) {
		return Course{}, ErrInvalidInput
	}

	return service.repo.CreateCourse(ctx, Course{
		TenantID:    scope.TenantID,
		Code:        input.Code,
		Name:        input.Name,
		StartAt:     input.StartAt,
		EndAt:       input.EndAt,
		Status:      StatusActive,
		Description: input.Description,
	})
}

func (service *Service) UpdateCourse(ctx context.Context, scope Scope, id int64, input CourseInput) (Course, error) {
	if input.StartAt != nil && input.EndAt != nil && input.StartAt.After(*input.EndAt) {
		return Course{}, ErrInvalidInput
	}

	current, err := service.repo.GetCourse(ctx, scope.TenantID, id)
	if err != nil {
		return Course{}, err
	}

	current.Code = input.Code
	current.Name = input.Name
	current.StartAt = input.StartAt
	current.EndAt = input.EndAt
	current.Description = input.Description
	return service.repo.UpdateCourse(ctx, current)
}

func (service *Service) DisableCourse(ctx context.Context, scope Scope, id int64) error {
	return service.repo.DisableCourse(ctx, scope.TenantID, id)
}

func normalizeSchoolListFilter(filter SchoolListFilter) SchoolListFilter {
	filter.ObjectType = normalizeObjectType(filter.ObjectType)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeGradeListFilter(filter GradeListFilter) GradeListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeClassListFilter(filter ClassListFilter) ClassListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeCourseListFilter(filter CourseListFilter) CourseListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeObjectType(value string) string {
	switch strings.TrimSpace(value) {
	case "", ObjectTypeSchool:
		return ObjectTypeSchool
	case ObjectTypeOrganization:
		return ObjectTypeOrganization
	default:
		return ""
	}
}

func generateSchoolCode(objectType string) string {
	prefix := "SCH"
	if objectType == ObjectTypeOrganization {
		prefix = "ORG"
	}
	return fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
}

func isSystemAdmin(scope Scope) bool {
	if scope.UserType == "sys_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" || permission == "tenant:manage" {
			return true
		}
	}
	return false
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
	return pageSize
}
