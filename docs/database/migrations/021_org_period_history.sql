CREATE TABLE org_periods (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  target_type VARCHAR(32) NOT NULL COMMENT 'grade/class',
  target_id BIGINT NOT NULL COMMENT 'grade_id when target_type=grade, class_id when target_type=class',
  grade_id BIGINT NOT NULL,
  class_id BIGINT NULL,
  parent_period_id BIGINT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_org_periods_target_code (tenant_id, target_type, target_id, code),
  KEY idx_org_periods_target_range (tenant_id, target_type, target_id, start_at, end_at),
  KEY idx_org_periods_school_range (tenant_id, school_id, start_at, end_at),
  KEY idx_org_periods_grade_range (tenant_id, grade_id, start_at, end_at),
  KEY idx_org_periods_class_range (tenant_id, class_id, start_at, end_at),
  KEY idx_org_periods_parent (parent_period_id),
  CONSTRAINT fk_org_periods_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_org_periods_school FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT fk_org_periods_grade FOREIGN KEY (grade_id) REFERENCES grades(id),
  CONSTRAINT fk_org_periods_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_org_periods_parent FOREIGN KEY (parent_period_id) REFERENCES org_periods(id),
  CONSTRAINT chk_org_periods_target CHECK (
    (target_type = 'grade' AND target_id = grade_id AND class_id IS NULL)
    OR (target_type = 'class' AND class_id IS NOT NULL AND target_id = class_id)
  ),
  CONSTRAINT chk_org_periods_time_range CHECK (start_at < end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE student_class_memberships
  ADD KEY idx_scm_student_range (tenant_id, student_id, joined_at, left_at),
  ADD KEY idx_scm_grade_range (tenant_id, grade_id, joined_at, left_at),
  ADD KEY idx_scm_class_range (tenant_id, class_id, joined_at, left_at);
