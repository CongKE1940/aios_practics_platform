package analytics

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	router.GET("/analytics/class-practice-summary", handler.getClassPracticeSummary)
}

func (handler *Handler) getClassPracticeSummary(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	query, ok := parseClassPracticeSummaryQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.GetClassPracticeSummary(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) authorize(ctx *gin.Context) (Scope, bool) {
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
	if !containsPermission(claims.Permissions, "analytics:view") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
		return Scope{}, false
	}
	return Scope{
		TenantID:    claims.TenantID,
		UserID:      claims.UserID,
		UserType:    claims.UserType,
		Permissions: append([]string{}, claims.Permissions...),
	}, true
}

func parseClassPracticeSummaryQuery(ctx *gin.Context) (ClassPracticeSummaryQuery, bool) {
	classID, ok := parsePositiveInt64(ctx.Query("class_id"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	courseID, ok := parsePositiveInt64(ctx.Query("course_id"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	startAt, ok := parseOptionalTime(ctx.Query("start_at"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	endAt, ok := parseOptionalTime(ctx.Query("end_at"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	return ClassPracticeSummaryQuery{
		ClassID:  classID,
		CourseID: courseID,
		StartAt:  startAt,
		EndAt:    endAt,
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	}, true
}

func parseOptionalTime(value string) (*time.Time, bool) {
	if strings.TrimSpace(value) == "" {
		return nil, true
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, false
	}
	return &parsed, true
}

func writeAnalyticsError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
	case errors.Is(err, ErrForbidden):
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", requestID(ctx)))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
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

func requestID(ctx *gin.Context) string {
	return ctx.GetHeader("X-Request-Id")
}
