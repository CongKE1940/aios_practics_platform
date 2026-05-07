package fileasset

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime/multipart"
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
	router.POST("/files/upload", handler.upload)
	router.POST("/files/import-url", handler.importURL)
	router.GET("/files/:id/content", handler.content)
	router.GET("/files/:id", handler.detail)
}

func (handler *Handler) upload(ctx *gin.Context) {
	usage := ctx.PostForm("usage")
	claims, ok := handler.authorizeUpload(ctx, usage)
	if !ok {
		return
	}

	fileHeader, err := ctx.FormFile("file")
	if err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}

	metadata, err := readFileMetadata(fileHeader)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}

	content, err := fileHeader.Open()
	if err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	defer content.Close()

	result, err := handler.service.CreateUpload(ctx.Request.Context(), claims.TenantID, claims.UserID, UploadInput{
		Usage:            usage,
		OriginalFilename: fileHeader.Filename,
		MimeType:         metadata.mimeType,
		FileSize:         metadata.fileSize,
		Checksum:         metadata.checksum,
		Content:          content,
	})
	if err != nil {
		writeFileError(ctx, err)
		return
	}

	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) importURL(ctx *gin.Context) {
	var input ImportURLInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	claims, ok := handler.authorizeUpload(ctx, input.Usage)
	if !ok {
		return
	}

	result, err := handler.service.CreateImportURL(ctx.Request.Context(), claims.TenantID, claims.UserID, input)
	if err != nil {
		writeFileError(ctx, err)
		return
	}

	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) detail(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}

	result, err := handler.service.GetByID(ctx.Request.Context(), claims.TenantID, id)
	if err != nil {
		writeFileError(ctx, err)
		return
	}

	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}

func (handler *Handler) content(ctx *gin.Context) {
	claims, id, ok := handler.authorizeWithID(ctx)
	if !ok {
		return
	}

	asset, content, err := handler.service.GetContent(ctx.Request.Context(), claims.TenantID, id)
	if err != nil {
		writeFileError(ctx, err)
		return
	}
	if asset.SourceType == SourceTypeRemoteURL {
		if asset.OriginalURL == "" {
			writeFileError(ctx, ErrNotFound)
			return
		}
		ctx.Redirect(http.StatusFound, asset.OriginalURL)
		return
	}
	defer content.Close()

	mimeType := asset.MimeType
	if strings.TrimSpace(mimeType) == "" {
		mimeType = "application/octet-stream"
	}
	ctx.DataFromReader(http.StatusOK, asset.FileSize, mimeType, content, nil)
}

func (handler *Handler) authorize(ctx *gin.Context) (auth.AccessClaims, bool) {
	token := bearerToken(ctx.GetHeader("Authorization"))
	if token == "" {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	claims, err := handler.parser.ParseToken(ctx.Request.Context(), token, auth.TokenTypeAccess)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, response.Failure(auth.CodeInvalidToken, "令牌无效", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	return claims, true
}

func (handler *Handler) authorizeUpload(ctx *gin.Context, usage string) (auth.AccessClaims, bool) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return auth.AccessClaims{}, false
	}
	if !canUploadUsage(claims, usage) {
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, false
	}
	return claims, true
}

func (handler *Handler) authorizeWithID(ctx *gin.Context) (auth.AccessClaims, int64, bool) {
	claims, ok := handler.authorize(ctx)
	if !ok {
		return auth.AccessClaims{}, 0, false
	}

	id, err := strconv.ParseInt(ctx.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return auth.AccessClaims{}, 0, false
	}
	return claims, id, true
}

func writeFileError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", ctx.GetHeader("X-Request-Id")))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
	}
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}

func canUploadUsage(claims auth.AccessClaims, usage string) bool {
	if usage == "user_avatar" && claims.UserID > 0 {
		return true
	}
	return containsPermission(claims.Permissions, "file:upload")
}

type fileMetadata struct {
	mimeType string
	fileSize int64
	checksum string
}

func readFileMetadata(header *multipart.FileHeader) (fileMetadata, error) {
	file, err := header.Open()
	if err != nil {
		return fileMetadata{}, err
	}
	defer file.Close()

	hasher := sha256.New()
	head := make([]byte, 512)
	readCount, err := file.Read(head)
	if err != nil && err != io.EOF {
		return fileMetadata{}, err
	}
	if readCount > 0 {
		if _, err := hasher.Write(head[:readCount]); err != nil {
			return fileMetadata{}, err
		}
	}

	remaining, err := io.Copy(hasher, file)
	if err != nil {
		return fileMetadata{}, err
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" && readCount > 0 {
		mimeType = http.DetectContentType(head[:readCount])
	}

	fileSize := header.Size
	if fileSize <= 0 {
		fileSize = int64(readCount) + remaining
	}

	return fileMetadata{
		mimeType: mimeType,
		fileSize: fileSize,
		checksum: hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}
