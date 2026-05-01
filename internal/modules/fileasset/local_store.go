package fileasset

import (
	"context"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
)

const defaultLocalStorageDir = "data/file_assets"

type LocalContentStore struct {
	root string
}

func NewLocalContentStore(root string) *LocalContentStore {
	root = strings.TrimSpace(root)
	if root == "" {
		root = defaultLocalStorageDir
	}
	return &LocalContentStore{root: root}
}

func (store *LocalContentStore) Save(ctx context.Context, objectKey string, content io.Reader) error {
	target, err := store.resolvePath(objectKey)
	if err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}

	tmp := target + ".tmp"
	file, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, content)
	closeErr := file.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	return os.Rename(tmp, target)
}

func (store *LocalContentStore) Open(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	target, err := store.resolvePath(objectKey)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	file, err := os.Open(target)
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	return file, err
}

func (store *LocalContentStore) resolvePath(objectKey string) (string, error) {
	if strings.Contains(objectKey, `\`) {
		return "", ErrInvalidInput
	}
	clean := pathpkg.Clean(strings.TrimSpace(objectKey))
	if clean == "." || clean == ".." || pathpkg.IsAbs(clean) || strings.HasPrefix(clean, "../") {
		return "", ErrInvalidInput
	}

	rootAbs, err := filepath.Abs(store.root)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(filepath.Join(rootAbs, filepath.FromSlash(clean)))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(rootAbs, targetAbs)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", ErrInvalidInput
	}
	return targetAbs, nil
}
