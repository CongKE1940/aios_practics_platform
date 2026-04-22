package notice

import "context"

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListNotices(ctx context.Context, scope Scope, filter NoticeListFilter) (PageResult[Notice], error) {
	return service.repo.ListNotices(ctx, scope.TenantID, normalizeNoticeListFilter(filter))
}

func (service *Service) GetNotice(ctx context.Context, scope Scope, id int64) (Notice, error) {
	return service.repo.GetNotice(ctx, scope.TenantID, id)
}

func (service *Service) CreateNotice(ctx context.Context, scope Scope, input NoticeInput) (Notice, error) {
	notice, err := noticeFromInput(scope, input)
	if err != nil {
		return Notice{}, err
	}
	notice.Status = NoticeStatusDraft
	return service.repo.CreateNotice(ctx, notice)
}

func (service *Service) UpdateNotice(ctx context.Context, scope Scope, id int64, input NoticeInput) (Notice, error) {
	notice, err := noticeFromInput(scope, input)
	if err != nil {
		return Notice{}, err
	}
	current, err := service.repo.GetNotice(ctx, scope.TenantID, id)
	if err != nil {
		return Notice{}, err
	}
	notice.ID = current.ID
	notice.PublisherID = current.PublisherID
	notice.Status = current.Status
	return service.repo.UpdateNotice(ctx, notice)
}

func (service *Service) PublishNotice(ctx context.Context, scope Scope, id int64) (Notice, error) {
	return service.repo.PublishNotice(ctx, scope.TenantID, id)
}

func (service *Service) RecallNotice(ctx context.Context, scope Scope, id int64) (Notice, error) {
	return service.repo.RecallNotice(ctx, scope.TenantID, id)
}

func (service *Service) ListNotifications(ctx context.Context, scope Scope, filter NotificationListFilter) (PageResult[Notification], error) {
	return service.repo.ListNotifications(ctx, scope.TenantID, scope.UserID, normalizeNotificationListFilter(filter))
}

func (service *Service) MarkNotificationRead(ctx context.Context, scope Scope, id int64) (Notification, error) {
	return service.repo.MarkNotificationRead(ctx, scope.TenantID, scope.UserID, id)
}

func noticeFromInput(scope Scope, input NoticeInput) (Notice, error) {
	if input.PublishAt == nil || input.PublishAt.IsZero() {
		return Notice{}, ErrInvalidInput
	}
	if input.ExpireAt != nil && input.ExpireAt.Before(*input.PublishAt) {
		return Notice{}, ErrInvalidInput
	}
	if input.PublishScopeType != "all" && input.PublishScopeType != "user_ids" {
		return Notice{}, ErrInvalidInput
	}
	if input.PublishScope == nil {
		return Notice{}, ErrInvalidInput
	}

	return Notice{
		TenantID:         scope.TenantID,
		Title:            input.Title,
		Content:          input.Content,
		NoticeType:       input.NoticeType,
		PublisherID:      scope.UserID,
		PublishScopeType: input.PublishScopeType,
		PublishScope:     input.PublishScope,
		PublishAt:        *input.PublishAt,
		ExpireAt:         input.ExpireAt,
	}, nil
}

func normalizeNoticeListFilter(filter NoticeListFilter) NoticeListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeNotificationListFilter(filter NotificationListFilter) NotificationListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
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
