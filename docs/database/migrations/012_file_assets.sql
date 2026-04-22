CREATE TABLE file_assets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  uploader_id BIGINT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  original_url VARCHAR(1000) NULL,
  original_filename VARCHAR(255) NULL,
  object_key VARCHAR(500) NOT NULL,
  public_url VARCHAR(1000) NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT NULL,
  checksum VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_file_assets_tenant_created (tenant_id, created_at),
  KEY idx_file_assets_uploader_created (uploader_id, created_at),
  KEY idx_file_assets_checksum (checksum),
  CONSTRAINT fk_file_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_file_assets_uploader FOREIGN KEY (uploader_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

