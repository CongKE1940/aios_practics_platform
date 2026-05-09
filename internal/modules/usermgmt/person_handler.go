package usermgmt

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
)

func (handler *Handler) listStudents(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListStudents(ctx.Request.Context(), userScopeFromClaims(claims), StudentListFilter{
		SchoolID: parseInt64(ctx.Query("school_id")),
		Keyword:  strings.TrimSpace(ctx.Query("keyword")),
		Status:   strings.TrimSpace(ctx.Query("status")),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) createStudent(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input StudentInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.CreateStudent(ctx.Request.Context(), userScopeFromClaims(claims), input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listTeachers(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListTeachers(ctx.Request.Context(), userScopeFromClaims(claims), TeacherListFilter{
		SchoolID: parseInt64(ctx.Query("school_id")),
		Keyword:  strings.TrimSpace(ctx.Query("keyword")),
		Status:   strings.TrimSpace(ctx.Query("status")),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) createTeacher(ctx *gin.Context) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input TeacherInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.CreateTeacher(ctx.Request.Context(), userScopeFromClaims(claims), input)
	if err != nil {
		writeUserError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func parseInt64(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}
