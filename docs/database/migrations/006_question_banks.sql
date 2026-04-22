CREATE TABLE question_banks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_org_type VARCHAR(32) NOT NULL,
  owner_org_id BIGINT NOT NULL,
  creator_id BIGINT NOT NULL,
  course_id BIGINT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_question_banks_tenant_status (tenant_id, status),
  KEY idx_question_banks_owner (owner_org_type, owner_org_id),
  KEY idx_question_banks_course (course_id),
  CONSTRAINT fk_question_banks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_question_banks_creator FOREIGN KEY (creator_id) REFERENCES users(id),
  CONSTRAINT fk_question_banks_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE question_bank_visibility (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_bank_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  grant_type VARCHAR(32) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id BIGINT NOT NULL,
  permission_type VARCHAR(32) NOT NULL,
  inherit_to_children TINYINT(1) NOT NULL DEFAULT 0,
  granted_by BIGINT NOT NULL,
  granted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expired_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  UNIQUE KEY uk_qbv_unique (question_bank_id, grant_type, target_type, target_id, permission_type),
  KEY idx_qbv_target_perm_status (target_type, target_id, permission_type, status),
  KEY idx_qbv_bank_status (question_bank_id, status),
  CONSTRAINT fk_qbv_bank FOREIGN KEY (question_bank_id) REFERENCES question_banks(id),
  CONSTRAINT fk_qbv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_qbv_granted_by FOREIGN KEY (granted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

