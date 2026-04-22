CREATE TABLE questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_org_type VARCHAR(32) NOT NULL,
  owner_org_id BIGINT NOT NULL,
  question_type VARCHAR(32) NOT NULL,
  difficulty VARCHAR(32) NULL,
  current_version_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
  creator_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_questions_tenant_status_type (tenant_id, status, question_type),
  KEY idx_questions_owner (owner_org_type, owner_org_id),
  KEY idx_questions_current_version (current_version_id),
  CONSTRAINT fk_questions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_questions_creator FOREIGN KEY (creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE question_versions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  content_json JSON NOT NULL,
  answer_json JSON NOT NULL,
  analysis_json JSON NULL,
  structure_hash VARCHAR(64) NOT NULL,
  change_summary VARCHAR(500) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_versions_no (question_id, version_no),
  KEY idx_question_versions_question_created (question_id, created_at),
  CONSTRAINT fk_question_versions_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE questions
  ADD CONSTRAINT fk_questions_current_version
  FOREIGN KEY (current_version_id) REFERENCES question_versions(id);

CREATE TABLE question_bank_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_bank_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_bank_questions (question_bank_id, question_id),
  CONSTRAINT fk_qbq_bank FOREIGN KEY (question_bank_id) REFERENCES question_banks(id),
  CONSTRAINT fk_qbq_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

