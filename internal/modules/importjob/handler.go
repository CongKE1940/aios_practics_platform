package importjob

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
	router.GET("/import/templates/:type", handler.downloadTemplate)
	router.POST("/import/jobs", handler.createJob)
	router.GET("/import/jobs", handler.listJobs)
	router.GET("/import/jobs/:id", handler.getJob)
	router.GET("/import/jobs/:id/rows", handler.listRows)
}

func (handler *Handler) downloadTemplate(ctx *gin.Context) {
	if _, ok := handler.authorize(ctx); !ok {
		return
	}
	content, filename, err := handler.service.TemplateContent(ctx.Param("type"))
	if err != nil {
		writeImportError(ctx, err)
		return
	}
	ctx.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	ctx.Data(http.StatusOK, "text/csv; charset=utf-8", content)
}

func (handler *Handler) createJob(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input ImportJobInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.CreateImportJob(ctx.Request.Context(), scope, input)
	if err != nil {
		writeImportError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listJobs(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListJobs(ctx.Request.Context(), scope, ImportJobListFilter{
		ImportType: ctx.Query("import_type"),
		Status:     ctx.Query("status"),
		Page:       parseInt(ctx.Query("page")),
		PageSize:   parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeImportError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) getJob(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.GetJob(ctx.Request.Context(), scope, id)
	if err != nil {
		writeImportError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) listRows(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListRows(ctx.Request.Context(), scope, id, ImportJobRowFilter{
		Status:   ctx.Query("status"),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeImportError(ctx, err)
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
	if claims.UserType != "sys_admin" && !containsPermission(claims.Permissions, "import:manage") {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
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

func writeImportError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", ctx.GetHeader("X-Request-Id")))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
	}
}

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target || permission == "system:manage" || permission == "tenant:manage" {
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
