package rbac

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

func TestAdminHandler_RoleLifecycleAndPermissionAssignment(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAdminRepository()
	repo.permissions[1] = Permission{ID: 1, Code: "user:manage", Module: "user", ActionName: "manage", ResourceType: "user", Name: "用户管理"}
	repo.permissions[2] = Permission{ID: 2, Code: "role:manage", Module: "role", ActionName: "manage", ResourceType: "role", Name: "角色管理"}
	repo.nextPermissionID = 3

	handler := NewAdminHandler(NewAdminService(repo), fakeAdminTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			UserType:    "sys_admin",
			Permissions: []string{"role:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterAdminRoutes(api)

	createRec := performRBACRequest(router, http.MethodPost, "/api/v1/roles", map[string]any{
		"code":            "school_reviewer",
		"name":            "学校审核员",
		"role_type":       "custom",
		"data_scope_type": "subtree",
		"remark":          "可审核题目质疑",
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create role status = %d", createRec.Code)
	}

	var created envelope[Role]
	decodeRBACBody(t, createRec, &created)
	if created.Data.TenantID != 1 {
		t.Fatalf("role tenant_id = %d", created.Data.TenantID)
	}
	if created.Data.Code != "school_reviewer" {
		t.Fatalf("role code = %q", created.Data.Code)
	}

	listRec := performRBACRequest(router, http.MethodGet, "/api/v1/roles?status=active", nil, "token")
	var listed envelope[PageResult[Role]]
	decodeRBACBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("role count = %d", len(listed.Data.Items))
	}

	assignRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/"+strconv.FormatInt(created.Data.ID, 10)+"/permissions",
		map[string]any{"permission_ids": []int64{1, 2}},
		"token",
	)
	if assignRec.Code != http.StatusOK {
		t.Fatalf("assign permissions status = %d", assignRec.Code)
	}
	var assigned envelope[Role]
	decodeRBACBody(t, assignRec, &assigned)
	if len(assigned.Data.PermissionIDs) != 2 {
		t.Fatalf("permission_ids = %+v", assigned.Data.PermissionIDs)
	}

	updateRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/"+strconv.FormatInt(created.Data.ID, 10),
		map[string]any{
			"code":            "school_reviewer",
			"name":            "学校复核员",
			"role_type":       "custom",
			"data_scope_type": "subtree",
			"remark":          "更新备注",
		},
		"token",
	)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update role status = %d", updateRec.Code)
	}
	var updated envelope[Role]
	decodeRBACBody(t, updateRec, &updated)
	if updated.Data.Name != "学校复核员" {
		t.Fatalf("role name = %q", updated.Data.Name)
	}

	permissionsRec := performRBACRequest(router, http.MethodGet, "/api/v1/permissions?module=user", nil, "token")
	var permissions envelope[PageResult[Permission]]
	decodeRBACBody(t, permissionsRec, &permissions)
	if len(permissions.Data.Items) != 1 {
		t.Fatalf("permission count = %d", len(permissions.Data.Items))
	}
	if permissions.Data.Items[0].Code != "user:manage" {
		t.Fatalf("permission code = %q", permissions.Data.Items[0].Code)
	}
}

func TestAdminHandler_TenantAdminCanOnlyGrantOwnNonPermissionManagementPermissions(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAdminRepository()
	repo.roles[1] = Role{
		ID:            1,
		TenantID:      1,
		Code:          "org_operator",
		Name:          "学校/组织协管员",
		RoleType:      "custom",
		DataScopeType: "tenant",
		Status:        RoleStatusActive,
	}
	repo.roles[2] = Role{
		ID:            2,
		TenantID:      1,
		Code:          "school_admin",
		Name:          "学校/组织管理员",
		RoleType:      "builtin",
		DataScopeType: "tenant",
		Status:        RoleStatusActive,
	}
	repo.roles[3] = Role{
		ID:            3,
		TenantID:      2,
		Code:          "other_tenant_operator",
		Name:          "其他租户角色",
		RoleType:      "custom",
		DataScopeType: "tenant",
		Status:        RoleStatusActive,
	}
	repo.permissions[1] = Permission{ID: 1, Code: "user:manage", Module: "user", ActionName: "manage", ResourceType: "user", Name: "用户管理"}
	repo.permissions[2] = Permission{ID: 2, Code: "role:manage", Module: "role", ActionName: "manage", ResourceType: "role", Name: "角色管理"}
	repo.permissions[3] = Permission{ID: 3, Code: "tenant:manage", Module: "tenant", ActionName: "manage", ResourceType: "tenant", Name: "租户管理"}
	repo.permissions[4] = Permission{ID: 4, Code: "notice:manage", Module: "notice", ActionName: "manage", ResourceType: "notice", Name: "公告管理"}

	handler := NewAdminHandler(NewAdminService(repo), fakeAdminTokenParser{
		claims: auth.AccessClaims{
			UserID:      10,
			TenantID:    1,
			UserType:    "tenant_admin",
			Permissions: []string{"tenant:manage", "user:manage", "role:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterAdminRoutes(api)

	listRec := performRBACRequest(router, http.MethodGet, "/api/v1/roles?status=active", nil, "token")
	if listRec.Code != http.StatusOK {
		t.Fatalf("list tenant roles status = %d", listRec.Code)
	}
	var listed envelope[PageResult[Role]]
	decodeRBACBody(t, listRec, &listed)
	if listed.Data.Total != 2 {
		t.Fatalf("tenant role count = %d", listed.Data.Total)
	}
	for _, role := range listed.Data.Items {
		if role.TenantID != 1 {
			t.Fatalf("listed cross-tenant role: %+v", role)
		}
	}

	allowedRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/1/permissions",
		map[string]any{"permission_ids": []int64{1}},
		"token",
	)
	if allowedRec.Code != http.StatusOK {
		t.Fatalf("assign allowed permissions status = %d", allowedRec.Code)
	}

	permissionManagementRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/1/permissions",
		map[string]any{"permission_ids": []int64{1, 2}},
		"token",
	)
	if permissionManagementRec.Code != http.StatusForbidden {
		t.Fatalf("assign permission management permissions status = %d", permissionManagementRec.Code)
	}

	tenantManageRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/1/permissions",
		map[string]any{"permission_ids": []int64{3}},
		"token",
	)
	if tenantManageRec.Code != http.StatusForbidden {
		t.Fatalf("assign tenant manage permission status = %d", tenantManageRec.Code)
	}

	exceedSelfRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/1/permissions",
		map[string]any{"permission_ids": []int64{1, 4}},
		"token",
	)
	if exceedSelfRec.Code != http.StatusForbidden {
		t.Fatalf("assign permissions beyond self status = %d", exceedSelfRec.Code)
	}

	builtinRoleRec := performRBACRequest(
		router,
		http.MethodPut,
		"/api/v1/roles/2/permissions",
		map[string]any{"permission_ids": []int64{1}},
		"token",
	)
	if builtinRoleRec.Code != http.StatusForbidden {
		t.Fatalf("assign builtin role permissions status = %d", builtinRoleRec.Code)
	}

	createBuiltinRec := performRBACRequest(router, http.MethodPost, "/api/v1/roles", map[string]any{
		"code":            "tenant_admin",
		"name":            "租户管理员",
		"role_type":       "custom",
		"data_scope_type": "tenant",
	}, "token")
	if createBuiltinRec.Code != http.StatusForbidden {
		t.Fatalf("create privileged role status = %d", createBuiltinRec.Code)
	}
}

