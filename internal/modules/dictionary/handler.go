package dictionary

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
	router.GET("/dictionaries", handler.listDictionaries)
	router.POST("/dictionaries", handler.createDictionary)
	router.PUT("/dictionaries/:id", handler.updateDictionary)
	router.GET("/dictionaries/:id/items", handler.listDictionaryItems)
	router.POST("/dictionaries/:id/items", handler.createDictionaryItem)
	router.GET("/dictionary-items", handler.listDictionaryItemsByCode)
	router.PUT("/dictionary-items/:id", handler.updateDictionaryItem)
}

func (handler *Handler) listDictionaries(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	result, err := handler.service.ListDictionaries(ctx.Request.Context(), scope, DictionaryListFilter{
		Status:   ctx.Query("status"),
		Keyword:  ctx.Query("keyword"),
		Page:     parseInt(ctx.Query("page")),
		PageSize: parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) createDictionary(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	var input DictionaryInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateDictionary(ctx.Request.Context(), scope, input)
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateDictionary(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, "id")
	if !ok {
		return
	}
	var input DictionaryInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateDictionary(ctx.Request.Context(), scope, id, input)
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) listDictionaryItems(ctx *gin.Context) {
	if _, ok := handler.authorize(ctx); !ok {
		return
	}
	dictionaryID, ok := parsePositiveIDParam(ctx, "id")
	if !ok {
		return
	}
	result, err := handler.service.ListItems(ctx.Request.Context(), DictionaryItemListFilter{
		DictionaryID: dictionaryID,
		Status:       ctx.Query("status"),
		Page:         parseInt(ctx.Query("page")),
		PageSize:     parseInt(ctx.Query("page_size")),
	})
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) listDictionaryItemsByCode(ctx *gin.Context) {
	if _, ok := handler.authorize(ctx); !ok {
		return
	}
	result, err := handler.service.ListItems(ctx.Request.Context(), DictionaryItemListFilter{
		DictionaryCode: ctx.Query("dict_code"),
		Status:         ctx.Query("status"),
		ActiveOnly:     parseBoolDefault(ctx.Query("active_only"), true),
		Page:           1,
		PageSize:       1000,
	})
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result.Items, requestID(ctx)))
}

func (handler *Handler) createDictionaryItem(ctx *gin.Context) {
	scope, dictionaryID, ok := handler.authorizeWithID(ctx, "id")
	if !ok {
		return
	}
	var input DictionaryItemInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.CreateItem(ctx.Request.Context(), scope, dictionaryID, input)
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}

func (handler *Handler) updateDictionaryItem(ctx *gin.Context) {
	scope, id, ok := handler.authorizeWithID(ctx, "id")
	if !ok {
		return
	}
	var input DictionaryItemInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return
	}
	result, err := handler.service.UpdateItem(ctx.Request.Context(), scope, id, input)
	if err != nil {
		writeDictionaryError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
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
	return Scope{UserType: claims.UserType, Permissions: claims.Permissions}, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context, key string) (Scope, int64, bool) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return Scope{}, 0, false
	}
	id, ok := parsePositiveIDParam(ctx, key)
	if !ok {
		return Scope{}, 0, false
	}
	return scope, id, true
}

func parsePositiveIDParam(ctx *gin.Context, key string) (int64, bool) {
	id, err := strconv.ParseInt(ctx.Param(key), 10, 64)
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", requestID(ctx)))
		return 0, false
	}
	return id, true
}

func writeDictionaryError(ctx *gin.Context, err error) {
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

func parseBoolDefault(value string, fallback bool) bool {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
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

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
