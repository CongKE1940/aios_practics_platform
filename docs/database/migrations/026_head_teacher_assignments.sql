ALTER TABLE teacher_assignment_histories
  ADD COLUMN assignment_type VARCHAR(32) NOT NULL DEFAULT 'course_teacher' AFTER course_id,
  MODIFY COLUMN course_id BIGINT NULL;

CREATE TABLE class_head_teacher_assignments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chta_teacher_current (teacher_id, is_current, status),
  KEY idx_chta_class_current (class_id, is_current, status),
  CONSTRAINT fk_chta_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_chta_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_chta_school FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT fk_chta_grade FOREIGN KEY (grade_id) REFERENCES grades(id),
  CONSTRAINT fk_chta_class FOREIGN KEY (class_id) REFERENCES classes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
