package bootstrap

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

var allowedOrigins = map[string]struct{}{
	"http://127.0.0.1:5173": {},
	"http://127.0.0.1:5174": {},
	"http://localhost:5173": {},
	"http://localhost:5174": {},
}

func corsMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		origin := ctx.GetHeader("Origin")
		if origin == "" {
			ctx.Next()
			return
		}

		if _, ok := allowedOrigins[origin]; ok {
			headers := ctx.Writer.Header()
			headers.Set("Access-Control-Allow-Origin", origin)
			headers.Set("Vary", "Origin")
			headers.Set("Access-Control-Allow-Credentials", "true")
			headers.Set("Access-Control-Allow-Methods", strings.Join([]string{
				http.MethodGet,
				http.MethodPost,
				http.MethodPut,
				http.MethodDelete,
				http.MethodOptions,
			}, ", "))

			requestHeaders := ctx.GetHeader("Access-Control-Request-Headers")
			if requestHeaders == "" {
				requestHeaders = "Authorization, Content-Type, X-Request-Id"
			}
			headers.Set("Access-Control-Allow-Headers", requestHeaders)
		}

		if ctx.Request.Method == http.MethodOptions {
			ctx.Status(http.StatusNoContent)
			ctx.Abort()
			return
		}

		ctx.Next()
	}
}
