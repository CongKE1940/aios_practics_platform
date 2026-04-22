# 刷题软件完整 MySQL DDL 文档 v1

> 适用范围：项目一期（网页端），并为 iOS / Android / Pad 预留扩展性  
> 技术栈约束：后端 Go、数据库 MySQL 8、缓存 Redis  
> 设计依据：基于原始需求文档补齐 RBAC、题库下发、题目版本、练题/考试分离、通知、导入、审计、历史快照等核心结构。

---

## 1. 文档说明

本 DDL 文档目标：

1. 给出一期可直接落库的 **MySQL 8** 建模方案。
2. 优先保证：
   - 多租户与层级隔离
   - 管理端 RBAC
   - 题库下发而非复制
   - 题目版本化
   - 练题与考试分离
   - 学生/教师历史流转可追溯
3. 保留二期主观题扩展位，但不在一期过度实现。

### 1.1 命名约定

- 所有主键统一使用 `BIGINT`
- 时间字段统一使用 `DATETIME(3)`
- 逻辑删除统一使用 `deleted_at`
- 状态字段统一使用 `VARCHAR(32)`，不使用 MySQL ENUM，便于后续扩展
- JSON 扩展字段统一使用 `JSON`
- 字符集统一：`utf8mb4`

### 1.2 执行建议

- 先在开发环境执行
- 所有外键在大批量导入时可按迁移计划后置
- 大表索引按业务压测后微调
- 不建议直接把本文档一把梭执行到生产，建议先拆为 migration

---

## 2. 建库与基础设置

```sql
CREATE DATABASE IF NOT EXISTS question_system
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE question_system;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
```

---

## 3. 基础域 DDL

## 3.1 tenants

