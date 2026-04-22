package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/response"
)

type AuthService interface {
	Login(ctx context.Context, command LoginCommand) (LoginResult, error)
	Refresh(ctx context.Context, command RefreshCommand) (LoginResult, error)
	CurrentUser(ctx context.Context, accessToken string) (CurrentUser, error)
	Logout(ctx context.Context, accessToken string) error
}

type Handler struct {
	service AuthService
}

func NewHandler(service AuthService) *Handler {
	return &Handler{service: service}
}

func (handler *Handler) RegisterRoutes(router gin.IRouter) {
	router.POST("/auth/login", handler.login)
	router.POST("/auth/refresh", handler.refresh)
	router.GET("/auth/me", handler.me)
	router.POST("/auth/logout", handler.logout)
}

func (handler *Handler) login(ctx *gin.Context) {
	var command LoginCommand
	if err := ctx.ShouldBindJSON(&command); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidRequest, "请求参数错误", requestID(ctx)))
		return
	}

	result, err := handler.service.Login(ctx.Request.Context(), command)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) || errors.Is(err, ErrUserDisabled) {
			ctx.JSON(http.StatusUnauthorized, response.Failure(CodeInvalidCredentials, "用户名或密码错误", requestID(ctx)))
			return
		}
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
		return
	}

	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) refresh(ctx *gin.Context) {
	var command RefreshCommand
	if err := ctx.ShouldBindJSON(&command); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidRequest, "请求参数错误", requestID(ctx)))
		return
	}

	result, err := handler.service.Refresh(ctx.Request.Context(), command)
	if err != nil {
		if errors.Is(err, ErrInvalidToken) {
			ctx.JSON(http.StatusUnauthorized, response.Failure(CodeInvalidToken, "令牌无效", requestID(ctx)))
			return
		}
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
		return
	}

	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) me(ctx *gin.Context) {
	accessToken := bearerToken(ctx.GetHeader("Authorization"))
	if accessToken == "" {
		ctx.JSON(http.StatusUnauthorized, response.Failure(CodeInvalidToken, "令牌无效", requestID(ctx)))
		return
	}

	user, err := handler.service.CurrentUser(ctx.Request.Context(), accessToken)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, response.Failure(CodeInvalidToken, "令牌无效", requestID(ctx)))
		return
	}

	ctx.JSON(http.StatusOK, response.Success(user, requestID(ctx)))
}

func (handler *Handler) logout(ctx *gin.Context) {
	if err := handler.service.Logout(ctx.Request.Context(), bearerToken(ctx.GetHeader("Authorization"))); err != nil {
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", requestID(ctx)))
		return
	}
	ctx.JSON(http.StatusOK, response.Success(true, requestID(ctx)))
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
