package org

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
)

func (handler *Handler) RegisterLifecycleRoutes(router gin.IRouter) {
	router.POST("/grades/:id/end", handler.endGrade)
	router.POST("/classes/:id/end", handler.endClass)
}

func (handler *Handler) endGrade(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input EndGradeInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	if err := handler.service.EndGrade(ctx.Request.Context(), scope, id, input); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}

func (handler *Handler) endClass(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	var input EndClassInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	if err := handler.service.EndClass(ctx.Request.Context(), scope, id, input); err != nil {
		handler.writeError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
}
