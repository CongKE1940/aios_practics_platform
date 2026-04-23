package exam

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

func (service *Service) ListExams(ctx context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	if service == nil || service.repo == nil {
		return PageResult[Exam]{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "exam:publish") {
		return PageResult[Exam]{}, ErrForbidden
	}
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListExams(ctx, scope, filter)
}

func (service *Service) CreateExam(ctx context.Context, scope Scope, input ExamInput) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "exam:publish") {
		return ExamDetail{}, ErrForbidden
	}
	normalized, err := normalizeExamInput(input)
	if err != nil {
		return ExamDetail{}, err
	}
	return service.repo.CreateExam(ctx, scope, normalized)
}

func (service *Service) GetExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "exam:publish") {
		return ExamDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	return service.repo.GetExam(ctx, scope, id)
}

func (service *Service) UpdateExam(ctx context.Context, scope Scope, id int64, input ExamInput) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if !containsPermission(scope.Permissions, "exam:publish") {
		return ExamDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	normalized, err := normalizeExamInput(input)
	if err != nil {
		return ExamDetail{}, err
	}
	return service.repo.UpdateExam(ctx, scope, id, normalized)
}

func normalizeExamInput(input ExamInput) (ExamInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.ExamMode = strings.TrimSpace(strings.ToLower(input.ExamMode))
	if input.Name == "" || input.ExamMode == "" || input.StartTime.IsZero() || input.EndTime.IsZero() {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode != ExamModeFixed && input.ExamMode != ExamModeRandom {
		return ExamInput{}, ErrInvalidInput
	}
	if !input.EndTime.After(input.StartTime) || input.DurationMinutes <= 0 {
		return ExamInput{}, ErrInvalidInput
	}

	input.Targets = append([]ExamTargetInput{}, input.Targets...)
	for index := range input.Targets {
		input.Targets[index].TargetType = strings.TrimSpace(strings.ToLower(input.Targets[index].TargetType))
		if input.Targets[index].TargetID <= 0 {
			return ExamInput{}, ErrInvalidInput
		}
		switch input.Targets[index].TargetType {
		case TargetTypeClass, TargetTypeCourse, TargetTypeUser:
		default:
			return ExamInput{}, ErrInvalidInput
		}
	}

	if input.ExamMode != ExamModeFixed && len(input.FixedQuestions) > 0 {
		return ExamInput{}, ErrInvalidInput
	}
	input.FixedQuestions = append([]ExamFixedQuestionInput{}, input.FixedQuestions...)
	for index := range input.FixedQuestions {
		item := &input.FixedQuestions[index]
		if item.QuestionID <= 0 || item.QuestionVersionID <= 0 || item.DisplayOrder <= 0 || item.Score < 0 {
			return ExamInput{}, ErrInvalidInput
		}
	}

	return input, nil
}
