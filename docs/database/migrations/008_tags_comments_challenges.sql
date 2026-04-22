CREATE TABLE tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  tag_type VARCHAR(32) NOT NULL,
  owner_user_id BIGINT NULL,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NULL,
  color VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_tags_tenant_type_owner_name (tenant_id, tag_type, owner_user_id, name),
  KEY idx_tags_tenant_type_status (tenant_id, tag_type, status),
  CONSTRAINT fk_tags_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_tags_owner_user FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE question_tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_tags (question_id, tag_id),
  CONSTRAINT fk_question_tags_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_question_tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_user_question_tags (user_id, question_id, tag_id),
  CONSTRAINT fk_user_question_tags_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_question_tags_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_user_question_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE question_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  parent_comment_id BIGINT NULL,
  comment_type VARCHAR(32) NOT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_question_comments_question_created (question_id, created_at),
  CONSTRAINT fk_question_comments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_question_comments_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_comments_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id),
  CONSTRAINT fk_question_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_question_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES question_comments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE question_challenges (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  challenger_user_id BIGINT NOT NULL,
  challenger_org_type VARCHAR(32) NOT NULL,
  challenger_org_id BIGINT NOT NULL,
  challenge_type VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  attachments_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  assigned_to BIGINT NULL,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME(3) NULL,
  review_comment TEXT NULL,
  resolved_version_id BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_question_challenges_status_created (tenant_id, status, created_at),
  CONSTRAINT fk_question_challenges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_question_challenges_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_challenges_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id),
  CONSTRAINT fk_question_challenges_challenger FOREIGN KEY (challenger_user_id) REFERENCES users(id),
  CONSTRAINT fk_question_challenges_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
  CONSTRAINT fk_question_challenges_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id),
  CONSTRAINT fk_question_challenges_resolved_version FOREIGN KEY (resolved_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

