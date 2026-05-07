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
	"golang.org/x/crypto/bcrypt"

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
	if !created.Data.MustChangePassword || created.Data.InitialPassword == "" {
		t.Fatalf("created user password policy = %+v", created.Data)
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
		"avatar_url":   "https://example.com/avatar.png",
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
	if updated.Data.AvatarURL != "https://example.com/avatar.png" {
		t.Fatalf("avatar_url = %q", updated.Data.AvatarURL)
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

func TestHandler_TeacherAndStudentUseRandomOneTimePasswords(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.roles[3] = RoleSummary{ID: 3, TenantID: 1, Code: "org_operator", Name: "学校/组织协管员", Status: UserStatusActive}

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			UserType:    "school_admin",
			Permissions: []string{"user:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	teacherRec := performUserRequest(router, http.MethodPost, "/api/v1/users", map[string]any{
		"username":     "teacher002",
		"display_name": "李老师",
		"user_type":    "teacher",
		"password":     "SameInit@123",
		"role_ids":     []int64{3},
	}, "token")
	if teacherRec.Code != http.StatusOK {
		t.Fatalf("create teacher status = %d", teacherRec.Code)
	}
	var teacher envelope[User]
	decodeUserBody(t, teacherRec, &teacher)

	studentRec := performUserRequest(router, http.MethodPost, "/api/v1/users", map[string]any{
		"username":     "student001",
		"display_name": "王同学",
		"user_type":    "student",
		"password":     "SameInit@123",
		"role_ids":     []int64{3},
	}, "token")
	if studentRec.Code != http.StatusOK {
		t.Fatalf("create student status = %d", studentRec.Code)
	}
	var student envelope[User]
	decodeUserBody(t, studentRec, &student)

	if !teacher.Data.MustChangePassword || !student.Data.MustChangePassword {
		t.Fatalf("must_change_password teacher=%v student=%v", teacher.Data.MustChangePassword, student.Data.MustChangePassword)
	}
	if teacher.Data.InitialPassword == "" || student.Data.InitialPassword == "" {
		t.Fatalf("initial passwords teacher=%q student=%q", teacher.Data.InitialPassword, student.Data.InitialPassword)
	}
	if teacher.Data.InitialPassword == student.Data.InitialPassword || teacher.Data.InitialPassword == "SameInit@123" || student.Data.InitialPassword == "SameInit@123" {
		t.Fatalf("initial passwords should be random and ignore input, teacher=%q student=%q", teacher.Data.InitialPassword, student.Data.InitialPassword)
	}

	resetRec := performUserRequest(router, http.MethodPost, "/api/v1/users/"+strconv.FormatInt(student.Data.ID, 10)+"/reset-password", nil, "token")
	if resetRec.Code != http.StatusOK {
		t.Fatalf("reset student password status = %d", resetRec.Code)
	}
	var reset envelope[User]
	decodeUserBody(t, resetRec, &reset)
	if !reset.Data.MustChangePassword || reset.Data.InitialPassword == "" || reset.Data.InitialPassword == student.Data.InitialPassword {
		t.Fatalf("reset password policy = %+v", reset.Data)
	}
}

func TestHandler_OrgAdminCanOnlyCreateLowerPrivilegeAdmins(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.roles[3] = RoleSummary{
		ID:              3,
		TenantID:        1,
		Code:            "org_operator",
		Name:            "学校/组织协管员",
		Status:          UserStatusActive,
		PermissionCodes: []string{"user:manage"},
	}
	repo.roles[4] = RoleSummary{
		ID:              4,
		TenantID:        1,
		Code:            "school_admin",
		Name:            "学校/组织管理员",
		Status:          UserStatusActive,
		PermissionCodes: []string{"role:manage", "org:manage", "user:manage"},
	}

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			UserType:    "school_admin",
			Permissions: []string{"user:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	createOperatorRec := performUserRequest(router, http.MethodPost, "/api/v1/users", map[string]any{
		"username":     "operator001",
		"display_name": "协管员",
		"user_type":    "staff",
		"role_ids":     []int64{3},
	}, "token")
	if createOperatorRec.Code != http.StatusOK {
		t.Fatalf("create operator status = %d", createOperatorRec.Code)
	}
	var operator envelope[User]
	decodeUserBody(t, createOperatorRec, &operator)
	if len(operator.Data.RoleIDs) != 1 || operator.Data.RoleIDs[0] != 3 {
		t.Fatalf("operator roles = %+v", operator.Data.RoleIDs)
	}

	createSchoolAdminRec := performUserRequest(router, http.MethodPost, "/api/v1/users", map[string]any{
		"username":     "admin002",
		"display_name": "管理员",
		"user_type":    "school_admin",
		"role_ids":     []int64{4},
	}, "token")
	if createSchoolAdminRec.Code != http.StatusForbidden {
		t.Fatalf("create school admin status = %d", createSchoolAdminRec.Code)
	}

	assignPrivilegedRoleRec := performUserRequest(
		router,
		http.MethodPut,
		"/api/v1/users/"+strconv.FormatInt(operator.Data.ID, 10)+"/roles",
		map[string]any{"role_ids": []int64{4}},
		"token",
	)
	if assignPrivilegedRoleRec.Code != http.StatusForbidden {
		t.Fatalf("assign privileged role status = %d", assignPrivilegedRoleRec.Code)
	}
}

