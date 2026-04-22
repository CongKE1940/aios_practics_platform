CREATE TABLE import_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  import_type VARCHAR(32) NOT NULL,
  template_version VARCHAR(32) NOT NULL,
  file_asset_id BIGINT NULL,
  file_url VARCHAR(500) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  error_summary TEXT NULL,
  operator_id BIGINT NOT NULL,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_import_jobs_tenant_type_status (tenant_id, import_type, status),
  KEY idx_import_jobs_operator_created (operator_id, created_at),
  CONSTRAINT fk_import_jobs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_import_jobs_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_import_jobs_file_asset FOREIGN KEY (file_asset_id) REFERENCES file_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE import_job_rows (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id BIGINT NOT NULL,
  row_no INT NOT NULL,
  raw_data_json JSON NOT NULL,
  normalized_data_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  target_entity_type VARCHAR(32) NULL,
  target_entity_id BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_import_job_rows_job_row (job_id, row_no),
  KEY idx_import_job_rows_job_status (job_id, status),
  CONSTRAINT fk_import_job_rows_job FOREIGN KEY (job_id) REFERENCES import_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

