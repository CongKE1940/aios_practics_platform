package fileasset

import (
	"context"
	"fmt"
	"io"
	neturl "net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOConfig struct {
	Endpoint        string
	PublicEndpoint  string
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	ForcePathStyle  bool
}

type MinIOContentStore struct {
	client         *minio.Client
	bucket         string
	publicEndpoint string
}

func NewMinIOContentStore(config MinIOConfig) (*MinIOContentStore, error) {
	endpoint, secure, err := normalizeMinIOEndpoint(config.Endpoint)
	if err != nil {
		return nil, err
	}
	bucket := strings.TrimSpace(config.Bucket)
	accessKeyID := strings.TrimSpace(config.AccessKeyID)
	secretAccessKey := strings.TrimSpace(config.SecretAccessKey)
	if bucket == "" || accessKeyID == "" || secretAccessKey == "" {
		return nil, ErrInvalidInput
	}

	options := &minio.Options{
		Creds:  credentials.NewStaticV4(accessKeyID, secretAccessKey, ""),
		Secure: secure,
		Region: strings.TrimSpace(config.Region),
	}
	if config.ForcePathStyle {
		options.BucketLookup = minio.BucketLookupPath
	}
	client, err := minio.New(endpoint, options)
	if err != nil {
		return nil, err
	}

	return &MinIOContentStore{
		client:         client,
		bucket:         bucket,
		publicEndpoint: strings.TrimRight(strings.TrimSpace(config.PublicEndpoint), "/"),
	}, nil
}

func (store *MinIOContentStore) Save(ctx context.Context, objectKey string, content io.Reader, options SaveOptions) error {
	if strings.TrimSpace(objectKey) == "" || content == nil {
		return ErrInvalidInput
	}
	size := options.FileSize
	if size <= 0 {
		size = -1
	}
	putOptions := minio.PutObjectOptions{ContentType: strings.TrimSpace(options.MimeType)}
	_, err := store.client.PutObject(ctx, store.bucket, objectKey, content, size, putOptions)
	return err
}

func (store *MinIOContentStore) Open(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	object, err := store.client.GetObject(ctx, store.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	if _, err := object.Stat(); err != nil {
		_ = object.Close()
		if response := minio.ToErrorResponse(err); response.Code == "NoSuchKey" || response.Code == "NoSuchBucket" {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return object, nil
}

func (store *MinIOContentStore) PublicURL(objectKey string) string {
	if store.publicEndpoint == "" || strings.TrimSpace(objectKey) == "" {
		return ""
	}
	return fmt.Sprintf("%s/%s/%s", store.publicEndpoint, escapeObjectPathSegment(store.bucket), escapeObjectPath(objectKey))
}

func normalizeMinIOEndpoint(endpoint string) (string, bool, error) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return "", false, ErrInvalidInput
	}
	if !strings.Contains(endpoint, "://") {
		return strings.TrimRight(endpoint, "/"), false, nil
	}
	parsed, err := neturl.Parse(endpoint)
	if err != nil || parsed.Host == "" {
		return "", false, ErrInvalidInput
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", false, ErrInvalidInput
	}
	return parsed.Host, parsed.Scheme == "https", nil
}

func escapeObjectPath(value string) string {
	parts := strings.Split(strings.Trim(value, "/"), "/")
	for index, part := range parts {
		parts[index] = escapeObjectPathSegment(part)
	}
	return strings.Join(parts, "/")
}

func escapeObjectPathSegment(value string) string {
	return strings.ReplaceAll(neturl.PathEscape(value), "+", "%20")
}
