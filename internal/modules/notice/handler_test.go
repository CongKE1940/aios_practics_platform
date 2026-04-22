package notice

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_NoticeLifecyclePublishesNotifications(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.activeUsers[1] = []int64{1, 2}

	managerHandler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"notice:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	managerRouter := gin.New()
	managerAPI := managerRouter.Group("/api/v1")
	managerHandler.RegisterRoutes(managerAPI)

	createRec := performJSONRequest(managerRouter, http.MethodPost, "/api/v1/notices", map[string]any{
		"title":              "系统维护通知",
		"content":            "周五晚维护",
		"notice_type":        "system",
		"publish_scope_type": "all",
		"publish_scope":      map[string]any{},
		"publish_at":         "2026-04-22T09:00:00+08:00",
		"expire_at":          "2026-04-23T09:00:00+08:00",
	})
	if createRec.Code != http.StatusOK {
		t.Fatalf("create notice status = %d", createRec.Code)
	}

	var created envelope[Notice]
	decodeBody(t, createRec, &created)
	if created.Data.Status != NoticeStatusDraft {
		t.Fatalf("create notice status = %q", created.Data.Status)
	}
	if created.Data.PublisherID != 1 {
		t.Fatalf("create notice publisher_id = %d", created.Data.PublisherID)
	}

	listRec := performAuthorizedRequest(managerRouter, http.MethodGet, "/api/v1/notices?status=draft&notice_type=system", nil, "manager")
	var listed envelope[PageResult[Notice]]
	decodeBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("notice count = %d", len(listed.Data.Items))
	}

	publishRec := performAuthorizedRequest(managerRouter, http.MethodPost, "/api/v1/notices/"+strconv.FormatInt(created.Data.ID, 10)+"/publish", nil, "manager")
	if publishRec.Code != http.StatusOK {
		t.Fatalf("publish notice status = %d", publishRec.Code)
	}
	var published envelope[Notice]
	decodeBody(t, publishRec, &published)
	if published.Data.Status != NoticeStatusPublished {
		t.Fatalf("published status = %q", published.Data.Status)
	}

	userHandler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:    2,
			TenantID:  1,
			TokenType: auth.TokenTypeAccess,
		},
	})
	userRouter := gin.New()
	userAPI := userRouter.Group("/api/v1")
	userHandler.RegisterRoutes(userAPI)

	notificationsRec := performAuthorizedRequest(userRouter, http.MethodGet, "/api/v1/notifications?status=unread&category=notice", nil, "user")
	var notifications envelope[PageResult[Notification]]
	decodeBody(t, notificationsRec, &notifications)
	if len(notifications.Data.Items) != 1 {
		t.Fatalf("notification count = %d", len(notifications.Data.Items))
	}
	if notifications.Data.Items[0].Title != "系统维护通知" {
		t.Fatalf("notification title = %q", notifications.Data.Items[0].Title)
	}

	readRec := performAuthorizedRequest(
		userRouter,
		http.MethodPost,
		"/api/v1/notifications/"+strconv.FormatInt(notifications.Data.Items[0].ID, 10)+"/read",
		nil,
		"user",
	)
	if readRec.Code != http.StatusOK {
		t.Fatalf("mark read status = %d", readRec.Code)
	}

	recallRec := performAuthorizedRequest(managerRouter, http.MethodPost, "/api/v1/notices/"+strconv.FormatInt(created.Data.ID, 10)+"/recall", nil, "manager")
	if recallRec.Code != http.StatusOK {
		t.Fatalf("recall notice status = %d", recallRec.Code)
	}
	var recalled envelope[Notice]
	decodeBody(t, recallRec, &recalled)
	if recalled.Data.Status != NoticeStatusRecalled {
		t.Fatalf("recalled status = %q", recalled.Data.Status)
	}
}

func TestHandler_NoticeEndpointsRequireManagePermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/notices", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandler_NotificationsAreScopedToCurrentUser(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	now := time.Date(2026, 4, 22, 9, 0, 0, 0, time.FixedZone("CST", 8*3600))
	repo.notifications[1] = Notification{
		ID:              1,
		TenantID:        1,
		RecipientUserID: 1,
		Category:        "notice",
		Title:           "系统通知",
		Content:         "内容 A",
		Status:          NotificationStatusUnread,
		CreatedAt:       now,
	}
	repo.notifications[2] = Notification{
		ID:              2,
		TenantID:        1,
		RecipientUserID: 2,
		Category:        "notice",
		Title:           "系统通知",
		Content:         "内容 B",
		Status:          NotificationStatusUnread,
		CreatedAt:       now,
	}
	repo.nextNotificationID = 3

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:    1,
			TenantID:  1,
			TokenType: auth.TokenTypeAccess,
		},
	})
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	listRec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/notifications", nil, "user1")
	var listed envelope[PageResult[Notification]]
	decodeBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("list notifications count = %d", len(listed.Data.Items))
	}
	if listed.Data.Items[0].RecipientUserID != 1 {
		t.Fatalf("recipient_user_id = %d", listed.Data.Items[0].RecipientUserID)
	}

	readOtherRec := performAuthorizedRequest(router, http.MethodPost, "/api/v1/notifications/2/read", nil, "user1")
	if readOtherRec.Code != http.StatusNotFound {
		t.Fatalf("read other notification status = %d", readOtherRec.Code)
	}
}

type envelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type memoryRepository struct {
	nextNoticeID       int64
	nextNotificationID int64
	notices            map[int64]Notice
	notifications      map[int64]Notification
	activeUsers        map[int64][]int64
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextNoticeID:       1,
		nextNotificationID: 1,
		notices:            map[int64]Notice{},
		notifications:      map[int64]Notification{},
		activeUsers:        map[int64][]int64{},
	}
}

func (repo *memoryRepository) ListNotices(_ context.Context, tenantID int64, filter NoticeListFilter) (PageResult[Notice], error) {
	items := make([]Notice, 0)
	for _, notice := range repo.notices {
		if notice.TenantID != tenantID {
			continue
		}
		if filter.Status != "" && notice.Status != filter.Status {
			continue
		}
		if filter.NoticeType != "" && notice.NoticeType != filter.NoticeType {
			continue
		}
		items = append(items, notice)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetNotice(_ context.Context, tenantID int64, id int64) (Notice, error) {
	notice, ok := repo.notices[id]
	if !ok || notice.TenantID != tenantID {
		return Notice{}, ErrNotFound
	}
	return notice, nil
}

func (repo *memoryRepository) CreateNotice(_ context.Context, notice Notice) (Notice, error) {
	notice.ID = repo.nextNoticeID
	repo.nextNoticeID++
	notice.Status = defaultNoticeStatus(notice.Status)
	repo.notices[notice.ID] = notice
	return notice, nil
}

func (repo *memoryRepository) UpdateNotice(_ context.Context, notice Notice) (Notice, error) {
	current, ok := repo.notices[notice.ID]
	if !ok || current.TenantID != notice.TenantID {
		return Notice{}, ErrNotFound
	}
	notice.Status = current.Status
	notice.PublisherID = current.PublisherID
	repo.notices[notice.ID] = notice
	return notice, nil
}

func (repo *memoryRepository) PublishNotice(_ context.Context, tenantID int64, id int64) (Notice, error) {
	notice, ok := repo.notices[id]
	if !ok || notice.TenantID != tenantID {
		return Notice{}, ErrNotFound
	}
	if notice.Status != NoticeStatusPublished {
		notice.Status = NoticeStatusPublished
		repo.notices[id] = notice
		for _, userID := range repo.activeUsers[tenantID] {
			repo.notifications[repo.nextNotificationID] = Notification{
				ID:              repo.nextNotificationID,
				TenantID:        tenantID,
				RecipientUserID: userID,
				Category:        NotificationCategoryNotice,
				Title:           notice.Title,
				Content:         notice.Content,
				SourceType:      "notice",
				SourceID:        &notice.ID,
				Status:          NotificationStatusUnread,
				CreatedAt:       notice.PublishAt,
			}
			repo.nextNotificationID++
		}
	}
	return repo.notices[id], nil
}

func (repo *memoryRepository) RecallNotice(_ context.Context, tenantID int64, id int64) (Notice, error) {
	notice, ok := repo.notices[id]
	if !ok || notice.TenantID != tenantID {
		return Notice{}, ErrNotFound
	}
	notice.Status = NoticeStatusRecalled
	repo.notices[id] = notice
	return notice, nil
}

func (repo *memoryRepository) ListNotifications(_ context.Context, tenantID int64, recipientUserID int64, filter NotificationListFilter) (PageResult[Notification], error) {
	items := make([]Notification, 0)
	for _, notification := range repo.notifications {
		if notification.TenantID != tenantID || notification.RecipientUserID != recipientUserID {
			continue
		}
		if filter.Status != "" && notification.Status != filter.Status {
			continue
		}
		if filter.Category != "" && notification.Category != filter.Category {
			continue
		}
		items = append(items, notification)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) MarkNotificationRead(_ context.Context, tenantID int64, recipientUserID int64, id int64) (Notification, error) {
	notification, ok := repo.notifications[id]
	if !ok || notification.TenantID != tenantID || notification.RecipientUserID != recipientUserID {
		return Notification{}, ErrNotFound
	}
	if notification.Status != NotificationStatusRead {
		now := time.Now()
		notification.Status = NotificationStatusRead
		notification.ReadAt = &now
		repo.notifications[id] = notification
	}
	return repo.notifications[id], nil
}

func performJSONRequest(router http.Handler, method string, path string, body any) *httptest.ResponseRecorder {
	return performAuthorizedRequest(router, method, path, body, "token")
}

func performAuthorizedRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var requestBody []byte
	if body != nil {
		var err error
		requestBody, err = json.Marshal(body)
		if err != nil {
			panic(err)
		}
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}

func pageOf[T any](items []T, page int, pageSize int) PageResult[T] {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	start := (page - 1) * pageSize
	if start > len(items) {
		start = len(items)
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return PageResult[T]{
		Items:    items[start:end],
		Page:     page,
		PageSize: pageSize,
		Total:    len(items),
	}
}

func defaultNoticeStatus(status string) string {
	if status == "" {
		return NoticeStatusDraft
	}
	return status
}
