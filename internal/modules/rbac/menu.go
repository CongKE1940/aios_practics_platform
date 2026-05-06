package rbac

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
	"aios_practice_platform/internal/modules/auth"
)

type MenuItem struct {
	ID       int64      `json:"id"`
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	Children []MenuItem `json:"children"`
}

type TokenParser interface {
	ParseToken(ctx context.Context, token string, tokenType string) (auth.AccessClaims, error)
}

type MenuHandler struct {
	parser TokenParser
}

func NewMenuHandler(parser TokenParser) *MenuHandler {
	return &MenuHandler{parser: parser}
}

func (handler *MenuHandler) RegisterRoutes(router gin.IRouter) {
	router.GET("/menus", handler.listMenus)
}

func (handler *MenuHandler) listMenus(ctx *gin.Context) {
	token := bearerToken(ctx.GetHeader("Authorization"))
	if token == "" {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return
	}

	claims, err := handler.parser.ParseToken(ctx.Request.Context(), token, auth.TokenTypeAccess)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return
	}

	menus := BuildMenusForClaims(ctx.Query("app_type"), claims)
	ctx.JSON(http.StatusOK, response.Success(menus, ctx.GetHeader("X-Request-Id")))
}

func BuildMenus(appType string, permissions []string) []MenuItem {
	return buildMenus(appType, "", permissions)
}

func BuildMenusForClaims(appType string, claims auth.AccessClaims) []MenuItem {
	permissions := append([]string{}, claims.Permissions...)
	if claims.UserType == "sys_admin" && !containsAnyPermission(permissions, "system:manage") {
		permissions = append(permissions, "system:manage")
	}
	return buildMenus(appType, claims.UserType, permissions)
}

func buildMenus(appType string, userType string, permissions []string) []MenuItem {
	var menus []menuDef
	switch appType {
	case "", "admin":
		menus = adminMenus
	case "user":
		return buildUserMenus(userType, permissions)
	default:
		return []MenuItem{}
	}

	return filterMenus(menus, userType, permissions)
}

type menuDef struct {
	id                  int64
	name                string
	path                string
	requiredPermissions []string
	requiredUserTypes   []string
	children            []menuDef
}

var adminMenus = []menuDef{
	{
		id:   1,
		name: "工作台",
		path: "/admin/workbench",
	},
	{
		id:                  2,
		name:                "组织管理",
		path:                "/admin/org",
		requiredPermissions: []string{"org:manage"},
		children: []menuDef{
			{id: 21, name: "学校管理", path: "/admin/org/schools", requiredPermissions: []string{"org:manage"}},
			{id: 22, name: "年级管理", path: "/admin/org/grades", requiredPermissions: []string{"org:manage"}},
			{id: 23, name: "班级管理", path: "/admin/org/classes", requiredPermissions: []string{"org:manage"}},
		},
	},
	{
		id:                  3,
		name:                "课程管理",
		path:                "/admin/courses",
		requiredPermissions: []string{"org:manage"},
	},
	{
		id:   4,
		name: "系统管理",
		path: "/admin/system",
		children: []menuDef{
			{id: 41, name: "用户管理", path: "/admin/users", requiredPermissions: []string{"user:manage"}},
			{id: 42, name: "字典管理", path: "/admin/dictionaries", requiredPermissions: []string{"role:manage"}},
			{id: 43, name: "公告通知", path: "/admin/notices", requiredPermissions: []string{"notice:manage"}},
			{id: 44, name: "题库管理", path: "/admin/question-banks", requiredPermissions: []string{"question_bank:manage"}},
			{id: 45, name: "题目管理", path: "/admin/questions", requiredPermissions: []string{"question:manage"}},
			{id: 46, name: "导入中心", path: "/admin/imports", requiredPermissions: []string{"import:manage"}},
			{id: 47, name: "考试管理", path: "/admin/exams", requiredPermissions: []string{"exam:manage"}},
			{id: 48, name: "试卷管理", path: "/admin/exam-papers", requiredPermissions: []string{"exam:manage"}},
			{id: 49, name: "试卷组卷", path: "/admin/exams/assembly", requiredPermissions: []string{"exam:manage"}},
			{id: 50, name: "质疑处理", path: "/admin/challenges", requiredPermissions: []string{"question:manage"}},
			{id: 51, name: "数据看板", path: "/admin/analytics", requiredPermissions: []string{"analytics:view"}},
			{id: 52, name: "快照历史", path: "/admin/history", requiredPermissions: []string{"audit:view"}},
		},
	},
	{
		id:   5,
		name: "配置中心",
		path: "/admin/config",
		children: []menuDef{
			{id: 53, name: "系统配置", path: "/admin/system/config", requiredPermissions: []string{"system:manage"}},
			{id: 54, name: "租户角色配置", path: "/admin/tenant/roles", requiredPermissions: []string{"tenant:manage"}},
		},
	},
}

