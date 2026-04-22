CREATE TABLE audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  operator_user_id BIGINT NULL,
  module_name VARCHAR(64) NOT NULL,
  action_name VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id BIGINT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  request_id VARCHAR(64) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  result VARCHAR(32) NOT NULL DEFAULT 'success',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_logs_module_resource_created (module_name, resource_type, resource_id, created_at),
  KEY idx_audit_logs_operator_created (operator_user_id, created_at),
  CONSTRAINT fk_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_audit_logs_operator FOREIGN KEY (operator_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE student_transitions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  transition_type VARCHAR(32) NOT NULL,
  from_school_id BIGINT NULL,
  from_grade_id BIGINT NULL,
  from_class_id BIGINT NULL,
  to_school_id BIGINT NULL,
  to_grade_id BIGINT NULL,
  to_class_id BIGINT NULL,
  occurred_at DATETIME(3) NOT NULL,
  operator_id BIGINT NOT NULL,
  remark VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_student_transitions_student_occurred (student_id, occurred_at),
  CONSTRAINT fk_student_transitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_student_transitions_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_student_transitions_from_school FOREIGN KEY (from_school_id) REFERENCES schools(id),
  CONSTRAINT fk_student_transitions_from_grade FOREIGN KEY (from_grade_id) REFERENCES grades(id),
  CONSTRAINT fk_student_transitions_from_class FOREIGN KEY (from_class_id) REFERENCES classes(id),
  CONSTRAINT fk_student_transitions_to_school FOREIGN KEY (to_school_id) REFERENCES schools(id),
  CONSTRAINT fk_student_transitions_to_grade FOREIGN KEY (to_grade_id) REFERENCES grades(id),
  CONSTRAINT fk_student_transitions_to_class FOREIGN KEY (to_class_id) REFERENCES classes(id),
  CONSTRAINT fk_student_transitions_operator FOREIGN KEY (operator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teacher_assignment_histories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  change_type VARCHAR(32) NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  operator_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_teacher_assignment_histories_teacher_from (teacher_id, effective_from),
  KEY idx_teacher_assignment_histories_class_course (class_id, course_id),
  CONSTRAINT fk_tah_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_tah_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_tah_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_tah_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_tah_operator FOREIGN KEY (operator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entity_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT NOT NULL,
  snapshot_type VARCHAR(32) NOT NULL,
  snapshot_json JSON NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  trigger_event_type VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_entity_snapshots_entity_created (entity_type, entity_id, created_at),
  KEY idx_entity_snapshots_tenant_type (tenant_id, entity_type),
  CONSTRAINT fk_entity_snapshots_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

