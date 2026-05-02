package notice

import "context"

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListNotices(ctx context.Context, scope Scope, filter NoticeListFilter) (PageResult[Notice], error) {
	return service.repo.ListNotices(ctx, readTenantID(scope), normalizeNoticeListFilter(filter))
}

func (service *Service) GetNotice(ctx context.Context, scope Scope, id int64) (Notice, error) {
	return service.repo.GetNotice(ctx, readTenantID(scope), id)
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
	current, err := service.repo.GetNotice(ctx, readTenantID(scope), id)
	if err != nil {
		return Notice{}, err
	}
	notice.ID = current.ID
	notice.TenantID = current.TenantID
	notice.PublisherID = current.PublisherID
	notice.Status = current.Status
	return service.repo.UpdateNotice(ctx, notice)
}

func (service *Service) PublishNotice(ctx context.Context, scope Scope, id int64) (Notice, error) {
	current, err := service.repo.GetNotice(ctx, readTenantID(scope), id)
	if err != nil {
		return Notice{}, err
	}
	return service.repo.PublishNotice(ctx, current.TenantID, id)
}

func (service *Service) RecallNotice(ctx context.Context, scope Scope, id int64) (Notice, error) {
	current, err := service.repo.GetNotice(ctx, readTenantID(scope), id)
	if err != nil {
		return Notice{}, err
	}
	return service.repo.RecallNotice(ctx, current.TenantID, id)
}

func (service *Service) ListNotifications(ctx context.Context, scope Scope, filter NotificationListFilter) (PageResult[Notification], error) {
	return service.repo.ListNotifications(ctx, scope.TenantID, scope.UserID, normalizeNotificationListFilter(filter))
}

func (service *Service) MarkNotificationRead(ctx context.Context, scope Scope, id int64) (Notification, error) {
	return service.repo.MarkNotificationRead(ctx, scope.TenantID, scope.UserID, id)
}

func (service *Service) ListAnnouncements(ctx context.Context, scope Scope, filter AnnouncementListFilter) (PageResult[Notice], error) {
	return service.repo.ListAnnouncements(ctx, scope.TenantID, scope.UserID, normalizeAnnouncementListFilter(filter))
}

func (service *Service) MarkAnnouncementRead(ctx context.Context, scope Scope, id int64) (Notice, error) {
	return service.repo.MarkAnnouncementRead(ctx, scope.TenantID, scope.UserID, id)
}

func (service *Service) CreateNotification(ctx context.Context, scope Scope, input NotificationInput) (NotificationSendResult, error) {
	if !canSendNotification(scope, input) {
		return NotificationSendResult{}, ErrForbidden
	}
	if input.Title == "" || input.Content == "" {
		return NotificationSendResult{}, ErrInvalidInput
	}
	if input.TargetScope == nil {
		input.TargetScope = map[string]any{}
	}
	if !isAllowedNotificationTarget(input.TargetType) {
		return NotificationSendResult{}, ErrInvalidInput
	}
	return service.repo.CreateNotification(ctx, scope, input)
}

func noticeFromInput(scope Scope, input NoticeInput) (Notice, error) {
	if input.PublishAt == nil || input.PublishAt.IsZero() {
		return Notice{}, ErrInvalidInput
	}
	if input.ExpireAt != nil && input.ExpireAt.Before(*input.PublishAt) {
		return Notice{}, ErrInvalidInput
	}
	if !isAllowedNoticeScope(input.PublishScopeType) {
		return Notice{}, ErrInvalidInput
	}
	if input.PublishScope == nil {
		return Notice{}, ErrInvalidInput
	}
	tenantID, err := resolveTargetTenantID(scope, input.TargetTenantID, input.PublishScope)
	if err != nil {
		return Notice{}, err
	}

	return Notice{
		TenantID:         tenantID,
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

func normalizeAnnouncementListFilter(filter AnnouncementListFilter) AnnouncementListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" {
		return 0
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" {
			return 0
		}
	}
	return scope.TenantID
}

func resolveTargetTenantID(scope Scope, inputTargetTenantID int64, publishScope map[string]any) (int64, error) {
	targetTenantID := inputTargetTenantID
	if targetTenantID <= 0 {
		targetTenantID = scopeTenantIDFromMap(publishScope)
	}
	if targetTenantID <= 0 {
		targetTenantID = scope.TenantID
	}
	if targetTenantID <= 0 {
		return 0, ErrInvalidInput
	}
	if canManageAnyTenant(scope) {
		return targetTenantID, nil
	}
	if targetTenantID != scope.TenantID {
		return 0, ErrForbidden
	}
	return targetTenantID, nil
}

func canManageAnyTenant(scope Scope) bool {
	if scope.UserType == "sys_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" {
			return true
		}
	}
	return false
}

func canSendNotification(scope Scope, input NotificationInput) bool {
	if input.TargetType == NotificationTargetSingleUser {
		return true
	}
	if isManager(scope) {
		return true
	}
	return scope.UserType == "teacher" && input.TargetType == NotificationTargetClassIDs
}

func isManager(scope Scope) bool {
	if scope.UserType == "sys_admin" || scope.UserType == "tenant_admin" || scope.UserType == "school_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" || permission == "tenant:manage" || permission == "notice:manage" {
			return true
		}
	}
	return false
}

func isAllowedNoticeScope(scopeType string) bool {
	switch scopeType {
	case NoticeScopeAll,
		NoticeScopeUserIDs,
		NoticeScopeUserTypes,
		NoticeScopeExcludeUserTypes,
		NoticeScopeTenantAdmins,
		NoticeScopeAllAdmins,
		NoticeScopeNonStudents,
		NoticeScopeClassIDs:
		return true
	default:
		return false
	}
}

func isAllowedNotificationTarget(targetType string) bool {
	switch targetType {
	case NotificationTargetSingleUser,
		NotificationTargetAll,
		NotificationTargetUserTypes,
		NotificationTargetExcludeTypes,
		NotificationTargetTenantAdmins,
		NotificationTargetAllAdmins,
		NotificationTargetNonStudents,
		NotificationTargetClassIDs:
		return true
	default:
		return false
	}
}

func scopeTenantIDFromMap(scope map[string]any) int64 {
	if scope == nil {
		return 0
	}
	switch value := scope["target_tenant_id"].(type) {
	case float64:
		return int64(value)
	case int64:
		return value
	case int:
		return int64(value)
	default:
		return 0
	}
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
