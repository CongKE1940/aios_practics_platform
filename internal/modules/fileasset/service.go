package fileasset

import (
	"context"
	"fmt"
	neturl "net/url"
	"path"
	"strings"
	"time"
)

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service {
	return &Service{
		repo: repo,
		now:  time.Now,
	}
}

func (service *Service) CreateUpload(ctx context.Context, tenantID int64, uploaderID int64, input UploadInput) (FileAsset, error) {
	if !isAllowedUsage(input.Usage) || strings.TrimSpace(input.OriginalFilename) == "" || input.FileSize <= 0 {
		return FileAsset{}, ErrInvalidInput
	}

	asset, err := service.repo.Create(ctx, FileAsset{
		TenantID:         tenantID,
		UploaderID:       uploaderID,
		SourceType:       SourceTypeUpload,
		OriginalFilename: input.OriginalFilename,
		ObjectKey:        buildObjectKey(tenantID, input.Usage, input.OriginalFilename, service.now()),
		MimeType:         input.MimeType,
		FileSize:         input.FileSize,
		Checksum:         input.Checksum,
		Status:           StatusActive,
	})
	if err != nil {
		return FileAsset{}, err
	}
	return decorateAsset(asset), nil
}

func (service *Service) CreateImportURL(ctx context.Context, tenantID int64, uploaderID int64, input ImportURLInput) (FileAsset, error) {
	if !isAllowedUsage(input.Usage) {
		return FileAsset{}, ErrInvalidInput
	}
	parsed, err := neturl.ParseRequestURI(strings.TrimSpace(input.URL))
	if err != nil {
		return FileAsset{}, ErrInvalidInput
	}

	filename := path.Base(parsed.Path)
	if filename == "." || filename == "/" || filename == "" {
		filename = "imported.bin"
	}

	asset, err := service.repo.Create(ctx, FileAsset{
		TenantID:         tenantID,
		UploaderID:       uploaderID,
		SourceType:       SourceTypeRemoteURL,
		OriginalURL:      parsed.String(),
		OriginalFilename: filename,
		ObjectKey:        buildObjectKey(tenantID, input.Usage, filename, service.now()),
		Status:           StatusActive,
	})
	if err != nil {
		return FileAsset{}, err
	}
	return decorateAsset(asset), nil
}

func (service *Service) GetByID(ctx context.Context, tenantID int64, id int64) (FileAsset, error) {
	asset, err := service.repo.GetByID(ctx, tenantID, id)
	if err != nil {
		return FileAsset{}, err
	}
	return decorateAsset(asset), nil
}

func decorateAsset(asset FileAsset) FileAsset {
	if asset.URL == "" && asset.ID > 0 {
		asset.URL = fmt.Sprintf("/api/v1/files/%d/content", asset.ID)
	}
	return asset
}

func isAllowedUsage(usage string) bool {
	switch usage {
	case "question_asset", "challenge_attachment", "import_file":
		return true
	default:
		return false
	}
}

func buildObjectKey(tenantID int64, usage string, filename string, now time.Time) string {
	return fmt.Sprintf("tenant/%d/%s/%s/%s", tenantID, usage, now.Format("20060102"), sanitizeFilename(filename))
}

func sanitizeFilename(filename string) string {
	filename = path.Base(strings.TrimSpace(filename))
	if filename == "" || filename == "." || filename == "/" {
		return "asset.bin"
	}
	return strings.ReplaceAll(filename, " ", "-")
}
