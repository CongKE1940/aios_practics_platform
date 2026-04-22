package fileasset

import (
	"context"
	"database/sql"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) Create(ctx context.Context, asset FileAsset) (FileAsset, error) {
	result, err := repo.db.ExecContext(
		ctx,
		`INSERT INTO file_assets (tenant_id, uploader_id, source_type, original_url, original_filename, object_key, public_url, mime_type, file_size, checksum, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		asset.TenantID,
		asset.UploaderID,
		asset.SourceType,
		nullString(asset.OriginalURL),
		nullString(asset.OriginalFilename),
		asset.ObjectKey,
		nullString(asset.URL),
		nullString(asset.MimeType),
		nullInt64(asset.FileSize),
		nullString(asset.Checksum),
		asset.Status,
	)
	if err != nil {
		return FileAsset{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return FileAsset{}, err
	}
	return repo.GetByID(ctx, asset.TenantID, id)
}

func (repo *MySQLRepository) GetByID(ctx context.Context, tenantID int64, id int64) (FileAsset, error) {
	row := repo.db.QueryRowContext(
		ctx,
		`SELECT id, tenant_id, uploader_id, source_type, original_url, original_filename, object_key, public_url, mime_type, file_size, checksum, status, created_at FROM file_assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
		id,
		tenantID,
	)

	asset, err := scanFileAsset(row)
	if err != nil {
		return FileAsset{}, wrapNotFound(err)
	}
	return asset, nil
}

func scanFileAsset(scanner interface{ Scan(dest ...any) error }) (FileAsset, error) {
	var asset FileAsset
	var originalURL sql.NullString
	var originalFilename sql.NullString
	var publicURL sql.NullString
	var mimeType sql.NullString
	var fileSize sql.NullInt64
	var checksum sql.NullString

	err := scanner.Scan(
		&asset.ID,
		&asset.TenantID,
		&asset.UploaderID,
		&asset.SourceType,
		&originalURL,
		&originalFilename,
		&asset.ObjectKey,
		&publicURL,
		&mimeType,
		&fileSize,
		&checksum,
		&asset.Status,
		&asset.CreatedAt,
	)
	if err != nil {
		return FileAsset{}, err
	}
	if originalURL.Valid {
		asset.OriginalURL = originalURL.String
	}
	if originalFilename.Valid {
		asset.OriginalFilename = originalFilename.String
	}
	if publicURL.Valid {
		asset.URL = publicURL.String
	}
	if mimeType.Valid {
		asset.MimeType = mimeType.String
	}
	if fileSize.Valid {
		asset.FileSize = fileSize.Int64
	}
	if checksum.Valid {
		asset.Checksum = checksum.String
	}
	return asset, nil
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullInt64(value int64) any {
	if value <= 0 {
		return nil
	}
	return value
}

func wrapNotFound(err error) error {
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}
