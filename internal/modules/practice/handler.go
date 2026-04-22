package practice

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
	router.POST("/practice/sessions", handler.createSession)
	router.GET("/practice/sessions/:id", handler.getSession)
	router.POST("/practice/sessions/:id/next-question", handler.nextQuestion)
	router.POST("/practice/sessions/:id/answer", handler.submitAnswer)
	router.POST("/practice/sessions/:id/finish", handler.finishSession)
	router.POST("/practice/questions/:id/mark-mastered", handler.markMastered)
	router.POST("/practice/questions/:id/mark-confused", handler.markConfused)
	router.GET("/user-question-states", handler.listStates)
}

func (handler *Handler) createSession(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input PracticeSessionInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.CreateSession(ctx.Request.Context(), scope, input)
	if err != nil {
		writePracticeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) getSession(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetSession(ctx.Request.Context(), scope, id)
	if err != nil {
		writePracticeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) nextQuestion(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.NextQuestion(ctx.Request.Context(), scope, id)
	if err != nil {
		writePracticeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) submitAnswer(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input PracticeAnswerInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.SubmitAnswer(ctx.Request.Context(), scope, id, input)
	if err != nil {
		writePracticeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) finishSession(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.FinishSession(ctx.Request.Context(), scope, id)
	if err != nil {
		writePracticeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) markMastered(ctx *gin.Context) {
	handler.markState(ctx, true)
}

func (handler *Handler) markConfused(ctx *gin.Context) {
	handler.markState(ctx, false)
}

func (handler *Handler) markState(ctx *gin.Context, mastered bool) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input QuestionStateInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	var (
		result UserQuestionState
		err    error
	)
	if mastered {
		result, err = handler.service.MarkMastered(ctx.Request.Context(), scope, id, input.Value)
	} else {
		result, err = handler.service.MarkConfused(ctx.Request.Context(), scope, id, input.Value)
	}
	if err != nil {
		writePracticeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listStates(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	filter := UserQuestionStateFilter{
		StateType: ctx.Query("state_type"),
		Page:      parseInt(ctx.Query("page")),
		PageSize:  parseInt(ctx.Query("page_size")),
	}
	if bankID, ok := parseOptionalInt64(ctx.Query("bank_id")); ok {
		filter.BankID = bankID
	}
	result, err := handler.service.ListStates(ctx.Request.Context(), scope, filter)
	if err != nil {
		writePracticeError(ctx, err)
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
	if !containsPermission(claims.Permissions, "practice:use") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
		return Scope{}, false
	}
	return Scope{TenantID: claims.TenantID, UserID: claims.UserID}, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context) (Scope, int64, bool) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return Scope{}, 0, false
	}
	id, err := strconv.ParseInt(ctx.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return Scope{}, 0, false
	}
	return scope, id, true
}

func writePracticeError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput), errors.Is(err, ErrNoCandidates):
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

func parseOptionalInt64(value string) (*int64, bool) {
	if strings.TrimSpace(value) == "" {
		return nil, false
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return nil, false
	}
	return &parsed, true
}