var userMenus = []menuDef{
	{
		id:   2,
		name: "学习中心",
		path: "/app",
		children: []menuDef{
			{id: 20, name: "工作台", path: "/app/workbench"},
			{id: 21, name: "我的课程", path: "/app/courses", requiredPermissions: []string{"practice:use"}},
			{id: 22, name: "练题中心", path: "/app/practice", requiredPermissions: []string{"practice:use"}},
			{id: 23, name: "练题记录", path: "/app/practice/history", requiredPermissions: []string{"practice:use"}},
			{id: 24, name: "错题本", path: "/app/practice/wrong", requiredPermissions: []string{"practice:use"}},
			{id: 25, name: "熟题本", path: "/app/practice/mastered", requiredPermissions: []string{"practice:use"}},
			{id: 26, name: "疑惑题", path: "/app/practice/confused", requiredPermissions: []string{"practice:use"}},
			{id: 33, name: "试卷中心", path: "/app/exam-papers", requiredPermissions: []string{"practice:use"}},
			{id: 27, name: "班级学习", path: "/app/class-learning", requiredPermissions: []string{"analytics:view"}},
			{id: 28, name: "通知中心", path: "/app/notifications"},
			{id: 32, name: "系统公告", path: "/app/announcements"},
			{id: 29, name: "我的题库", path: "/app/teacher-banks", requiredUserTypes: []string{"teacher", "student"}},
		},
	},
}

func buildUserMenus(userType string, permissions []string) []MenuItem {
	menus := filterMenus(userMenus, userType, permissions)
	if len(menus) == 0 {
		return []MenuItem{}
	}

	if userType == "teacher" || containsAnyPermission(permissions, "exam:publish", "exam:manage", "tenant:manage", "system:manage") {
		menus[0].Children = append(menus[0].Children, MenuItem{
			ID:       30,
			Name:     "考试管理",
			Path:     "/app/exams",
			Children: []MenuItem{},
		})
		return menus
	}

	if containsAnyPermission(permissions, "practice:use") {
		menus[0].Children = append(menus[0].Children, MenuItem{
			ID:       31,
			Name:     "考试入口",
			Path:     "/app/exams",
			Children: []MenuItem{},
		})
	}

	return menus
}

func filterMenus(menus []menuDef, userType string, permissions []string) []MenuItem {
	permissionSet := make(map[string]struct{}, len(permissions))
	for _, permission := range permissions {
		permissionSet[permission] = struct{}{}
	}

	result := make([]MenuItem, 0)
	for _, menu := range menus {
		if !hasRequiredUserType(userType, menu.requiredUserTypes) {
			continue
		}
		if !hasPermissions(permissionSet, menu.requiredPermissions) {
			continue
		}
		children := filterMenus(menu.children, userType, permissions)
		if len(menu.children) > 0 && len(children) == 0 {
			continue
		}
		result = append(result, MenuItem{
			ID:       menu.id,
			Name:     menu.name,
			Path:     menu.path,
			Children: children,
		})
	}
	return result
}

func hasPermissions(permissionSet map[string]struct{}, required []string) bool {
	if len(required) == 0 {
		return true
	}
	if _, ok := permissionSet["system:manage"]; ok {
		return true
	}
	if requiresSystemManage(required) {
		return false
	}
	if _, ok := permissionSet["tenant:manage"]; ok {
		return true
	}
	for _, permission := range required {
		if _, ok := permissionSet[permission]; !ok {
			return false
		}
	}
	return true
}

func hasRequiredUserType(userType string, required []string) bool {
	if len(required) == 0 {
		return true
	}
	for _, item := range required {
		if userType == item {
			return true
		}
	}
	return false
}

func requiresSystemManage(required []string) bool {
	for _, permission := range required {
		if permission == "system:manage" {
			return true
		}
	}
	return false
}

func containsAnyPermission(permissions []string, targets ...string) bool {
	for _, permission := range permissions {
		for _, target := range targets {
			if permission == target {
				return true
			}
		}
	}
	return false
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
