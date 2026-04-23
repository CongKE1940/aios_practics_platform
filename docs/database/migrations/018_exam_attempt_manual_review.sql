ALTER TABLE exam_attempt_answers
  ADD COLUMN reviewer_user_id BIGINT NULL AFTER judge_source,
  ADD COLUMN review_comment TEXT NULL AFTER reviewer_user_id,
  ADD COLUMN reviewed_at DATETIME(3) NULL AFTER review_comment,
  ADD KEY idx_exam_attempt_answers_reviewer (reviewer_user_id),
  ADD CONSTRAINT fk_eaa_reviewer_user FOREIGN KEY (reviewer_user_id) REFERENCES users(id);
