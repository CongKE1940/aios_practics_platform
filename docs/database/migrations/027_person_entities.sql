CREATE TABLE students (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  student_no VARCHAR(64) NULL,
  enrollment_status VARCHAR(32) NOT NULL DEFAULT 'active',
  entered_at DATETIME(3) NULL,
  graduated_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_students_tenant_code (tenant_id, code),
  UNIQUE KEY uk_students_user (user_id),
  UNIQUE KEY uk_students_tenant_no (tenant_id, student_no),
  KEY idx_students_school_status (school_id, enrollment_status, status),
  CONSTRAINT fk_students_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_students_school FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teachers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  teacher_no VARCHAR(64) NULL,
  employment_status VARCHAR(32) NOT NULL DEFAULT 'active',
  hired_at DATETIME(3) NULL,
  left_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_teachers_tenant_code (tenant_id, code),
  UNIQUE KEY uk_teachers_user (user_id),
  UNIQUE KEY uk_teachers_tenant_no (tenant_id, teacher_no),
  KEY idx_teachers_school_status (school_id, employment_status, status),
  CONSTRAINT fk_teachers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_teachers_school FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO students (id, tenant_id, code, user_id, school_id, student_no, enrollment_status, entered_at, graduated_at, status, created_at, updated_at)
SELECT sp.user_id,
       sp.tenant_id,
       COALESCE(NULLIF(sp.student_no, ''), CONCAT('STU', sp.user_id)),
       sp.user_id,
       sp.school_id,
       sp.student_no,
       sp.enrollment_status,
       sp.entered_at,
       sp.graduated_at,
       CASE WHEN u.status = 'active' THEN 'active' ELSE 'disabled' END,
       sp.created_at,
       sp.updated_at
FROM student_profiles sp
JOIN users u ON u.id = sp.user_id
WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = sp.user_id);

INSERT INTO teachers (id, tenant_id, code, user_id, school_id, teacher_no, employment_status, hired_at, left_at, status, created_at, updated_at)
SELECT tp.user_id,
       tp.tenant_id,
       COALESCE(NULLIF(tp.teacher_no, ''), CONCAT('TCH', tp.user_id)),
       tp.user_id,
       tp.school_id,
       tp.teacher_no,
       tp.employment_status,
       tp.hired_at,
       tp.left_at,
       CASE WHEN u.status = 'active' THEN 'active' ELSE 'disabled' END,
       tp.created_at,
       tp.updated_at
FROM teacher_profiles tp
JOIN users u ON u.id = tp.user_id
WHERE NOT EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = tp.user_id);

INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark)
SELECT t.id, 'student', '学生', 'builtin', 'self', 'active', '系统内置学生角色'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.code = 'student');

INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark)
SELECT t.id, 'teacher', '教师', 'builtin', 'self', 'active', '系统内置教师角色'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.code = 'teacher');

INSERT INTO user_roles (tenant_id, user_id, role_id)
SELECT u.tenant_id, u.id, r.id
FROM users u
JOIN roles r ON r.tenant_id = u.tenant_id AND r.code = u.user_type
WHERE u.user_type IN ('student', 'teacher')
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.tenant_id = u.tenant_id AND ur.user_id = u.id AND ur.role_id = r.id
  );