```sql
CREATE TABLE tenants (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  tenant_type VARCHAR(32) NOT NULL DEFAULT 'school', -- platform/school/organization
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_tenants_code (code),
  KEY idx_tenants_type_status (tenant_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 系统初始化必须创建 `code=platform` 的平台级虚拟租户。系统管理员、全局角色、全局菜单、全局权限、平台公告和系统级审计均归属该虚拟租户，不再使用 `tenant_id = NULL` 表达全局数据。

## 3.2 schools

```sql
CREATE TABLE schools (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_schools_tenant_code (tenant_id, code),
  KEY idx_schools_tenant_status (tenant_id, status),
  CONSTRAINT fk_schools_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 3.3 grades

```sql
CREATE TABLE grades (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  grade_level INT NOT NULL,
  school_year VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_grades_school_code (school_id, code),
  KEY idx_grades_tenant_school (tenant_id, school_id),
  KEY idx_grades_level (grade_level),
  CONSTRAINT fk_grades_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_grades_school FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 3.4 classes

```sql
CREATE TABLE classes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  class_no INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_classes_grade_code (grade_id, code),
  KEY idx_classes_tenant_school_grade (tenant_id, school_id, grade_id),
  CONSTRAINT fk_classes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_classes_school FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT fk_classes_grade FOREIGN KEY (grade_id) REFERENCES grades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 3.5 courses

```sql
CREATE TABLE courses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  start_at DATETIME(3) NULL,
  end_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_courses_tenant_code (tenant_id, code),
  KEY idx_courses_tenant_status (tenant_id, status),
  KEY idx_courses_time_range (tenant_id, start_at, end_at),
  CONSTRAINT fk_courses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 3.6 org_nodes

> 用于统一表达学校 / 年级 / 班级等层级树，支持数据范围控制。

```sql
CREATE TABLE org_nodes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  node_type VARCHAR(32) NOT NULL, -- school/grade/class
  node_id BIGINT NOT NULL,
  parent_node_id BIGINT NULL,
  path VARCHAR(1024) NOT NULL,
  depth INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_org_nodes_tenant_type_id (tenant_id, node_type, node_id),
  KEY idx_org_nodes_parent (parent_node_id),
  KEY idx_org_nodes_path (path(255)),
  CONSTRAINT fk_org_nodes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_org_nodes_parent FOREIGN KEY (parent_node_id) REFERENCES org_nodes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. 用户与身份域 DDL

## 4.1 users

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  username VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(128) NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  user_type VARCHAR(32) NOT NULL, -- sys_admin/school_admin/teacher/student
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uk_users_tenant_username (tenant_id, username),
  UNIQUE KEY uk_users_tenant_phone (tenant_id, phone),
  UNIQUE KEY uk_users_tenant_email (tenant_id, email),
  KEY idx_users_tenant_status (tenant_id, status),
  KEY idx_users_type (user_type),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4.2 student_profiles

```sql
CREATE TABLE student_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  student_no VARCHAR(64) NULL,
  enrollment_status VARCHAR(32) NOT NULL DEFAULT 'active',
  entered_at DATETIME(3) NULL,
  graduated_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_student_profiles_user (user_id),
  UNIQUE KEY uk_student_profiles_tenant_no (tenant_id, student_no),
  KEY idx_student_profiles_school_status (school_id, enrollment_status),
  CONSTRAINT fk_student_profiles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_student_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_student_profiles_school FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4.3 teacher_profiles

```sql
CREATE TABLE teacher_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  teacher_no VARCHAR(64) NULL,
  employment_status VARCHAR(32) NOT NULL DEFAULT 'active',
  hired_at DATETIME(3) NULL,
  left_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_teacher_profiles_user (user_id),
  UNIQUE KEY uk_teacher_profiles_tenant_no (tenant_id, teacher_no),
  KEY idx_teacher_profiles_school_status (school_id, employment_status),
  CONSTRAINT fk_teacher_profiles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_teacher_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_teacher_profiles_school FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4.4 student_class_memberships

```sql
CREATE TABLE student_class_memberships (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active/transferred/graduated/left
  joined_at DATETIME(3) NOT NULL,
  left_at DATETIME(3) NULL,
  created_by BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_scm_student_current (student_id, is_current, status),
  KEY idx_scm_class_current (class_id, is_current, status),
  KEY idx_scm_grade_current (grade_id, is_current, status),
  CONSTRAINT fk_scm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_scm_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_scm_school FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT fk_scm_grade FOREIGN KEY (grade_id) REFERENCES grades(id),
  CONSTRAINT fk_scm_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_scm_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 注意：MySQL 无法直接通过部分唯一索引强约束“同一学生只能有一条 current=1 记录”，建议在应用层 + 事务控制实现。

## 4.5 teacher_class_course_assignments

```sql
CREATE TABLE teacher_class_course_assignments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active/replaced/ended
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_tcca_teacher_current (teacher_id, is_current, status),
  KEY idx_tcca_class_course_current (class_id, course_id, is_current, status),
  CONSTRAINT fk_tcca_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_tcca_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_tcca_school FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT fk_tcca_grade FOREIGN KEY (grade_id) REFERENCES grades(id),
  CONSTRAINT fk_tcca_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_tcca_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 约束规则：同一个班级同一课程同一时刻只允许一个有效教师任教。建议通过服务层事务保证。

---

## 5. RBAC 权限域 DDL

## 5.1 roles

```sql
CREATE TABLE roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  role_type VARCHAR(32) NOT NULL DEFAULT 'builtin', -- builtin/custom
  data_scope_type VARCHAR(32) NOT NULL DEFAULT 'self', -- all/tenant/subtree/self/custom
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_roles_tenant_code (tenant_id, code),
  KEY idx_roles_tenant_status (tenant_id, status),
  CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5.2 permissions

```sql
CREATE TABLE permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(128) NOT NULL,
  module VARCHAR(64) NOT NULL,
  action_name VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NULL,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_permissions_code (code),
  KEY idx_permissions_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5.3 menus

```sql
CREATE TABLE menus (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  parent_id BIGINT NULL,
  name VARCHAR(128) NOT NULL,
  menu_type VARCHAR(32) NOT NULL, -- catalog/menu/button
  path VARCHAR(255) NULL,
  component VARCHAR(255) NULL,
  icon VARCHAR(64) NULL,
  permission_code VARCHAR(128) NULL,
  visible TINYINT(1) NOT NULL DEFAULT 1,
  sort_no INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_menus_parent_sort (parent_id, sort_no),
  CONSTRAINT fk_menus_parent FOREIGN KEY (parent_id) REFERENCES menus(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5.4 user_roles

```sql
CREATE TABLE user_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  effective_from DATETIME(3) NULL,
  effective_to DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_user_roles_user_role (user_id, role_id),
  KEY idx_user_roles_tenant_user (tenant_id, user_id),
  CONSTRAINT fk_user_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5.5 role_permissions

```sql
CREATE TABLE role_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_role_permissions (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5.6 role_menu_permissions

```sql
CREATE TABLE role_menu_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT NOT NULL,
  menu_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_role_menu_permissions (role_id, menu_id),
  CONSTRAINT fk_role_menu_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_role_menu_permissions_menu FOREIGN KEY (menu_id) REFERENCES menus(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5.7 data_scopes

```sql
CREATE TABLE data_scopes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT NOT NULL,
  scope_type VARCHAR(32) NOT NULL, -- tenant/org_node/school/grade/class/self/custom
  target_id BIGINT NULL,
  include_children TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_data_scopes_role_scope (role_id, scope_type),
  CONSTRAINT fk_data_scopes_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. 题库与题目域 DDL

## 6.1 question_banks

```sql
CREATE TABLE question_banks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_org_type VARCHAR(32) NOT NULL, -- system/school/grade/class/teacher
  owner_org_id BIGINT NOT NULL,
  creator_id BIGINT NOT NULL,
  course_id BIGINT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft/active/archived
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual', -- manual/import/delegated
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_question_banks_tenant_status (tenant_id, status),
  KEY idx_question_banks_owner (owner_org_type, owner_org_id),
  KEY idx_question_banks_course (course_id),
  CONSTRAINT fk_question_banks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_question_banks_creator FOREIGN KEY (creator_id) REFERENCES users(id),
  CONSTRAINT fk_question_banks_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 6.2 question_bank_visibility

```sql
CREATE TABLE question_bank_visibility (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_bank_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  grant_type VARCHAR(32) NOT NULL, -- org/class/grade/school/user/role
  target_type VARCHAR(32) NOT NULL,
  target_id BIGINT NOT NULL,
  permission_type VARCHAR(32) NOT NULL, -- view/practice/exam/manage
  inherit_to_children TINYINT(1) NOT NULL DEFAULT 0,
  granted_by BIGINT NOT NULL,
  granted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expired_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active/revoked/expired
  UNIQUE KEY uk_qbv_unique (
    question_bank_id, grant_type, target_type, target_id, permission_type
  ),
  KEY idx_qbv_target_perm_status (target_type, target_id, permission_type, status),
  KEY idx_qbv_bank_status (question_bank_id, status),
  CONSTRAINT fk_qbv_bank FOREIGN KEY (question_bank_id) REFERENCES question_banks(id),
  CONSTRAINT fk_qbv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_qbv_granted_by FOREIGN KEY (granted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 6.3 questions

```sql
CREATE TABLE questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_org_type VARCHAR(32) NOT NULL,
  owner_org_id BIGINT NOT NULL,
  question_type VARCHAR(32) NOT NULL, -- single_choice/multiple_choice/true_false/fill_blank/short_answer/essay
  difficulty VARCHAR(32) NULL,
  current_version_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft/active/disabled/archived
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual', -- manual/import/challenge_fix
  creator_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_questions_tenant_status_type (tenant_id, status, question_type),
  KEY idx_questions_owner (owner_org_type, owner_org_id),
  KEY idx_questions_current_version (current_version_id),
  CONSTRAINT fk_questions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_questions_creator FOREIGN KEY (creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 6.4 question_versions

```sql
CREATE TABLE question_versions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  content_json JSON NOT NULL,
  answer_json JSON NOT NULL,
  analysis_json JSON NULL,
  structure_hash VARCHAR(64) NOT NULL,
  change_summary VARCHAR(500) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_versions_qid_ver (question_id, version_no),
  KEY idx_question_versions_question_created (question_id, created_at),
  CONSTRAINT fk_question_versions_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 完成 `question_versions` 创建后，建议补一条外键：

```sql
ALTER TABLE questions
  ADD CONSTRAINT fk_questions_current_version
  FOREIGN KEY (current_version_id) REFERENCES question_versions(id);
```

### 6.4.1 `content_json` 建议结构

```json
{
  "stem": {
    "content_type": "text|image|mixed",
    "text": "题干文本",
    "assets": [{"url": "https://...", "type": "image"}]
  },
  "options": [
    {
      "key": "A",
      "content_type": "text|image|mixed",
      "text": "选项A",
      "assets": []
    }
  ],
  "option_order_randomizable": true,
  "ext": {}
}
```

### 6.4.2 `answer_json` 建议结构

单选：
```json
{
  "judge_mode": "by_option_key",
  "correct_keys": ["B"]
}
```

多选：
```json
{
  "judge_mode": "set_exact_match",
  "correct_keys": ["A", "C"]
}
```

判断：
```json
{
  "judge_mode": "boolean",
  "correct_value": true
}
```

> 由于需求明确支持“选项数量不固定”和“选项随机排序”，答案必须按 `option_key` 存储，不能按选项序号存储。

## 6.5 question_bank_questions

```sql
CREATE TABLE question_bank_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_bank_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_bank_questions (question_bank_id, question_id),
  KEY idx_question_bank_questions_question (question_id),
  CONSTRAINT fk_qbq_bank FOREIGN KEY (question_bank_id) REFERENCES question_banks(id),
  CONSTRAINT fk_qbq_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 6.6 tags

```sql
CREATE TABLE tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  tag_type VARCHAR(32) NOT NULL, -- system/personal
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
```

## 6.7 question_tags

```sql
CREATE TABLE question_tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_question_tags (question_id, tag_id),
  CONSTRAINT fk_question_tags_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 6.8 user_question_tags

```sql
CREATE TABLE user_question_tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_user_question_tags (user_id, question_id, tag_id),
  KEY idx_user_question_tags_user (user_id),
  CONSTRAINT fk_user_question_tags_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_question_tags_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_user_question_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 7. 题目互动域 DDL

## 7.1 question_comments

```sql
CREATE TABLE question_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  parent_comment_id BIGINT NULL,
  comment_type VARCHAR(32) NOT NULL DEFAULT 'discussion', -- discussion/note
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active/hidden/deleted
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_question_comments_question_created (question_id, created_at),
  KEY idx_question_comments_user_created (user_id, created_at),
  CONSTRAINT fk_question_comments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_question_comments_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_comments_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id),
  CONSTRAINT fk_question_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_question_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES question_comments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 7.2 question_challenges

```sql
CREATE TABLE question_challenges (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  challenger_user_id BIGINT NOT NULL,
  challenger_org_type VARCHAR(32) NOT NULL,
  challenger_org_id BIGINT NOT NULL,
  challenge_type VARCHAR(32) NOT NULL, -- wrong_answer/wrong_stem/wrong_option/typo/dispute/other
  description TEXT NOT NULL,
  attachments_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending/reviewing/accepted/rejected/merged
  assigned_to BIGINT NULL,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME(3) NULL,
  review_comment TEXT NULL,
  resolved_version_id BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_question_challenges_question_status (question_id, status),
  KEY idx_question_challenges_challenger (challenger_user_id, created_at),
  KEY idx_question_challenges_assigned_status (assigned_to, status),
  CONSTRAINT fk_question_challenges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_question_challenges_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_question_challenges_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id),
  CONSTRAINT fk_question_challenges_challenger FOREIGN KEY (challenger_user_id) REFERENCES users(id),
  CONSTRAINT fk_question_challenges_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
  CONSTRAINT fk_question_challenges_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id),
  CONSTRAINT fk_question_challenges_resolved_version FOREIGN KEY (resolved_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 8. 练题域 DDL

## 8.1 practice_sessions

```sql
CREATE TABLE practice_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  practice_mode VARCHAR(32) NOT NULL, -- sequential/random
  source_mode VARCHAR(32) NOT NULL, -- single_bank/multi_bank
  course_id BIGINT NULL,
  bank_scope_json JSON NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'in_progress', -- in_progress/completed/interrupted
  KEY idx_practice_sessions_user_status (user_id, status, started_at),
  KEY idx_practice_sessions_tenant_user (tenant_id, user_id),
  CONSTRAINT fk_practice_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_practice_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_practice_sessions_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 8.2 practice_session_questions

```sql
CREATE TABLE practice_session_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  display_order INT NOT NULL,
  presented_options_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_practice_session_questions_order (session_id, display_order),
  KEY idx_practice_session_questions_question (question_id),
  CONSTRAINT fk_psq_session FOREIGN KEY (session_id) REFERENCES practice_sessions(id),
  CONSTRAINT fk_psq_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_psq_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 8.3 practice_answers

```sql
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
  KEY idx_practice_answers_question (question_id),
  CONSTRAINT fk_practice_answers_session_question FOREIGN KEY (session_question_id) REFERENCES practice_session_questions(id),
  CONSTRAINT fk_practice_answers_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_practice_answers_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_practice_answers_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 8.4 user_question_states

```sql
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
  KEY idx_uqs_question (question_id),
  CONSTRAINT fk_uqs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_uqs_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_uqs_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_uqs_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 8.5 user_question_state_logs

```sql
CREATE TABLE user_question_state_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  source_type VARCHAR(32) NOT NULL, -- practice/exam/manual
  action_type VARCHAR(32) NOT NULL, -- wrong/mastered/confused/unmark_mastered/unmark_confused
  payload_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_uqsl_user_created (user_id, created_at),
  KEY idx_uqsl_question_created (question_id, created_at),
  CONSTRAINT fk_uqsl_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_uqsl_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 熟题只在练题场景生效，考试不能因为“熟题”而把题排除，这一点来自原始需求。

---

## 9. 考试域 DDL

## 9.1 exams

```sql
CREATE TABLE exams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_org_type VARCHAR(32) NOT NULL,
  owner_org_id BIGINT NOT NULL,
  creator_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  exam_mode VARCHAR(32) NOT NULL, -- fixed/random_assembly
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft/published/ongoing/ended/archived
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3) NOT NULL,
  duration_minutes INT NOT NULL,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  assembly_rule_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_exams_tenant_status_time (tenant_id, status, start_time, end_time),
  KEY idx_exams_owner (owner_org_type, owner_org_id),
  CONSTRAINT fk_exams_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_exams_creator FOREIGN KEY (creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.2 exam_targets

```sql
CREATE TABLE exam_targets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  target_type VARCHAR(32) NOT NULL, -- school/grade/class/user
  target_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_targets (exam_id, target_type, target_id),
  KEY idx_exam_targets_target (target_type, target_id),
  CONSTRAINT fk_exam_targets_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.3 exam_papers

```sql
CREATE TABLE exam_papers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  paper_type VARCHAR(32) NOT NULL, -- fixed/random_rule
  paper_name VARCHAR(255) NOT NULL,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_exam_papers_exam (exam_id),
  CONSTRAINT fk_exam_papers_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.4 exam_paper_question_rules

```sql
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
```

## 9.5 exam_paper_questions

```sql
CREATE TABLE exam_paper_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  paper_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  question_version_id BIGINT NOT NULL,
  score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  order_no INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_paper_questions_order (paper_id, order_no),
  UNIQUE KEY uk_exam_paper_questions_unique (paper_id, question_id, question_version_id),
  CONSTRAINT fk_epq_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id),
  CONSTRAINT fk_epq_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_epq_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.6 exam_attempts

```sql
CREATE TABLE exam_attempts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  paper_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  start_at DATETIME(3) NULL,
  submit_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'not_started', -- not_started/in_progress/submitted/timeout/absent
  objective_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  subjective_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  final_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  snapshot_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_attempts_exam_user (exam_id, user_id),
  KEY idx_exam_attempts_user_status (user_id, status),
  KEY idx_exam_attempts_exam_status (exam_id, status),
  CONSTRAINT fk_exam_attempts_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_exam_attempts_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id),
  CONSTRAINT fk_exam_attempts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_exam_attempts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.7 exam_attempt_answers

```sql
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
  judge_source VARCHAR(32) NOT NULL DEFAULT 'auto', -- auto/manual
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_exam_attempt_answers_order (attempt_id, display_order),
  KEY idx_exam_attempt_answers_attempt (attempt_id),
  KEY idx_exam_attempt_answers_question (question_id),
  CONSTRAINT fk_eaa_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_eaa_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_eaa_question_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 由于需求明确支持考试时客观题随机组卷、选择题选项随机展示，因此 `presented_options_json` 必须保留。否则无法复盘用户看到的选项顺序。

---

## 10. 通知与公告域 DDL

## 10.1 notices

```sql
CREATE TABLE notices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  notice_type VARCHAR(32) NOT NULL, -- system/school/exam/maintenance
  publisher_id BIGINT NOT NULL,
  publish_scope_type VARCHAR(32) NOT NULL, -- all/tenant/grade/class/role/user
  publish_scope_json JSON NOT NULL,
  publish_at DATETIME(3) NOT NULL,
  expire_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft/published/expired/recalled
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_notices_tenant_status_publish (tenant_id, status, publish_at),
  CONSTRAINT fk_notices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_notices_publisher FOREIGN KEY (publisher_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 10.2 notifications

```sql
CREATE TABLE notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  recipient_user_id BIGINT NOT NULL,
  category VARCHAR(32) NOT NULL, -- notice/exam/challenge/import/approval
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  source_type VARCHAR(32) NULL,
  source_id BIGINT NULL,
  read_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'unread', -- unread/read/archived
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notifications_user_status_created (recipient_user_id, status, created_at),
  CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 11. 文件资产域 DDL

## 11.1 file_assets

> 一期先定义上传和第三方 URL 转储的资产登记模型。具体 MinIO/OSS 客户端连接、桶策略、签名 URL 细节后续在部署配置中补齐。

```sql
CREATE TABLE file_assets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  uploader_id BIGINT NOT NULL,
  source_type VARCHAR(32) NOT NULL, -- upload/remote_url/import_file
  original_url VARCHAR(1000) NULL,
  original_filename VARCHAR(255) NULL,
  object_key VARCHAR(500) NOT NULL,
  public_url VARCHAR(1000) NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT NULL,
  checksum VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active/pending/failed/deleted
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_file_assets_tenant_created (tenant_id, created_at),
  KEY idx_file_assets_uploader_created (uploader_id, created_at),
  KEY idx_file_assets_checksum (checksum),
  CONSTRAINT fk_file_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_file_assets_uploader FOREIGN KEY (uploader_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 12. 导入域 DDL

## 12.1 import_jobs

```sql
CREATE TABLE import_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  import_type VARCHAR(32) NOT NULL, -- question/question_bank/exam
  template_version VARCHAR(32) NOT NULL,
  file_asset_id BIGINT NULL,
  file_url VARCHAR(500) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded', -- uploaded/parsing/validating/importing/partial_success/success/failed
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  error_summary TEXT NULL,
  operator_id BIGINT NOT NULL,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_import_jobs_tenant_type_status (tenant_id, import_type, status),
  KEY idx_import_jobs_operator_created (operator_id, created_at),
  CONSTRAINT fk_import_jobs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_import_jobs_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_import_jobs_file_asset FOREIGN KEY (file_asset_id) REFERENCES file_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 12.2 import_job_rows

```sql
CREATE TABLE import_job_rows (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id BIGINT NOT NULL,
  row_no INT NOT NULL,
  raw_data_json JSON NOT NULL,
  normalized_data_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending/success/failed/skipped
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  target_entity_type VARCHAR(32) NULL,
  target_entity_id BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_import_job_rows_job_row (job_id, row_no),
  KEY idx_import_job_rows_job_status (job_id, status),
  CONSTRAINT fk_import_job_rows_job FOREIGN KEY (job_id) REFERENCES import_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 13. 审计与历史快照域 DDL

## 13.1 audit_logs

```sql
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
```

## 13.2 student_transitions

```sql
CREATE TABLE student_transitions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  transition_type VARCHAR(32) NOT NULL, -- promote/class_change/transfer_in/transfer_out/graduate/leave_school/re_enroll
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
```

## 13.3 teacher_assignment_histories

```sql
CREATE TABLE teacher_assignment_histories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  change_type VARCHAR(32) NOT NULL, -- assign/unassign/replace/transfer
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
```

## 13.4 entity_snapshots

```sql
CREATE TABLE entity_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  entity_type VARCHAR(32) NOT NULL, -- student/teacher/class/exam/question_bank
  entity_id BIGINT NOT NULL,
  snapshot_type VARCHAR(32) NOT NULL, -- event/publish/transition/daily
  snapshot_json JSON NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  trigger_event_type VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_entity_snapshots_entity_created (entity_type, entity_id, created_at),
  KEY idx_entity_snapshots_tenant_type (tenant_id, entity_type),
  CONSTRAINT fk_entity_snapshots_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 14. 初始化字典数据建议

建议初始化平台虚拟租户与系统角色：

```sql
INSERT INTO tenants (id, code, name, tenant_type, status, remark)
VALUES (1, 'platform', '平台虚拟租户', 'platform', 'active', '系统内置平台级虚拟租户')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tenant_type = VALUES(tenant_type),
  status = VALUES(status);

INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status)
VALUES
(1, 'sys_admin', '系统管理员', 'builtin', 'all', 'active');

-- 租户内置角色由租户初始化逻辑写入
```

建议初始化以下 permission 模块：

- auth
- user
- role
- menu
- permission
- school
- grade
- class
- course
- question_bank
- question
- tag
- challenge
- practice
- exam
- notice
- notification
- import
- analytics
- audit

---

## 15. 关键业务规则（必须在应用层保证）

以下规则不建议只依赖数据库完成：

1. **同一学生同一时刻只有一个 current 班级归属**
2. **同一班级同一课程同一时刻只有一个有效教师**
3. **题库下发采用 visibility，不复制题目**
4. **题目修改必须新增版本，不直接覆盖旧版本**
5. **练题答题与考试答题严格分表**
6. **熟题仅影响练题抽题**
7. **考试发布后若已生成试卷，考试记录应绑定固定版本题目**
8. **选择题答案必须按 option key 判定**
9. **考试随机选项顺序必须落 `presented_options_json`**
10. **质疑被采纳后应新建 `question_versions` 并回写 `resolved_version_id`**

---

## 16. 推荐迁移顺序

### 第一批：基础组织与用户
1. tenants
2. schools
3. grades
4. classes
5. courses
6. org_nodes
7. users
8. student_profiles
9. teacher_profiles

### 第二批：权限
10. roles
11. permissions
12. menus
13. user_roles
14. role_permissions
15. role_menu_permissions
16. data_scopes

### 第三批：教学关系与历史
17. student_class_memberships
18. teacher_class_course_assignments
19. student_transitions
20. teacher_assignment_histories

### 第四批：题库题目
21. question_banks
22. questions
23. question_versions
24. questions.current_version_id 外键
25. question_bank_visibility
26. question_bank_questions
27. tags
28. question_tags
29. user_question_tags

### 第五批：互动与导入
30. question_comments
31. question_challenges
32. file_assets
33. import_jobs
34. import_job_rows

### 第六批：练题考试
35. practice_sessions
36. practice_session_questions
37. practice_answers
38. user_question_states
39. user_question_state_logs
40. exams
41. exam_targets
42. exam_papers
43. exam_paper_question_rules
44. exam_paper_questions
45. exam_attempts
46. exam_attempt_answers

### 第七批：通知与审计
47. notices
48. notifications
49. audit_logs
50. entity_snapshots

---

## 17. 建议拆分的 migration 文件

建议拆分为如下文件：

```text
001_init_tenants.sql
002_org_structure.sql
003_users_profiles.sql
004_rbac.sql
005_teaching_relationships.sql
006_question_banks.sql
007_questions_versions.sql
008_tags_comments_challenges.sql
009_practice.sql
010_exams.sql
011_notices_notifications.sql
012_file_assets.sql
013_import_jobs.sql
014_audit_and_snapshots.sql
015_seed_platform_roles_permissions.sql
```

---

## 18. 需要 AI 继续补的内容

这份文档已经可以作为 DDL 基线，但下一步还建议让 AI 继续补：

1. **OpenAPI 3.0 文档**
2. **Go struct / GORM 或 sqlc 模型**
3. **初始化权限与菜单数据**
4. **导入模板字段映射**
5. **随机组卷算法说明**
6. **统计分析口径文档**
7. **挑战审核流状态机 API**

---

## 19. 收尾

```sql
SET FOREIGN_KEY_CHECKS = 1;
```

> 本文档用于一期数据库结构设计基线。对于高并发统计、搜索、推荐、复杂报表，可在二期引入 ES、OLAP 或 CQRS 读模型，但一期不建议过早复杂化。

