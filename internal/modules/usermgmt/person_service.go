package usermgmt

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type PersonRepository interface {
	ListStudents(ctx context.Context, tenantID int64, filter StudentListFilter) (PageResult[Student], error)
	CreateStudentWithUser(ctx context.Context, user User, passwordHash string, input StudentInput) (Student, error)
	ListTeachers(ctx context.Context, tenantID int64, filter TeacherListFilter) (PageResult[Teacher], error)
	CreateTeacherWithUser(ctx context.Context, user User, passwordHash string, input TeacherInput) (Teacher, error)
}

func (service *Service) ListStudents(ctx context.Context, scope Scope, filter StudentListFilter) (PageResult[Student], error) {
	repo, err := service.personRepository()
	if err != nil {
		return PageResult[Student]{}, err
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return repo.ListStudents(ctx, userLookupTenantID(scope), filter)
}

func (service *Service) CreateStudent(ctx context.Context, scope Scope, input StudentInput) (Student, error) {
	if !canManageTargetUser(scope, UserTypeStudent) {
		return Student{}, ErrForbidden
	}
	if scope.TenantID <= 0 || input.SchoolID <= 0 || strings.TrimSpace(input.DisplayName) == "" {
		return Student{}, ErrInvalidInput
	}
	input = normalizeStudentInput(input)
	if input.Username == "" {
		return Student{}, ErrInvalidInput
	}
	initialPassword, err := generateInitialPassword()
	if err != nil {
		return Student{}, err
	}
	passwordHash, err := service.hasher.Hash(initialPassword)
	if err != nil {
		return Student{}, err
	}
	repo, err := service.personRepository()
	if err != nil {
		return Student{}, err
	}
	student, err := repo.CreateStudentWithUser(ctx, User{
		TenantID:           scope.TenantID,
		Username:           input.Username,
		Phone:              input.Phone,
		Email:              input.Email,
		AvatarURL:          input.AvatarURL,
		DisplayName:        input.DisplayName,
		UserType:           UserTypeStudent,
		Status:             UserStatusActive,
		MustChangePassword: true,
	}, passwordHash, input)
	if err != nil {
		return Student{}, err
	}
	student.InitialPassword = initialPassword
	return student, nil
}

func (service *Service) ListTeachers(ctx context.Context, scope Scope, filter TeacherListFilter) (PageResult[Teacher], error) {
	repo, err := service.personRepository()
	if err != nil {
		return PageResult[Teacher]{}, err
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return repo.ListTeachers(ctx, userLookupTenantID(scope), filter)
}

func (service *Service) CreateTeacher(ctx context.Context, scope Scope, input TeacherInput) (Teacher, error) {
	if !canManageTargetUser(scope, UserTypeTeacher) {
		return Teacher{}, ErrForbidden
	}
	if scope.TenantID <= 0 || input.SchoolID <= 0 || strings.TrimSpace(input.DisplayName) == "" {
		return Teacher{}, ErrInvalidInput
	}
	input = normalizeTeacherInput(input)
	if input.Username == "" {
		return Teacher{}, ErrInvalidInput
	}
	initialPassword, err := generateInitialPassword()
	if err != nil {
		return Teacher{}, err
	}
	passwordHash, err := service.hasher.Hash(initialPassword)
	if err != nil {
		return Teacher{}, err
	}
	repo, err := service.personRepository()
	if err != nil {
		return Teacher{}, err
	}
	teacher, err := repo.CreateTeacherWithUser(ctx, User{
		TenantID:           scope.TenantID,
		Username:           input.Username,
		Phone:              input.Phone,
		Email:              input.Email,
		AvatarURL:          input.AvatarURL,
		DisplayName:        input.DisplayName,
		UserType:           UserTypeTeacher,
		Status:             UserStatusActive,
		MustChangePassword: true,
	}, passwordHash, input)
	if err != nil {
		return Teacher{}, err
	}
	teacher.InitialPassword = initialPassword
	return teacher, nil
}

func (service *Service) personRepository() (PersonRepository, error) {
	if service == nil || service.repo == nil {
		return nil, ErrInvalidInput
	}
	repo, ok := service.repo.(PersonRepository)
	if !ok {
		return nil, ErrInvalidInput
	}
	return repo, nil
}

func normalizeStudentInput(input StudentInput) StudentInput {
	input.Code = strings.TrimSpace(input.Code)
	input.Username = strings.TrimSpace(input.Username)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.Phone = strings.TrimSpace(input.Phone)
	input.Email = strings.TrimSpace(input.Email)
	input.AvatarURL = strings.TrimSpace(input.AvatarURL)
	input.StudentNo = strings.TrimSpace(input.StudentNo)
	if input.Username == "" {
		input.Username = firstNonEmpty(input.StudentNo, input.Code)
	}
	return input
}

func normalizeTeacherInput(input TeacherInput) TeacherInput {
	input.Code = strings.TrimSpace(input.Code)
	input.Username = strings.TrimSpace(input.Username)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.Phone = strings.TrimSpace(input.Phone)
	input.Email = strings.TrimSpace(input.Email)
	input.AvatarURL = strings.TrimSpace(input.AvatarURL)
	input.TeacherNo = strings.TrimSpace(input.TeacherNo)
	if input.Username == "" {
		input.Username = firstNonEmpty(input.TeacherNo, input.Code)
	}
	return input
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func defaultEntityCode(prefix string, id int64) string {
	return fmt.Sprintf("%s%06d", prefix, id)
}

func defaultPersonTime(value *time.Time) time.Time {
	if value != nil {
		return *value
	}
	return time.Now()
}
