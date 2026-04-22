CREATE TABLE practice_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  practice_mode VARCHAR(32) NOT NULL,
  source_mode VARCHAR(32) NOT NULL,
  course_id BIGINT NULL,
  bank_scope_json JSON NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  KEY idx_practice_sessions_tenant_user (tenant_id, user_id),
  KEY idx_practice_sessions_user_status (user_id, status, started_at),
  CONSTRAINT fk_practice_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_practice_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_practice_sessions_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE practice_session_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  display_order INT NOT NULL,
  presented_options_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_psq_session_order (session_id, display_order),
  CONSTRAINT fk_psq_session FOREIGN KEY (session_id) REFERENCES practice_sessions(id),
  CONSTRAINT fk_psq_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_psq_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE practice_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_question_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  answer_json JSON NOT NULL,
  is_correct TINYINT(1) NOT NULL,
  answered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_practice_answers_user_answered (user_id, answered_at),
  CONSTRAINT fk_practice_answers_session_question FOREIGN KEY (session_question_id) REFERENCES practice_session_questions(id),
  CONSTRAINT fk_practice_answers_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_practice_answers_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_practice_answers_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_question_states (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  practice_correct_count INT NOT NULL DEFAULT 0,
  practice_wrong_count INT NOT NULL DEFAULT 0,
  exam_wrong_count INT NOT NULL DEFAULT 0,
  is_mastered TINYINT(1) NOT NULL DEFAULT 0,
  mastered_at DATETIME(3) NULL,
  is_confused TINYINT(1) NOT NULL DEFAULT 0,
  confused_at DATETIME(3) NULL,
  last_wrong_at DATETIME(3) NULL,
  last_answer_json JSON NULL,
  last_result VARCHAR(32) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_user_question_states_user_question (user_id, question_id),
  KEY idx_uqs_user_mastered_confused (user_id, is_mastered, is_confused, updated_at),
  CONSTRAINT fk_uqs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_uqs_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_uqs_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_uqs_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_question_state_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_uqsl_user_created (user_id, created_at),
  CONSTRAINT fk_uqsl_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_uqsl_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

