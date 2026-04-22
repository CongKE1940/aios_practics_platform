CREATE TABLE exams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_org_type VARCHAR(32) NOT NULL,
  owner_org_id BIGINT NOT NULL,
  creator_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  exam_mode VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3) NOT NULL,
  duration_minutes INT NOT NULL,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  assembly_rule_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_exams_tenant_status_time (tenant_id, status, start_time, end_time),
  CONSTRAINT fk_exams_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_exams_creator FOREIGN KEY (creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_targets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_targets (exam_id, target_type, target_id),
  CONSTRAINT fk_exam_targets_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_papers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  paper_type VARCHAR(32) NOT NULL,
  paper_name VARCHAR(255) NOT NULL,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_exam_papers_exam (exam_id),
  CONSTRAINT fk_exam_papers_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_paper_question_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  paper_id BIGINT NOT NULL,
  question_type VARCHAR(32) NOT NULL,
  score_per_question DECIMAL(10,2) NOT NULL,
  question_count INT NOT NULL,
  knowledge_tag_ids_json JSON NULL,
  bank_scope_json JSON NULL,
  course_id BIGINT NULL,
  difficulty_range_json JSON NULL,
  per_knowledge_count_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_epqr_paper_type (paper_id, question_type),
  CONSTRAINT fk_epqr_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id),
  CONSTRAINT fk_epqr_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_paper_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  paper_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  order_no INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_paper_questions_order (paper_id, order_no),
  CONSTRAINT fk_epq_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id),
  CONSTRAINT fk_epq_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_epq_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_attempts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  paper_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  start_at DATETIME(3) NULL,
  submit_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'not_started',
  objective_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  subjective_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  final_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  snapshot_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_attempts_exam_user (exam_id, user_id),
  CONSTRAINT fk_exam_attempts_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_exam_attempts_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id),
  CONSTRAINT fk_exam_attempts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_exam_attempts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_attempt_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  attempt_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  display_order INT NOT NULL,
  presented_options_json JSON NULL,
  answer_json JSON NOT NULL,
  is_correct TINYINT(1) NULL,
  score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  judged_at DATETIME(3) NULL,
  judge_source VARCHAR(32) NOT NULL DEFAULT 'auto',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_attempt_answers_order (attempt_id, display_order),
  CONSTRAINT fk_eaa_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_eaa_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_eaa_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

