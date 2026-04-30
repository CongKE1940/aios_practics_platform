package snapshot

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
	router.GET("/audit-logs", handler.listAuditLogs)
	router.GET("/entity-snapshots", handler.listEntitySnapshots)
	router.GET("/student-transitions", handler.listStudentTransitions)
	router.POST("/student-transitions", handler.createStudentTransition)
	router.GET("/teacher-assignment-histories", handler.listTeacherAssignmentHistories)
	router.POST("/teacher-assignment-changes", handler.createTeacherAssignmentChange)
}

func (handler *Handler) listAuditLogs(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListAuditLogs(ctx.Request.Context(), scope, AuditLogListFilter{
		ModuleName:   ctx.Query("module_name"),
		ResourceType: ctx.Query("resource_type"),
		Page:         parseInt(ctx.Query("page")),
		PageSize:     parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeSnapshotError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listEntitySnapshots(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListEntitySnapshots(ctx.Request.Context(), scope, EntitySnapshotListFilter{
		EntityType: ctx.Query("entity_type"),
		EntityID:   parseInt64(ctx.Query("entity_id")),
		Page:       parseInt(ctx.Query("page")),
		PageSize:   parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeSnapshotError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listStudentTransitions(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListStudentTransitions(ctx.Request.Context(), scope, StudentTransitionListFilter{
		StudentID:      parseInt64(ctx.Query("student_id")),
		TransitionType: ctx.Query("transition_type"),
		Page:           parseInt(ctx.Query("page")),
		PageSize:       parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeSnapshotError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) createStudentTransition(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input StudentTransitionInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.RecordStudentTransition(ctx.Request.Context(), scope, input)
	if err != nil {
		writeSnapshotError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listTeacherAssignmentHistories(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListTeacherAssignmentHistories(ctx.Request.Context(), scope, TeacherAssignmentHistoryListFilter{
		TeacherID: parseInt64(ctx.Query("teacher_id")),
		ClassID:   parseInt64(ctx.Query("class_id")),
		CourseID:  parseInt64(ctx.Query("course_id")),
		Page:      parseInt(ctx.Query("page")),
		PageSize:  parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeSnapshotError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) createTeacherAssignmentChange(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input TeacherAssignmentChangeInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.RecordTeacherAssignmentChange(ctx.Request.Context(), scope, input)
	if err != nil {
		writeSnapshotError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) authorize(ctx *gin.Context) (Scope, bool) {
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
		Permissions: claims.Permissions,
	}, true
}

func writeSnapshotError(ctx *gin.Context, err error) {
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

func parseInt64(value string) int64 {
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}
