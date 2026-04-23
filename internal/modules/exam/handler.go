package exam

import (
	"context"
	"errors"
	"net/http"
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
	router.GET("/exams", handler.listExams)
}

func (handler *Handler) listExams(ctx *gin.Context) {
	if handler == nil || handler.service == nil || handler.parser == nil {
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
		return
	}
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListExams(ctx.Request.Context(), scope, ExamListFilter{
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) authorize(ctx *gin.Context) (Scope, bool) {
	if handler == nil || handler.parser == nil {
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
		return Scope{}, false
	}
	token := bearerToken(ctx.GetHeader("Authorization"))
	if token == "" {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return Scope{}, false
	}
	claims, err := handler.parser.ParseToken(ctx.Request.Context(), token, auth.TokenTypeAccess)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return Scope{}, false
	}
	return Scope{
		TenantID:    claims.TenantID,
		UserID:      claims.UserID,
		UserType:    claims.UserType,
		Permissions: append([]string{}, claims.Permissions...),
	}, true
}

func writeExamError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrForbidden):
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", ctx.GetHeader("X-Request-Id")))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
	}
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