func TestHandler_CurrentUserProfileAndPassword(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	hash, err := bcrypt.GenerateFromPassword([]byte("Old@123456"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword() error = %v", err)
	}

	repo := newMemoryRepository()
	repo.users[1] = User{
		ID:                 1,
		TenantID:           1,
		Username:           "teacher001",
		PasswordHash:       string(hash),
		DisplayName:        "张老师",
		UserType:           "teacher",
		Status:             UserStatusActive,
		MustChangePassword: true,
	}

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:    1,
			TenantID:  1,
			TokenType: auth.TokenTypeAccess,
		},
	})
	router := gin.New()
	handler.RegisterRoutes(router.Group("/api/v1"))

	profileRec := performUserRequest(router, http.MethodGet, "/api/v1/users/me", nil, "token")
	if profileRec.Code != http.StatusOK {
		t.Fatalf("profile status = %d", profileRec.Code)
	}

	updateRec := performUserRequest(router, http.MethodPut, "/api/v1/users/me", map[string]any{
		"display_name": "张老师-个人",
		"phone":        "13900000000",
		"email":        "teacher@example.com",
		"avatar_url":   "https://example.com/me.png",
	}, "token")
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update profile status = %d", updateRec.Code)
	}
	if repo.users[1].AvatarURL != "https://example.com/me.png" {
		t.Fatalf("profile avatar_url = %q", repo.users[1].AvatarURL)
	}

	passwordRec := performUserRequest(router, http.MethodPut, "/api/v1/users/me/password", map[string]any{
		"old_password": "Old@123456",
		"new_password": "New@123456",
	}, "token")
	if passwordRec.Code != http.StatusOK {
		t.Fatalf("password status = %d", passwordRec.Code)
	}
	if repo.users[1].MustChangePassword {
		t.Fatal("MustChangePassword = true")
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
	user.MustChangePassword = current.MustChangePassword
	repo.users[user.ID] = user
	return user, nil
}

func (repo *memoryRepository) UpdateProfile(_ context.Context, user User) (User, error) {
	current, ok := repo.users[user.ID]
	if !ok || current.TenantID != user.TenantID {
		return User{}, ErrNotFound
	}
	current.DisplayName = user.DisplayName
	current.Phone = user.Phone
	current.Email = user.Email
	current.AvatarURL = user.AvatarURL
	repo.users[user.ID] = current
	return current, nil
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

func (repo *memoryRepository) ResetPassword(_ context.Context, tenantID int64, userID int64, passwordHash string, mustChangePassword bool) (User, error) {
	user, ok := repo.users[userID]
	if !ok || user.TenantID != tenantID {
		return User{}, ErrNotFound
	}
	user.PasswordHash = passwordHash
	user.MustChangePassword = mustChangePassword
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
