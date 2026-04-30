CREATE TABLE question_course_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_course_bindings (question_id, course_id),
  KEY idx_qcb_tenant_course (tenant_id, course_id),
  CONSTRAINT fk_qcb_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_qcb_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_qcb_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE exams
  ADD COLUMN paper_id BIGINT NULL AFTER total_score,
  ADD KEY idx_exams_paper (paper_id),
  ADD CONSTRAINT fk_exams_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id);

ALTER TABLE exam_papers
  DROP FOREIGN KEY fk_exam_papers_exam;

ALTER TABLE exam_papers
  MODIFY exam_id BIGINT NULL,
  ADD COLUMN tenant_id BIGINT NULL AFTER id,
  ADD COLUMN creator_id BIGINT NULL AFTER exam_id,
  ADD COLUMN source_type VARCHAR(32) NOT NULL DEFAULT 'manual' AFTER paper_name,
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'draft' AFTER source_type,
  ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at,
  ADD KEY idx_exam_papers_tenant_status (tenant_id, status),
  ADD KEY idx_exam_papers_creator (creator_id),
  ADD CONSTRAINT fk_exam_papers_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  ADD CONSTRAINT fk_exam_papers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  ADD CONSTRAINT fk_exam_papers_creator FOREIGN KEY (creator_id) REFERENCES users(id);

UPDATE exam_papers ep
JOIN exams e ON e.id = ep.exam_id
SET ep.tenant_id = e.tenant_id,
    ep.creator_id = e.creator_id,
    ep.status = 'published';

UPDATE exams e
JOIN (
  SELECT exam_id, MAX(id) AS paper_id
  FROM exam_papers
  WHERE exam_id IS NOT NULL
  GROUP BY exam_id
) ep ON ep.exam_id = e.id
SET e.paper_id = ep.paper_id;
