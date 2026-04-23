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
	router.GET("/analytics/exam-overview", handler.getExamOverview)
	router.GET("/analytics/exam-attempt-review", handler.getExamAttemptReview)
	router.GET("/analytics/class-practice-summary", handler.getClassPracticeSummary)
	router.GET("/analytics/class-course-options", handler.listClassCourseOptions)
	router.GET("/analytics/student-practice-detail", handler.getStudentPracticeDetail)
	router.GET("/analytics/student-practice-session-detail", handler.getStudentPracticeSessionDetail)
	router.GET("/analytics/student-practice-session-question-detail", handler.getStudentPracticeSessionQuestionDetail)
	router.PUT("/analytics/student-practice-session-question-review", handler.putStudentPracticeSessionQuestionReview)
}

func (handler *Handler) getExamOverview(ctx *gin.Context) {
	scope, ok := handler.authorizeExamOverview(ctx)
	if !ok {
		return
	}
	query, ok := parseExamOverviewQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.GetExamOverview(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getExamAttemptReview(ctx *gin.Context) {
	scope, ok := handler.authorizeExamOverview(ctx)
	if !ok {
		return
	}
	query, ok := parseExamAttemptReviewQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.GetExamAttemptReview(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
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

func (handler *Handler) listClassCourseOptions(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	items, err := handler.service.ListClassCourseOptions(ctx.Request.Context(), scope)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(ClassCourseOptionsResult{Items: items}, requestID(ctx)))
}

func (handler *Handler) getStudentPracticeDetail(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	query, ok := parseStudentPracticeDetailQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.GetStudentPracticeDetail(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getStudentPracticeSessionDetail(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	query, ok := parseStudentPracticeSessionDetailQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.GetStudentPracticeSessionDetail(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getStudentPracticeSessionQuestionDetail(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	query, ok := parseStudentPracticeSessionQuestionDetailQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.GetStudentPracticeSessionQuestionDetail(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) putStudentPracticeSessionQuestionReview(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var request upsertStudentPracticeSessionQuestionReviewRequest
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpsertStudentPracticeSessionQuestionReview(ctx.Request.Context(), scope, UpsertStudentPracticeSessionQuestionReviewCommand{
		ClassID:           request.ClassID,
		CourseID:          request.CourseID,
		StudentUserID:     request.StudentUserID,
		SessionID:         request.SessionID,
		SessionQuestionID: request.SessionQuestionID,
		ReviewComment:     request.ReviewComment,
	})
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

type upsertStudentPracticeSessionQuestionReviewRequest struct {
	ClassID           int64  `json:"class_id"`
	CourseID          int64  `json:"course_id"`
	StudentUserID     int64  `json:"student_user_id"`
	SessionID         int64  `json:"session_id"`
	SessionQuestionID int64  `json:"session_question_id"`
	ReviewComment     string `json:"review_comment"`
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

func (handler *Handler) authorizeExamOverview(ctx *gin.Context) (Scope, bool) {
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
	if !containsAnyPermission(claims.Permissions, "analytics:view", "exam:publish") {
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

func parseExamOverviewQuery(ctx *gin.Context) (ExamOverviewQuery, bool) {
	examID, ok := parsePositiveInt64(ctx.Query("exam_id"))
	if !ok {
		return ExamOverviewQuery{}, false
	}
	return ExamOverviewQuery{
		ExamID:   examID,
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	}, true
}

func parseExamAttemptReviewQuery(ctx *gin.Context) (ExamAttemptReviewQuery, bool) {
	attemptID, ok := parsePositiveInt64(ctx.Query("attempt_id"))
	if !ok {
		return ExamAttemptReviewQuery{}, false
	}
	return ExamAttemptReviewQuery{
		AttemptID: attemptID,
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

func parseStudentPracticeDetailQuery(ctx *gin.Context) (StudentPracticeDetailQuery, bool) {
	classID, ok := parsePositiveInt64(ctx.Query("class_id"))
	if !ok {
		return StudentPracticeDetailQuery{}, false
	}
	courseID, ok := parsePositiveInt64(ctx.Query("course_id"))
	if !ok {
		return StudentPracticeDetailQuery{}, false
	}
	studentUserID, ok := parsePositiveInt64(ctx.Query("student_user_id"))
	if !ok {
		return StudentPracticeDetailQuery{}, false
	}
	startAt, ok := parseOptionalTime(ctx.Query("start_at"))
	if !ok {
		return StudentPracticeDetailQuery{}, false
	}
	endAt, ok := parseOptionalTime(ctx.Query("end_at"))
	if !ok {
		return StudentPracticeDetailQuery{}, false
	}
	return StudentPracticeDetailQuery{
		ClassID:       classID,
		CourseID:      courseID,
		StudentUserID: studentUserID,
		Tab:           strings.TrimSpace(ctx.Query("tab")),
		StartAt:       startAt,
		EndAt:         endAt,
		Page:          parseInt(ctx.Query("page")),
		PageSize:      parseInt(ctx.Query("page_size")),
	}, true
}

func parseStudentPracticeSessionDetailQuery(ctx *gin.Context) (StudentPracticeSessionDetailQuery, bool) {
	classID, ok := parsePositiveInt64(ctx.Query("class_id"))
	if !ok {
		return StudentPracticeSessionDetailQuery{}, false
	}
	courseID, ok := parsePositiveInt64(ctx.Query("course_id"))
	if !ok {
		return StudentPracticeSessionDetailQuery{}, false
	}
	studentUserID, ok := parsePositiveInt64(ctx.Query("student_user_id"))
	if !ok {
		return StudentPracticeSessionDetailQuery{}, false
	}
	sessionID, ok := parsePositiveInt64(ctx.Query("session_id"))
	if !ok {
		return StudentPracticeSessionDetailQuery{}, false
	}
	return StudentPracticeSessionDetailQuery{
		ClassID:       classID,
		CourseID:      courseID,
		StudentUserID: studentUserID,
		SessionID:     sessionID,
	}, true
}

func parseStudentPracticeSessionQuestionDetailQuery(ctx *gin.Context) (StudentPracticeSessionQuestionDetailQuery, bool) {
	classID, ok := parsePositiveInt64(ctx.Query("class_id"))
	if !ok {
		return StudentPracticeSessionQuestionDetailQuery{}, false
	}
	courseID, ok := parsePositiveInt64(ctx.Query("course_id"))
	if !ok {
		return StudentPracticeSessionQuestionDetailQuery{}, false
	}
	studentUserID, ok := parsePositiveInt64(ctx.Query("student_user_id"))
	if !ok {
		return StudentPracticeSessionQuestionDetailQuery{}, false
	}
	sessionID, ok := parsePositiveInt64(ctx.Query("session_id"))
	if !ok {
		return StudentPracticeSessionQuestionDetailQuery{}, false
	}
	sessionQuestionID, ok := parsePositiveInt64(ctx.Query("session_question_id"))
	if !ok {
		return StudentPracticeSessionQuestionDetailQuery{}, false
	}
	return StudentPracticeSessionQuestionDetailQuery{
		ClassID:           classID,
		CourseID:          courseID,
		StudentUserID:     studentUserID,
		SessionID:         sessionID,
		SessionQuestionID: sessionQuestionID,
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
