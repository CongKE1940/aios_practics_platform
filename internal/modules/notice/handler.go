package notice

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
	router.GET("/notices", handler.listNotices)
	router.POST("/notices", handler.createNotice)
	router.GET("/notices/:id", handler.getNotice)
	router.PUT("/notices/:id", handler.updateNotice)
	router.POST("/notices/:id/publish", handler.publishNotice)
	router.POST("/notices/:id/recall", handler.recallNotice)
	router.GET("/notifications", handler.listNotifications)
	router.POST("/notifications/:id/read", handler.markNotificationRead)
}

func (handler *Handler) listNotices(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx, true)
	if !ok {
		return
	}

	result, err := handler.service.ListNotices(ctx.Request.Context(), scope, NoticeListFilter{
		Status:     ctx.Query("status"),
		NoticeType: ctx.Query("notice_type"),
		Page:       parseIntQuery(ctx, "page"),
		PageSize:   parseIntQuery(ctx, "page_size"),
	})
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createNotice(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx, true)
	if !ok {
		return
	}

	var input NoticeInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}

	result, err := handler.service.CreateNotice(ctx.Request.Context(), scope, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getNotice(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, true)
	if !ok {
		return
	}

	result, err := handler.service.GetNotice(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateNotice(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, true)
	if !ok {
		return
	}

	var input NoticeInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}

	result, err := handler.service.UpdateNotice(ctx.Request.Context(), scope, id, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) publishNotice(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, true)
	if !ok {
		return
	}

	result, err := handler.service.PublishNotice(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) recallNotice(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, true)
	if !ok {
		return
	}

	result, err := handler.service.RecallNotice(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) listNotifications(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx, false)
	if !ok {
		return
	}

	result, err := handler.service.ListNotifications(ctx.Request.Context(), scope, NotificationListFilter{
		Status:   ctx.Query("status"),
		Category: ctx.Query("category"),
		Page:     parseIntQuery(ctx, "page"),
		PageSize: parseIntQuery(ctx, "page_size"),
	})
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) markNotificationRead(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, false)
	if !ok {
		return
	}

	result, err := handler.service.MarkNotificationRead(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) authorize(ctx *gin.Context, requireManage bool) (Scope, bool) {
	token := bearerToken(ctx.GetHeader("Authorization"))
	if token == "" {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", requestID(ctx)))
		return Scope{}, false
	}

	claims, err := handler.parser.ParseToken(ctx.Request.Context(), token, auth.TokenTypeAccess)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", requestID(ctx)))
		return Scope{}, false
	}
	if requireManage && !hasPermission(claims.Permissions, "notice:manage") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
		return Scope{}, false
	}

	return Scope{
		UserID:      claims.UserID,
		TenantID:    claims.TenantID,
		Permissions: claims.Permissions,
	}, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context, requireManage bool) (Scope, int64, bool) {
	scope, ok := handler.authorize(ctx, requireManage)
	if !ok {
		return Scope{}, 0, false
	}

	id, err := strconv.ParseInt(ctx.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return Scope{}, 0, false
	}
	return scope, id, true
}

func (handler *Handler) writeError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", requestID(ctx)))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
	}
}

func requestID(ctx *gin.Context) string {
	return ctx.GetHeader("X-Request-Id")
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func hasPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}

func parseIntQuery(ctx *gin.Context, key string) int {
	value := strings.TrimSpace(ctx.Query(key))
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}
