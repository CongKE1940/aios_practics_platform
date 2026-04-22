-- MySQL 8 draft schema for quiz system
CREATE DATABASE IF NOT EXISTS quiz_system DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE quiz_system;

CREATE TABLE tenants (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  parent_id BIGINT NULL,
  tenant_type VARCHAR(32) NOT NULL COMMENT 'system/school/organization',
  tenant_name VARCHAR(128) NOT NULL,
  tenant_code VARCHAR(64) NOT NULL UNIQUE,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_no VARCHAR(64) NOT NULL,
  user_type VARCHAR(32) NOT NULL COMMENT 'system_admin/school_admin/teacher/student',
  real_name VARCHAR(64) NOT NULL,
  mobile VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tenant_user_no (tenant_id, user_no)
);

CREATE TABLE grades (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  grade_name VARCHAR(64) NOT NULL,
  entry_year INT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE classes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  class_name VARCHAR(64) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE courses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  course_name VARCHAR(64) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE class_course_teachers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  teacher_user_id BIGINT NOT NULL,
  UNIQUE KEY uk_class_course (class_id, course_id)
);

CREATE TABLE student_class_relations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  relation_status VARCHAR(32) NOT NULL COMMENT 'active/transferred/graduated/left_school',
  effective_from DATETIME NOT NULL,
  effective_to DATETIME NULL,
  snapshot_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE question_banks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  owner_scope_type VARCHAR(32) NOT NULL COMMENT 'system/school/grade/class/personal',
  owner_scope_id BIGINT NULL,
  course_id BIGINT NULL,
  bank_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  bank_id BIGINT NOT NULL,
  course_id BIGINT NULL,
  question_type VARCHAR(32) NOT NULL COMMENT 'single_choice/multiple_choice/true_false/future_subjective',
  stem_type VARCHAR(16) NOT NULL COMMENT 'text/image',
  stem_content TEXT NOT NULL,
  analysis_text TEXT NULL,
  difficulty VARCHAR(16) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE question_options (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  option_key VARCHAR(16) NOT NULL,
  content_type VARCHAR(16) NOT NULL COMMENT 'text/image',
  content_value TEXT NOT NULL,
  sort_order INT NOT NULL,
  is_correct TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_question_option_key (question_id, option_key)
);

CREATE TABLE tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  tag_type VARCHAR(16) NOT NULL COMMENT 'system/personal',
  owner_user_id BIGINT NULL,
  tag_name VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_tag_relations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  UNIQUE KEY uk_question_tag (question_id, tag_id)
);

CREATE TABLE practice_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  mode VARCHAR(16) NOT NULL COMMENT 'sequential/random',
  source_scope VARCHAR(16) NOT NULL COMMENT 'single_bank/multi_bank',
  session_status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL
);

CREATE TABLE practice_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  answer_json JSON NOT NULL,
  is_correct TINYINT NOT NULL,
  mark_type VARCHAR(16) NULL COMMENT 'mastered/wrong/confused',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  title VARCHAR(128) NOT NULL,
  course_id BIGINT NULL,
  creator_user_id BIGINT NOT NULL,
  duration_minutes INT NOT NULL,
  total_score DECIMAL(8,2) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  exam_status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE exam_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  question_type VARCHAR(32) NOT NULL,
  score_per_question DECIMAL(8,2) NOT NULL,
  question_count INT NOT NULL,
  knowledge_tag_id BIGINT NULL,
  required_count_in_tag INT NULL
);

CREATE TABLE exam_papers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  paper_snapshot JSON NOT NULL,
  submit_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  total_score DECIMAL(8,2) NULL,
  submitted_at DATETIME NULL
);

CREATE TABLE question_challenges (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  submitter_user_id BIGINT NOT NULL,
  submitter_scope_tenant_id BIGINT NOT NULL,
  challenge_type VARCHAR(32) NOT NULL COMMENT 'questioning/correction',
  content TEXT NOT NULL,
  attachment_urls JSON NULL,
  review_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reviewer_user_id BIGINT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  snapshot_type VARCHAR(32) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT NOT NULL,
  snapshot_payload JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
