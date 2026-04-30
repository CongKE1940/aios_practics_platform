package org

import (
	"context"
	"errors"
	"log"
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
	router.GET("/schools", handler.listSchools)
	router.POST("/schools", handler.createSchool)
	router.POST("/schools/batch-delete", handler.batchDeleteSchools)
	router.GET("/schools/:id", handler.getSchool)
	router.PUT("/schools/:id", handler.updateSchool)
	router.POST("/schools/:id/disable", handler.disableSchool)
	router.POST("/schools/:id/enable", handler.enableSchool)
	router.DELETE("/schools/:id", handler.deleteSchool)
	router.POST("/schools/:id/delete", handler.deleteSchool)
	router.GET("/grades", handler.listGrades)
	router.POST("/grades", handler.createGrade)
	router.GET("/grades/:id", handler.getGrade)
	router.PUT("/grades/:id", handler.updateGrade)
	router.POST("/grades/:id/disable", handler.disableGrade)
	router.GET("/classes", handler.listClasses)
	router.POST("/classes", handler.createClass)
	router.GET("/classes/:id", handler.getClass)
	router.PUT("/classes/:id", handler.updateClass)
	router.POST("/classes/:id/disable", handler.disableClass)
	router.GET("/courses", handler.listCourses)
	router.POST("/courses", handler.createCourse)
	router.GET("/courses/:id", handler.getCourse)
	router.PUT("/courses/:id", handler.updateCourse)
	router.POST("/courses/:id/disable", handler.disableCourse)
}

func (handler *Handler) listSchools(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListSchools(ctx.Request.Context(), scope, SchoolListFilter{ObjectType: parseObjectTypeQuery(ctx), Status: ctx.Query("status"), Keyword: ctx.Query("keyword"), Page: parseIntQuery(ctx, "page"), PageSize: parseIntQuery(ctx, "page_size")})
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createSchool(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input SchoolInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateSchool(ctx.Request.Context(), scope, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getSchool(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetSchool(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateSchool(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input SchoolInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateSchool(ctx.Request.Context(), scope, id, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) disableSchool(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	if err := handler.service.DisableSchool(ctx.Request.Context(), scope, id); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) enableSchool(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	if err := handler.service.EnableSchool(ctx.Request.Context(), scope, id); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) deleteSchool(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	input := SchoolBatchDeleteInput{IDs: []int64{id}}
	if ctx.Request.ContentLength > 0 {
		var body SchoolBatchDeleteInput
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
			return
		}
		input.CascadeDelete = body.CascadeDelete
	}
	if err := handler.service.BatchDeleteSchools(ctx.Request.Context(), scope, input); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) batchDeleteSchools(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input SchoolBatchDeleteInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	if err := handler.service.BatchDeleteSchools(ctx.Request.Context(), scope, input); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) listGrades(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListGrades(ctx.Request.Context(), scope, GradeListFilter{SchoolID: parseInt64Query(ctx, "school_id"), Status: ctx.Query("status"), Page: parseIntQuery(ctx, "page"), PageSize: parseIntQuery(ctx, "page_size")})
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createGrade(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input GradeInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateGrade(ctx.Request.Context(), scope, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) getGrade(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetGrade(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) updateGrade(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input GradeInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateGrade(ctx.Request.Context(), scope, id, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) disableGrade(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	if err := handler.service.DisableGrade(ctx.Request.Context(), scope, id); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) listClasses(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListClasses(ctx.Request.Context(), scope, ClassListFilter{SchoolID: parseInt64Query(ctx, "school_id"), GradeID: parseInt64Query(ctx, "grade_id"), Status: ctx.Query("status"), Page: parseIntQuery(ctx, "page"), PageSize: parseIntQuery(ctx, "page_size")})
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) createClass(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input ClassInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateClass(ctx.Request.Context(), scope, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) getClass(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetClass(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) updateClass(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input ClassInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateClass(ctx.Request.Context(), scope, id, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) disableClass(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	if err := handler.service.DisableClass(ctx.Request.Context(), scope, id); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) listCourses(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	filter := CourseListFilter{Status: ctx.Query("status"), Keyword: ctx.Query("keyword"), Page: parseIntQuery(ctx, "page"), PageSize: parseIntQuery(ctx, "page_size")}
	if activeAt := strings.TrimSpace(ctx.Query("active_at")); activeAt != "" {
		parsed, err := time.Parse(time.RFC3339, activeAt)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
			return
		}
		filter.ActiveAt = &parsed
	}
	result, err := handler.service.ListCourses(ctx.Request.Context(), scope, filter)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) createCourse(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input CourseInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateCourse(ctx.Request.Context(), scope, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) getCourse(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetCourse(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) updateCourse(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input CourseInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateCourse(ctx.Request.Context(), scope, id, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
func (handler *Handler) disableCourse(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	if err := handler.service.DisableCourse(ctx.Request.Context(), scope, id); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
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
	if claims.UserType != "sys_admin" && !hasPermission(claims.Permissions, "org:manage") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
		return Scope{}, false
	}
	return Scope{TenantID: claims.TenantID, UserType: claims.UserType, Permissions: claims.Permissions}, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context) (Scope, int64, bool) {
	scope, ok := handler.authorize(ctx)
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
	case errors.Is(err, ErrForbidden):
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", requestID(ctx)))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", requestID(ctx)))
	case errors.Is(err, ErrDeleteRestricted):
		ctx.JSON(http.StatusConflict, response.Failure(CodeDeleteRestricted, "该学校或组织下存在年级、班级或学生，请先处理关联数据，或选择同时删除关联数据", requestID(ctx)))
	default:
		log.Printf("org handler internal error method=%s path=%s request_id=%s error=%v", ctx.Request.Method, ctx.Request.URL.RequestURI(), requestID(ctx), err)
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
	}
}

func parseInt64Query(ctx *gin.Context, key string) int64 {
	value := strings.TrimSpace(ctx.Query(key))
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
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
func parseObjectTypeQuery(ctx *gin.Context) int {
	value := strings.TrimSpace(ctx.Query("object_type"))
	switch value {
	case "":
		return 0
	case "school":
		return ObjectTypeSchool
	case "organization":
		return ObjectTypeOrganization
	default:
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return 0
		}
		return parsed
	}
}
func requestID(ctx *gin.Context) string { return ctx.GetHeader("X-Request-Id") }
func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
func hasPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target || permission == "system:manage" || permission == "tenant:manage" {
			return true
		}
	}
	return false
}
