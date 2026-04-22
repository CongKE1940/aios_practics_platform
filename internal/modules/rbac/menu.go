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

	menus := BuildMenus(ctx.Query("app_type"), claims.Permissions)
	ctx.JSON(http.StatusOK, response.Success(menus, ctx.GetHeader("X-Request-Id")))
}

func BuildMenus(appType string, permissions []string) []MenuItem {
	var menus []menuDef
	switch appType {
	case "", "admin":
		menus = adminMenus
	case "user":
		menus = userMenus
	default:
		return []MenuItem{}
	}

	return filterMenus(menus, permissions)
}

type menuDef struct {
	id                  int64
	name                string
	path                string
	requiredPermissions []string
	children            []menuDef
}

var adminMenus = []menuDef{
	{
		id:   1,
		name: "系统管理",
		path: "/admin",
		children: []menuDef{
			{id: 11, name: "组织管理", path: "/admin/org", requiredPermissions: []string{"org:manage"}},
			{id: 12, name: "用户管理", path: "/admin/users", requiredPermissions: []string{"user:manage"}},
			{id: 13, name: "角色权限", path: "/admin/roles", requiredPermissions: []string{"role:manage"}},
			{id: 14, name: "公告通知", path: "/admin/notices", requiredPermissions: []string{"notice:manage"}},
		},
	},
}

var userMenus = []menuDef{
	{
		id:   2,
		name: "学习中心",
		path: "/app",
		children: []menuDef{
			{id: 21, name: "我的课程", path: "/app/courses", requiredPermissions: []string{"practice:use"}},
		},
	},
}

func filterMenus(menus []menuDef, permissions []string) []MenuItem {
	permissionSet := make(map[string]struct{}, len(permissions))
	for _, permission := range permissions {
		permissionSet[permission] = struct{}{}
	}

	result := make([]MenuItem, 0)
	for _, menu := range menus {
		if !hasPermissions(permissionSet, menu.requiredPermissions) {
			continue
		}
		children := filterMenus(menu.children, permissions)
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
	for _, permission := range required {
		if _, ok := permissionSet[permission]; !ok {
			return false
		}
	}
	return true
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
