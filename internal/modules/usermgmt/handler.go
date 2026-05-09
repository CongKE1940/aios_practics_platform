package usermgmt

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
	"aios_practice_platform/internal/modules/auth"
)

type TokenParser interface {
	ParseToken(ctx context.Context, token string, tokenType string) (auth.AccessClaims, error)
}

type Handler struct {
	service *Service
	parser  TokenParser
}

func NewHandler(service *Service, parser TokenParser) *Handler {
	return &Handler{service: service, parser: parser}
}

func (handler *Handler) RegisterRoutes(router gin.IRouter) {
	router.GET("/users/me", handler.myProfile)
	router.PUT("/users/me", handler.updateMyProfile)
	router.PUT("/users/me/password", handler.changeMyPassword)
	router.GET("/users", handler.listUsers)
	router.POST("/users", handler.createUser)
	router.GET("/users/:id", handler.getUser)
	router.PUT("/users/:id", handler.updateUser)
	router.PUT("/users/:id/roles", handler.assignRoles)
	router.POST("/users/:id/reset-password", handler.resetPassword)
	router.POST("/users/:id/disable", handler.disableUser)
	router.GET("/students", handler.listStudents)
	router.POST("/students", handler.createStudent)
	router.GET("/teachers", handler.listTeachers)
	router.POST("/teachers", handler.createTeacher)
}

func (handler *Handler) myProfile(ctx *gin.Context) {
	claims, ok := handler.authorizeAuthenticated(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetCurrentUser(ctx.Request.Context(), claims.TenantID, claims.UserID)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) updateMyProfile(ctx *gin.Context) {
	claims, ok := handler.authorizeAuthenticated(ctx)
	if !ok {
		return
	}
	var input ProfileInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.UpdateCurrentUserProfile(ctx.Request.Context(), claims.TenantID, claims.UserID, input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) changeMyPassword(ctx *gin.Context) {
	claims, ok := handler.authorizeAuthenticated(ctx)
	if !ok {
		return
	}
	var input ChangePasswordInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.ChangeCurrentPassword(ctx.Request.Context(), claims.TenantID, claims.UserID, input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listUsers(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListUsers(ctx.Request.Context(), readTenantID(claims), UserListFilter{
		UserType: ctx.Query("user_type"),
		Keyword:  ctx.Query("keyword"),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) createUser(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input UserInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.CreateUser(ctx.Request.Context(), userScopeFromClaims(claims), input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) getUser(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetUser(ctx.Request.Context(), readTenantID(claims), id)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) updateUser(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input UserInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.UpdateUserWithScope(ctx.Request.Context(), userScopeFromClaims(claims), id, input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) assignRoles(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input UserRolesInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.AssignRolesWithScope(ctx.Request.Context(), userScopeFromClaims(claims), id, input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) resetPassword(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input ResetPasswordInput
	if ctx.Request.ContentLength != 0 {
		if err := ctx.ShouldBindJSON(&input); err != nil {
			ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
			return
		}
	}
	if input.NewPassword != "" {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.ResetPasswordWithScope(ctx.Request.Context(), userScopeFromClaims(claims), id, input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) disableUser(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.DisableUserWithScope(ctx.Request.Context(), userScopeFromClaims(claims), id)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) authorizeAuthenticated(ctx *gin.Context) (auth.AccessClaims, bool) {
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
	return claims, true
}

func (handler *Handler) authorize(ctx *gin.Context) (auth.AccessClaims, bool) {
	claims, ok := handler.authorizeAuthenticated(ctx)
	if !ok {
		return auth.AccessClaims{}, false
	}
	if claims.UserType != "sys_admin" && !containsPermission(claims.Permissions, "user:manage") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	return claims, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context) (auth.AccessClaims, int64, bool) {
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

func writeUserError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
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
		if permission == target || permission == "system:manage" || permission == "tenant:manage" {
			return true
		}
	}
	return false
}

func readTenantID(claims auth.AccessClaims) int64 {
	if claims.UserType == "sys_admin" || containsPermission(claims.Permissions, "system:manage") || containsPermission(claims.Permissions, "tenant:manage") {
		return 0
	}
	return claims.TenantID
}

func userScopeFromClaims(claims auth.AccessClaims) Scope {
	return Scope{
		TenantID:    claims.TenantID,
		UserType:    claims.UserType,
		Permissions: append([]string{}, claims.Permissions...),
	}
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
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
