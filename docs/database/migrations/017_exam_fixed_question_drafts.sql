CREATE TABLE exam_fixed_question_drafts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  display_order INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_fixed_question_drafts_order (exam_id, display_order),
  UNIQUE KEY uk_exam_fixed_question_drafts_question (exam_id, question_id, question_version_id),
  CONSTRAINT fk_efqd_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_efqd_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_efqd_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
