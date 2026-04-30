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

type schoolEnableRepository interface {
	EnableSchool(ctx context.Context, tenantID int64, id int64) error
}

type schoolDeleteRepository interface {
	DeleteSchool(ctx context.Context, tenantID int64, id int64) error
}

type schoolCascadeDeleteRepository interface {
	DeleteSchoolWithCascade(ctx context.Context, tenantID int64, id int64) error
}

type schoolDependencyRepository interface {
	CountSchoolDeleteDependencies(ctx context.Context, tenantID int64, id int64) (SchoolDeleteDependencies, error)
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListSchools(ctx context.Context, scope Scope, filter SchoolListFilter) (PageResult[School], error) {
	return service.repo.ListSchools(ctx, readTenantID(scope), normalizeSchoolListFilter(filter))
}

func (service *Service) GetSchool(ctx context.Context, scope Scope, id int64) (School, error) {
	return service.repo.GetSchool(ctx, readTenantID(scope), id)
}

func (service *Service) CreateSchool(ctx context.Context, scope Scope, input SchoolInput) (School, error) {
	if !isSystemAdmin(scope) {
		return School{}, ErrForbidden
	}

	objectType := normalizeObjectType(input.ObjectType)
	if objectType == 0 || strings.TrimSpace(input.Name) == "" {
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
	current, err := service.repo.GetSchool(ctx, readTenantID(scope), id)
	if err != nil {
		return School{}, err
	}
	if !isSystemAdmin(scope) && current.TenantID != scope.TenantID {
		return School{}, ErrForbidden
	}

	objectType := normalizeObjectType(input.ObjectType)
	if objectType != 0 && isSystemAdmin(scope) {
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
	current, err := service.repo.GetSchool(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	return service.repo.DisableSchool(ctx, current.TenantID, id)
}

func (service *Service) EnableSchool(ctx context.Context, scope Scope, id int64) error {
	if !isSystemAdmin(scope) {
		return ErrForbidden
	}
	current, err := service.repo.GetSchool(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	if repo, ok := service.repo.(schoolEnableRepository); ok {
		return repo.EnableSchool(ctx, current.TenantID, id)
	}
	current.Status = StatusActive
	_, err = service.repo.UpdateSchool(ctx, current)
	return err
}

func (service *Service) DeleteSchool(ctx context.Context, scope Scope, id int64, cascadeDelete bool) error {
	if !isSystemAdmin(scope) {
		return ErrForbidden
	}
	current, err := service.repo.GetSchool(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	return service.deleteSchool(ctx, current.TenantID, id, cascadeDelete)
}

func (service *Service) BatchDeleteSchools(ctx context.Context, scope Scope, input SchoolBatchDeleteInput) error {
	if !isSystemAdmin(scope) {
		return ErrForbidden
	}
	ids := normalizeIDs(input.IDs)
	if len(ids) == 0 {
		return ErrInvalidInput
	}
	for _, id := range ids {
		current, err := service.repo.GetSchool(ctx, readTenantID(scope), id)
		if err != nil {
			return err
		}
		if err := service.deleteSchool(ctx, current.TenantID, id, input.CascadeDelete); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) deleteSchool(ctx context.Context, tenantID int64, id int64, cascadeDelete bool) error {
	if id <= 0 {
		return ErrInvalidInput
	}
	if dependencies, err := service.countSchoolDeleteDependencies(ctx, tenantID, id); err != nil {
		return err
	} else if dependencies.HasAny() && !cascadeDelete {
		return ErrDeleteRestricted
	}
	if cascadeDelete {
		if repo, ok := service.repo.(schoolCascadeDeleteRepository); ok {
			return repo.DeleteSchoolWithCascade(ctx, tenantID, id)
		}
		return ErrDeleteRestricted
	}
	if repo, ok := service.repo.(schoolDeleteRepository); ok {
		return repo.DeleteSchool(ctx, tenantID, id)
	}
	return service.repo.DisableSchool(ctx, tenantID, id)
}

func (service *Service) countSchoolDeleteDependencies(ctx context.Context, tenantID int64, id int64) (SchoolDeleteDependencies, error) {
	if repo, ok := service.repo.(schoolDependencyRepository); ok {
		return repo.CountSchoolDeleteDependencies(ctx, tenantID, id)
	}
	grades, err := service.repo.ListGrades(ctx, tenantID, GradeListFilter{SchoolID: id, Page: 1, PageSize: 1})
	if err != nil {
		return SchoolDeleteDependencies{}, err
	}
	classes, err := service.repo.ListClasses(ctx, tenantID, ClassListFilter{SchoolID: id, Page: 1, PageSize: 1})
	if err != nil {
		return SchoolDeleteDependencies{}, err
	}
	return SchoolDeleteDependencies{GradeCount: grades.Total, ClassCount: classes.Total}, nil
}

func (service *Service) ListGrades(ctx context.Context, scope Scope, filter GradeListFilter) (PageResult[Grade], error) {
	return service.repo.ListGrades(ctx, readTenantID(scope), normalizeGradeListFilter(filter))
}

func (service *Service) GetGrade(ctx context.Context, scope Scope, id int64) (Grade, error) {
	return service.repo.GetGrade(ctx, readTenantID(scope), id)
}

func (service *Service) CreateGrade(ctx context.Context, scope Scope, input GradeInput) (Grade, error) {
	school, err := service.repo.GetSchool(ctx, readTenantID(scope), input.SchoolID)
	if err != nil {
		return Grade{}, err
	}
	return service.repo.CreateGrade(ctx, Grade{
		TenantID:   school.TenantID,
		SchoolID:   input.SchoolID,
		Code:       input.Code,
		Name:       input.Name,
		GradeLevel: input.GradeLevel,
		SchoolYear: input.SchoolYear,
		Status:     StatusActive,
	})
}

func (service *Service) UpdateGrade(ctx context.Context, scope Scope, id int64, input GradeInput) (Grade, error) {
	current, err := service.repo.GetGrade(ctx, readTenantID(scope), id)
	if err != nil {
		return Grade{}, err
	}
	if _, err := service.repo.GetSchool(ctx, current.TenantID, input.SchoolID); err != nil {
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
	current, err := service.repo.GetGrade(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	return service.repo.DisableGrade(ctx, current.TenantID, id)
}

func (service *Service) ListClasses(ctx context.Context, scope Scope, filter ClassListFilter) (PageResult[Class], error) {
	return service.repo.ListClasses(ctx, readTenantID(scope), normalizeClassListFilter(filter))
}

func (service *Service) GetClass(ctx context.Context, scope Scope, id int64) (Class, error) {
	return service.repo.GetClass(ctx, readTenantID(scope), id)
}

func (service *Service) CreateClass(ctx context.Context, scope Scope, input ClassInput) (Class, error) {
	school, err := service.repo.GetSchool(ctx, readTenantID(scope), input.SchoolID)
	if err != nil {
		return Class{}, err
	}
	grade, err := service.repo.GetGrade(ctx, school.TenantID, input.GradeID)
	if err != nil {
		return Class{}, err
	}
	if grade.SchoolID != school.ID {
		return Class{}, ErrInvalidInput
	}
	return service.repo.CreateClass(ctx, Class{
		TenantID: school.TenantID,
		SchoolID: input.SchoolID,
		GradeID:  input.GradeID,
		Code:     input.Code,
		Name:     input.Name,
		ClassNo:  input.ClassNo,
		Status:   StatusActive,
	})
}

func (service *Service) UpdateClass(ctx context.Context, scope Scope, id int64, input ClassInput) (Class, error) {
	current, err := service.repo.GetClass(ctx, readTenantID(scope), id)
	if err != nil {
		return Class{}, err
	}
	school, err := service.repo.GetSchool(ctx, current.TenantID, input.SchoolID)
	if err != nil {
		return Class{}, err
	}
	grade, err := service.repo.GetGrade(ctx, current.TenantID, input.GradeID)
	if err != nil {
		return Class{}, err
	}
	if grade.SchoolID != school.ID {
		return Class{}, ErrInvalidInput
	}

	current.SchoolID = input.SchoolID
	current.GradeID = input.GradeID
	current.Code = input.Code
	current.Name = input.Name
	current.ClassNo = input.ClassNo
	return service.repo.UpdateClass(ctx, current)
}

func (service *Service) DisableClass(ctx context.Context, scope Scope, id int64) error {
	current, err := service.repo.GetClass(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	return service.repo.DisableClass(ctx, current.TenantID, id)
}

func (service *Service) ListCourses(ctx context.Context, scope Scope, filter CourseListFilter) (PageResult[Course], error) {
	return service.repo.ListCourses(ctx, readTenantID(scope), normalizeCourseListFilter(filter))
}

func (service *Service) GetCourse(ctx context.Context, scope Scope, id int64) (Course, error) {
	return service.repo.GetCourse(ctx, readTenantID(scope), id)
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

	current, err := service.repo.GetCourse(ctx, readTenantID(scope), id)
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
	current, err := service.repo.GetCourse(ctx, readTenantID(scope), id)
	if err != nil {
		return err
	}
	return service.repo.DisableCourse(ctx, current.TenantID, id)
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

func normalizeObjectType(value int) int {
	switch value {
	case 0, ObjectTypeSchool:
		return ObjectTypeSchool
	case ObjectTypeOrganization:
		return ObjectTypeOrganization
	default:
		return 0
	}
}

func generateSchoolCode(objectType int) string {
	prefix := "SCH"
	if objectType == ObjectTypeOrganization {
		prefix = "ORG"
	}
	return fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
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

func isSystemAdmin(scope Scope) bool {
	if scope.UserType == "sys_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" || permission == "tenant:manage" {
			return true
		}
		if scope.UserType == "" && permission == "org:manage" {
			return true
		}
	}
	return false
}

func normalizeIDs(ids []int64) []int64 {
	seen := make(map[int64]struct{}, len(ids))
	result := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result
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
