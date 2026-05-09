package org

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
)

func (handler *Handler) RegisterPeriodRoutes(router gin.IRouter) {
	router.GET("/org-periods", handler.listOrgPeriods)
	router.POST("/org-periods", handler.createOrgPeriod)
	router.GET("/org-periods/:id", handler.getOrgPeriod)
	router.PUT("/org-periods/:id", handler.updateOrgPeriod)
	router.POST("/org-periods/:id/disable", handler.disableOrgPeriod)
	router.GET("/org-periods/:id/classes", handler.listGradePeriodClasses)
	router.GET("/student-membership-histories", handler.listStudentMembershipHistories)
}

func (handler *Handler) listOrgPeriods(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	filter := OrgPeriodListFilter{
		SchoolID:       parseInt64Query(ctx, "school_id"),
		TargetType:     ctx.Query("target_type"),
		TargetID:       parseInt64Query(ctx, "target_id"),
		GradeID:        parseInt64Query(ctx, "grade_id"),
		ClassID:        parseInt64Query(ctx, "class_id"),
		ParentPeriodID: parseInt64Query(ctx, "parent_period_id"),
		Status:         ctx.Query("status"),
		Page:           parseIntQuery(ctx, "page"),
		PageSize:       parseIntQuery(ctx, "page_size"),
	}
	if activeAt, ok := parseRFC3339Query(ctx, "active_at"); ok {
		filter.ActiveAt = &activeAt
	}
	result, err := handler.service.ListOrgPeriods(ctx.Request.Context(), scope, filter)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) getOrgPeriod(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetOrgPeriod(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createOrgPeriod(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input OrgPeriodInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateOrgPeriod(ctx.Request.Context(), scope, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateOrgPeriod(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input OrgPeriodInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateOrgPeriod(ctx.Request.Context(), scope, id, input)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) disableOrgPeriod(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	if err := handler.service.DisableOrgPeriod(ctx.Request.Context(), scope, id); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) listGradePeriodClasses(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListGradePeriodClasses(ctx.Request.Context(), scope, id)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) listStudentMembershipHistories(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	filter := StudentMembershipHistoryFilter{
		StudentID: parseInt64Query(ctx, "student_id"),
		SchoolID:  parseInt64Query(ctx, "school_id"),
		GradeID:   parseInt64Query(ctx, "grade_id"),
		ClassID:   parseInt64Query(ctx, "class_id"),
		PeriodID:  parseInt64Query(ctx, "period_id"),
		Page:      parseIntQuery(ctx, "page"),
		PageSize:  parseIntQuery(ctx, "page_size"),
	}
	if startAt, ok := parseRFC3339Query(ctx, "start_at"); ok {
		filter.StartAt = &startAt
	}
	if endAt, ok := parseRFC3339Query(ctx, "end_at"); ok {
		filter.EndAt = &endAt
	}
	result, err := handler.service.ListStudentMembershipHistories(ctx.Request.Context(), scope, filter)
	if err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func parseRFC3339Query(ctx *gin.Context, key string) (time.Time, bool) {
	value := strings.TrimSpace(ctx.Query(key))
	if value == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}
