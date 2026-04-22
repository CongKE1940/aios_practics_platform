package usermgmt

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_UserLifecycleAndRoleAssignment(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.roles[3] = RoleSummary{ID: 3, TenantID: 1, Code: "school_reviewer", Name: "学校审核员", Status: UserStatusActive}

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"user:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	createRec := performUserRequest(router, http.MethodPost, "/api/v1/users", map[string]any{
		"username":     "teacher001",
		"display_name": "张老师",
		"user_type":    "teacher",
		"phone":        "13800000000",
		"email":        "teacher001@example.com",
		"password":     "Init@123456",
		"role_ids":     []int64{3},
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create user status = %d", createRec.Code)
	}
	var created envelope[User]
	decodeUserBody(t, createRec, &created)
	if created.Data.TenantID != 1 {
		t.Fatalf("tenant_id = %d", created.Data.TenantID)
	}
	if len(created.Data.RoleIDs) != 1 || created.Data.RoleIDs[0] != 3 {
		t.Fatalf("role_ids = %+v", created.Data.RoleIDs)
	}

	listRec := performUserRequest(router, http.MethodGet, "/api/v1/users?user_type=teacher&keyword=张", nil, "token")
	var listed envelope[PageResult[User]]
	decodeUserBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("user count = %d", len(listed.Data.Items))
	}

	detailRec := performUserRequest(router, http.MethodGet, "/api/v1/users/"+strconv.FormatInt(created.Data.ID, 10), nil, "token")
	if detailRec.Code != http.StatusOK {
		t.Fatalf("detail status = %d", detailRec.Code)
	}

	updateRec := performUserRequest(router, http.MethodPut, "/api/v1/users/"+strconv.FormatInt(created.Data.ID, 10), map[string]any{
		"username":     "teacher001",
		"display_name": "张老师-更新",
		"user_type":    "teacher",
		"phone":        "13800000001",
		"email":        "teacher001@example.com",
		"role_ids":     []int64{3},
	}, "token")
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update status = %d", updateRec.Code)
	}
	var updated envelope[User]
	decodeUserBody(t, updateRec, &updated)
	if updated.Data.DisplayName != "张老师-更新" {
		t.Fatalf("display_name = %q", updated.Data.DisplayName)
	}

	assignRec := performUserRequest(
		router,
		http.MethodPut,
		"/api/v1/users/"+strconv.FormatInt(created.Data.ID, 10)+"/roles",
		map[string]any{"role_ids": []int64{3}},
		"token",
	)
	if assignRec.Code != http.StatusOK {
		t.Fatalf("assign roles status = %d", assignRec.Code)
	}

	disableRec := performUserRequest(router, http.MethodPost, "/api/v1/users/"+strconv.FormatInt(created.Data.ID, 10)+"/disable", nil, "token")
	if disableRec.Code != http.StatusOK {
		t.Fatalf("disable status = %d", disableRec.Code)
	}
	var disabled envelope[User]
	decodeUserBody(t, disableRec, &disabled)
	if disabled.Data.Status != UserStatusDisabled {
		t.Fatalf("status = %q", disabled.Data.Status)
	}
}

func TestHandler_RejectsUserManagementWithoutPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository()), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"role:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performUserRequest(router, http.MethodGet, "/api/v1/users", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
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
	nextUserID int64
	users      map[int64]User
	roles      map[int64]RoleSummary
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextUserID: 1,
		users:      map[int64]User{},
		roles:      map[int64]RoleSummary{},
	}
}

func (repo *memoryRepository) ListUsers(_ context.Context, tenantID int64, filter UserListFilter) (PageResult[User], error) {
	items := make([]User, 0)
	for _, user := range repo.users {
		if user.TenantID != tenantID {
			continue
		}
		if filter.UserType != "" && user.UserType != filter.UserType {
			continue
		}
		if filter.Keyword != "" && !containsKeyword(user.Username, user.DisplayName, user.Phone, user.Email, filter.Keyword) {
			continue
		}
		items = append(items, user)
	}
	return userPageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetUser(_ context.Context, tenantID int64, id int64) (User, error) {
	user, ok := repo.users[id]
	if !ok || user.TenantID != tenantID {
		return User{}, ErrNotFound
	}
	return user, nil
}

func (repo *memoryRepository) CreateUser(_ context.Context, user User, _ string) (User, error) {
	user.ID = repo.nextUserID
	repo.nextUserID++
	if user.Status == "" {
		user.Status = UserStatusActive
	}
	repo.users[user.ID] = user
	return user, nil
}

func (repo *memoryRepository) UpdateUser(_ context.Context, user User) (User, error) {
	current, ok := repo.users[user.ID]
	if !ok || current.TenantID != user.TenantID {
		return User{}, ErrNotFound
	}
	user.Status = current.Status
	user.PasswordHash = current.PasswordHash
	repo.users[user.ID] = user
	return user, nil
}

func (repo *memoryRepository) AssignRoles(_ context.Context, tenantID int64, userID int64, roleIDs []int64) (User, error) {
	user, ok := repo.users[userID]
	if !ok || user.TenantID != tenantID {
		return User{}, ErrNotFound
	}
	user.RoleIDs = append([]int64{}, roleIDs...)
	repo.users[userID] = user
	return user, nil
}

func (repo *memoryRepository) DisableUser(_ context.Context, tenantID int64, userID int64) (User, error) {
	user, ok := repo.users[userID]
	if !ok || user.TenantID != tenantID {
		return User{}, ErrNotFound
	}
	user.Status = UserStatusDisabled
	repo.users[userID] = user
	return user, nil
}

func (repo *memoryRepository) ResetPassword(_ context.Context, tenantID int64, userID int64, passwordHash string) (User, error) {
	user, ok := repo.users[userID]
	if !ok || user.TenantID != tenantID {
		return User{}, ErrNotFound
	}
	user.PasswordHash = passwordHash
	repo.users[userID] = user
	return user, nil
}

func (repo *memoryRepository) ListRoles(_ context.Context, tenantID int64) ([]RoleSummary, error) {
	items := make([]RoleSummary, 0)
	for _, role := range repo.roles {
		if role.TenantID != tenantID {
			continue
		}
		items = append(items, role)
	}
	return items, nil
}

func performUserRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var requestBody []byte
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		requestBody = payload
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeUserBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}

func containsKeyword(values ...string) bool {
	if len(values) < 2 {
		return false
	}
	keyword := values[len(values)-1]
	for _, value := range values[:len(values)-1] {
		if value != "" && bytes.Contains([]byte(value), []byte(keyword)) {
			return true
		}
	}
	return false
}

func userPageOf[T any](items []T, page int, pageSize int) PageResult[T] {
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