func TestAdminHandler_RejectsRoleManagementWithoutPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewAdminHandler(NewAdminService(newMemoryAdminRepository()), fakeAdminTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"user:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterAdminRoutes(api)

	rec := performRBACRequest(router, http.MethodPost, "/api/v1/roles", map[string]any{
		"code":            "school_reviewer",
		"name":            "学校审核员",
		"role_type":       "custom",
		"data_scope_type": "subtree",
	}, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

type envelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeAdminTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeAdminTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type memoryAdminRepository struct {
	nextRoleID       int64
	nextPermissionID int64
	roles            map[int64]Role
	permissions      map[int64]Permission
	rolePermissions  map[int64][]int64
}

func newMemoryAdminRepository() *memoryAdminRepository {
	return &memoryAdminRepository{
		nextRoleID:       1,
		nextPermissionID: 1,
		roles:            map[int64]Role{},
		permissions:      map[int64]Permission{},
		rolePermissions:  map[int64][]int64{},
	}
}

func (repo *memoryAdminRepository) ListRoles(_ context.Context, tenantID int64, filter RoleListFilter) (PageResult[Role], error) {
	items := make([]Role, 0)
	for _, role := range repo.roles {
		if tenantID > 0 && role.TenantID != tenantID {
			continue
		}
		if filter.Status != "" && role.Status != filter.Status {
			continue
		}
		role.PermissionIDs = append([]int64{}, repo.rolePermissions[role.ID]...)
		items = append(items, role)
	}
	return rbacPageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryAdminRepository) GetRole(_ context.Context, tenantID int64, id int64) (Role, error) {
	role, ok := repo.roles[id]
	if !ok || (tenantID > 0 && role.TenantID != tenantID) {
		return Role{}, ErrNotFound
	}
	role.PermissionIDs = append([]int64{}, repo.rolePermissions[id]...)
	return role, nil
}

func (repo *memoryAdminRepository) CreateRole(_ context.Context, role Role) (Role, error) {
	role.ID = repo.nextRoleID
	repo.nextRoleID++
	if role.Status == "" {
		role.Status = RoleStatusActive
	}
	repo.roles[role.ID] = role
	return role, nil
}

func (repo *memoryAdminRepository) UpdateRole(_ context.Context, role Role) (Role, error) {
	current, ok := repo.roles[role.ID]
	if !ok || current.TenantID != role.TenantID {
		return Role{}, ErrNotFound
	}
	role.Status = current.Status
	repo.roles[role.ID] = role
	role.PermissionIDs = append([]int64{}, repo.rolePermissions[role.ID]...)
	return role, nil
}

func (repo *memoryAdminRepository) ListPermissions(_ context.Context, filter PermissionListFilter) (PageResult[Permission], error) {
	items := make([]Permission, 0)
	for _, permission := range repo.permissions {
		if filter.Module != "" && permission.Module != filter.Module {
			continue
		}
		items = append(items, permission)
	}
	return rbacPageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryAdminRepository) AssignRolePermissions(_ context.Context, tenantID int64, roleID int64, permissionIDs []int64) (Role, error) {
	role, ok := repo.roles[roleID]
	if !ok || role.TenantID != tenantID {
		return Role{}, ErrNotFound
	}
	repo.rolePermissions[roleID] = append([]int64{}, permissionIDs...)
	role.PermissionIDs = append([]int64{}, permissionIDs...)
	return role, nil
}

func performRBACRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodeRBACBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}

func rbacPageOf[T any](items []T, page int, pageSize int) PageResult[T] {
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
