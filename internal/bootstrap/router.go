package bootstrap

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/common/config"
	"aios_practice_platform/internal/common/response"
)

type RouterOption func(*routerOptions)

type routerOptions struct {
	apiV1Routes []func(gin.IRouter)
}

func WithAPIV1Routes(register func(gin.IRouter)) RouterOption {
	return func(options *routerOptions) {
		options.apiV1Routes = append(options.apiV1Routes, register)
	}
}

func NewRouter(cfg config.Config, opts ...RouterOption) http.Handler {
	gin.SetMode(gin.ReleaseMode)

	options := routerOptions{}
	for _, opt := range opts {
		opt(&options)
	}

	router := gin.New()
	router.Use(gin.Recovery())

	router.GET("/healthz", func(ctx *gin.Context) {
		ctx.JSON(http.StatusOK, response.Success(gin.H{
			"status": "ok",
			"app":    cfg.App.Name,
			"env":    cfg.App.Env,
		}, ctx.GetHeader("X-Request-Id")))
	})

	apiV1 := router.Group("/api/v1")
	for _, register := range options.apiV1Routes {
		register(apiV1)
	}

	return router
}
