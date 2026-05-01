package exam

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
	router.GET("/exam-papers", handler.listExamPapers)
	router.POST("/exam-papers", handler.createExamPaper)
	router.GET("/exam-papers/:id", handler.getExamPaper)
	router.PUT("/exam-papers/:id", handler.updateExamPaper)
	router.POST("/exam-papers/:id/publish", handler.publishExamPaper)
	router.GET("/exams", handler.listExams)
	router.POST("/exams", handler.createExam)
	router.GET("/exams/:id", handler.getExam)
	router.PUT("/exams/:id", handler.updateExam)
	router.POST("/exams/:id/publish", handler.publishExam)
	router.POST("/exams/:id/attempts", handler.startAttempt)
	router.GET("/exam-attempts/:id", handler.getAttempt)
	router.POST("/exam-attempts/:id/answers", handler.saveAttemptAnswer)
	router.POST("/exam-attempts/:id/submit", handler.submitAttempt)
	router.GET("/exam-attempts/:id/result", handler.getAttemptResult)
}

func (handler *Handler) listExamPapers(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListExamPapers(ctx.Request.Context(), scope, ExamPaperListFilter{
		Status:   strings.TrimSpace(ctx.Query("status")),
		Keyword:  strings.TrimSpace(ctx.Query("keyword")),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createExamPaper(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input ExamPaperInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateExamPaper(ctx.Request.Context(), scope, input)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getExamPaper(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetExamPaper(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateExamPaper(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input ExamPaperInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateExamPaper(ctx.Request.Context(), scope, id, input)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) publishExamPaper(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.PublishExamPaper(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) listExams(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, ok := handler.authorizeNoPermission(ctx)
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
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createExam(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, ok := handler.authorizeNoPermission(ctx)
	if !ok {
		return
	}
	var input ExamInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateExam(ctx.Request.Context(), scope, input)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getExam(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetExam(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateExam(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input ExamInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateExam(ctx.Request.Context(), scope, id, input)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) publishExam(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithIDNoPermission(ctx)
	if !ok {
		return
	}
	result, err := handler.service.PublishExam(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) startAttempt(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithIDNoPermission(ctx)
	if !ok {
		return
	}
	result, err := handler.service.StartAttempt(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getAttempt(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithIDNoPermission(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetAttempt(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) saveAttemptAnswer(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithIDNoPermission(ctx)
	if !ok {
		return
	}
	var input SaveAttemptAnswerInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.SaveAttemptAnswer(ctx.Request.Context(), scope, id, input)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) submitAttempt(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithIDNoPermission(ctx)
	if !ok {
		return
	}
	result, err := handler.service.SubmitAttempt(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getAttemptResult(ctx *gin.Context) {
	if !handler.ready(ctx) {
		return
	}
	scope, id, ok := handler.authorizeWithIDNoPermission(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetAttemptResult(ctx.Request.Context(), scope, id)
	if err != nil {
		writeExamError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) ready(ctx *gin.Context) bool {
	if handler == nil || handler.service == nil || handler.parser == nil {
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
		return false
	}
	return true
}

func (handler *Handler) authorize(ctx *gin.Context) (Scope, bool) {
	scope, ok := handler.authorizeNoPermission(ctx)
	if !ok {
		return Scope{}, false
	}
	if !canManageExam(scope) {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
		return Scope{}, false
	}
	return scope, true
}

func (handler *Handler) authorizeNoPermission(ctx *gin.Context) (Scope, bool) {
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
	return Scope{
		TenantID:    claims.TenantID,
		UserID:      claims.UserID,
		UserType:    claims.UserType,
		Permissions: append([]string{}, claims.Permissions...),
	}, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context) (Scope, int64, bool) {
	scope, ok := handler.authorize(ctx)
	return handler.parseID(ctx, scope, ok)
}

func (handler *Handler) authorizeWithIDNoPermission(ctx *gin.Context) (Scope, int64, bool) {
	scope, ok := handler.authorizeNoPermission(ctx)
	return handler.parseID(ctx, scope, ok)
}

func (handler *Handler) parseID(ctx *gin.Context, scope Scope, ok bool) (Scope, int64, bool) {
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

func writeExamError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
	case errors.Is(err, ErrForbidden):
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", requestID(ctx)))
	case errors.Is(err, ErrQuestionPoolInsufficient):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "题库题量不足", requestID(ctx)))
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
