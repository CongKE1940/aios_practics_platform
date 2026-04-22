package rbac

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
	"aios_practice_platform/internal/modules/auth"
)

type adminTokenParser interface {
	ParseToken(ctx context.Context, token string, tokenType string) (auth.AccessClaims, error)
}

type AdminHandler struct {
	service *AdminService
	parser  adminTokenParser
}

func NewAdminHandler(service *AdminService, parser adminTokenParser) *AdminHandler {
	return &AdminHandler{service: service, parser: parser}
}

func (handler *AdminHandler) RegisterAdminRoutes(router gin.IRouter) {
	router.GET("/roles", handler.listRoles)
	router.POST("/roles", handler.createRole)
	router.PUT("/roles/:id", handler.updateRole)
	router.GET("/permissions", handler.listPermissions)
	router.PUT("/roles/:id/permissions", handler.assignRolePermissions)
}

func (handler *AdminHandler) listRoles(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListRoles(ctx.Request.Context(), claims.TenantID, RoleListFilter{
		Status:   ctx.Query("status"),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeRBACError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *AdminHandler) createRole(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input RoleInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.CreateRole(ctx.Request.Context(), claims.TenantID, input)
	if err != nil {
		writeRBACError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *AdminHandler) updateRole(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input RoleInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.UpdateRole(ctx.Request.Context(), claims.TenantID, id, input)
	if err != nil {
		writeRBACError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *AdminHandler) listPermissions(ctx *gin.Context) {
	_, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListPermissions(ctx.Request.Context(), PermissionListFilter{
		Module:   ctx.Query("module"),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeRBACError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *AdminHandler) assignRolePermissions(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input RolePermissionsInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.AssignRolePermissions(ctx.Request.Context(), claims.TenantID, id, input)
	if err != nil {
		writeRBACError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *AdminHandler) authorize(ctx *gin.Context) (auth.AccessClaims, bool) {
	token := bearerToken(ctx.GetHeader("Authorization"))
	if token == "" {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	claims, err := handler.parser.ParseToken(ctx.Request.Context(), token, auth.TokenTypeAccess)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	if !containsPermission(claims.Permissions, "role:manage") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	return claims, true
}

func (handler *AdminHandler) authorizeWithID(ctx *gin.Context) (auth.AccessClaims, int64, bool) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return auth.AccessClaims{}, 0, false
	}
	id, err := strconv.ParseInt(ctx.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, 0, false
	}
	return claims, id, true
}

func writeRBACError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", ctx.GetHeader("X-Request-Id")))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
	}
}

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}

func parseInt(value string) int {
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}
