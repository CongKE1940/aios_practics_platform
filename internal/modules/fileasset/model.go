package fileasset

import (
	"context"
	"errors"
	"io"
	"time"
)

const (
	CodeInvalidInput = 40000
	CodeForbidden    = 40300
	CodeNotFound     = 40400

	SourceTypeUpload    = "upload"
	SourceTypeRemoteURL = "remote_url"
	StatusActive        = "active"
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrNotFound     = errors.New("resource not found")
)

type FileAsset struct {
	ID               int64     `json:"id"`
	TenantID         int64     `json:"tenant_id,omitempty"`
	UploaderID       int64     `json:"uploader_id,omitempty"`
	SourceType       string    `json:"source_type"`
	OriginalURL      string    `json:"original_url,omitempty"`
	OriginalFilename string    `json:"original_filename,omitempty"`
	ObjectKey        string    `json:"object_key"`
	URL              string    `json:"url,omitempty"`
	MimeType         string    `json:"mime_type,omitempty"`
	FileSize         int64     `json:"file_size,omitempty"`
	Checksum         string    `json:"checksum,omitempty"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"created_at,omitempty"`
}

type UploadInput struct {
	Usage            string
	OriginalFilename string
	MimeType         string
	FileSize         int64
	Checksum         string
	Content          io.Reader
}

type SaveOptions struct {
	MimeType string
	FileSize int64
}

type ImportURLInput struct {
	URL   string `json:"url" binding:"required,url"`
	Usage string `json:"usage" binding:"required"`
}

type Repository interface {
	Create(ctx context.Context, asset FileAsset) (FileAsset, error)
	GetByID(ctx context.Context, tenantID int64, id int64) (FileAsset, error)
}

type ContentStore interface {
	Save(ctx context.Context, objectKey string, content io.Reader, options SaveOptions) error
	Open(ctx context.Context, objectKey string) (io.ReadCloser, error)
}

type PublicURLProvider interface {
	PublicURL(objectKey string) string
}
