package exam

import "context"

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
	return service.repo.ListExams(ctx, scope, filter)
}
