-- AIOS Practice Platform 最终建库基线
-- 生成日期：2026-04-30。基于当前本地开发库结构整理，并按最新试卷管理需求做规范化处理。
-- 仅用于全新开发库或测试库初始化，不包含本地业务数据、账号密码或其他敏感信息。
-- 执行前请先选择目标开发库或测试库，例如：USE aios_practice_system;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `user_roles`;
DROP TABLE IF EXISTS `user_question_tags`;
DROP TABLE IF EXISTS `user_question_states`;
DROP TABLE IF EXISTS `user_question_state_logs`;
DROP TABLE IF EXISTS `tenants`;
DROP TABLE IF EXISTS `teacher_profiles`;
DROP TABLE IF EXISTS `teacher_class_course_assignments`;
DROP TABLE IF EXISTS `teacher_assignment_histories`;
DROP TABLE IF EXISTS `class_head_teacher_assignments`;
DROP TABLE IF EXISTS `tags`;
DROP TABLE IF EXISTS `student_transitions`;
DROP TABLE IF EXISTS `student_profiles`;
DROP TABLE IF EXISTS `student_class_memberships`;
DROP TABLE IF EXISTS `schools`;
DROP TABLE IF EXISTS `roles`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `role_menu_permissions`;
DROP TABLE IF EXISTS `questions`;
DROP TABLE IF EXISTS `question_versions`;
DROP TABLE IF EXISTS `question_tags`;
DROP TABLE IF EXISTS `question_course_bindings`;
DROP TABLE IF EXISTS `question_comments`;
DROP TABLE IF EXISTS `question_challenges`;
DROP TABLE IF EXISTS `question_banks`;
DROP TABLE IF EXISTS `question_bank_visibility`;
DROP TABLE IF EXISTS `question_bank_questions`;
DROP TABLE IF EXISTS `practice_sessions`;
DROP TABLE IF EXISTS `practice_session_questions`;
DROP TABLE IF EXISTS `practice_session_question_reviews`;
DROP TABLE IF EXISTS `practice_answers`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `org_nodes`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `notices`;
DROP TABLE IF EXISTS `menus`;
DROP TABLE IF EXISTS `import_jobs`;
DROP TABLE IF EXISTS `import_job_rows`;
DROP TABLE IF EXISTS `grades`;
DROP TABLE IF EXISTS `file_assets`;
DROP TABLE IF EXISTS `exams`;
DROP TABLE IF EXISTS `exam_targets`;
DROP TABLE IF EXISTS `exam_papers`;
DROP TABLE IF EXISTS `exam_paper_questions`;
DROP TABLE IF EXISTS `exam_paper_question_rules`;
DROP TABLE IF EXISTS `exam_fixed_question_drafts`;
DROP TABLE IF EXISTS `exam_attempts`;
DROP TABLE IF EXISTS `exam_attempt_answers`;
DROP TABLE IF EXISTS `entity_snapshots`;
DROP TABLE IF EXISTS `dictionary_items`;
DROP TABLE IF EXISTS `dictionaries`;
DROP TABLE IF EXISTS `data_scopes`;
DROP TABLE IF EXISTS `courses`;
DROP TABLE IF EXISTS `classes`;
DROP TABLE IF EXISTS `audit_logs`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `operator_user_id` bigint DEFAULT NULL,
  `module_name` varchar(64) NOT NULL,
  `action_name` varchar(64) NOT NULL,
  `resource_type` varchar(64) NOT NULL,
  `resource_id` bigint DEFAULT NULL,
  `before_json` json DEFAULT NULL,
  `after_json` json DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `result` varchar(32) NOT NULL DEFAULT 'success',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_module_resource_created` (`module_name`,`resource_type`,`resource_id`,`created_at`),
  KEY `idx_audit_logs_operator_created` (`operator_user_id`,`created_at`),
  KEY `fk_audit_logs_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `classes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `class_no` int DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_classes_grade_code` (`grade_id`,`code`),
  KEY `idx_classes_tenant_school_grade` (`tenant_id`,`school_id`,`grade_id`),
  KEY `fk_classes_school` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `courses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `start_at` datetime(3) DEFAULT NULL,
  `end_at` datetime(3) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_courses_tenant_code` (`tenant_id`,`code`),
  KEY `idx_courses_tenant_status` (`tenant_id`,`status`),
  KEY `idx_courses_time_range` (`tenant_id`,`start_at`,`end_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `data_scopes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `role_id` bigint NOT NULL,
  `scope_type` varchar(32) NOT NULL,
  `target_id` bigint DEFAULT NULL,
  `include_children` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_data_scopes_role_scope` (`role_id`,`scope_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `dictionaries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dictionaries_code` (`code`),
  KEY `idx_dictionaries_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `dictionary_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `dictionary_id` bigint NOT NULL,
  `item_value` int NOT NULL,
  `item_label` varchar(128) NOT NULL,
  `sort_no` int NOT NULL DEFAULT '0',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dictionary_items_dict_value` (`dictionary_id`,`item_value`),
  KEY `idx_dictionary_items_dict_status_sort` (`dictionary_id`,`status`,`sort_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `entity_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `entity_type` varchar(32) NOT NULL,
  `entity_id` bigint NOT NULL,
  `snapshot_type` varchar(32) NOT NULL,
  `snapshot_json` json NOT NULL,
  `version_no` int NOT NULL DEFAULT '1',
  `trigger_event_type` varchar(64) DEFAULT NULL,
  `operator_user_id` bigint DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_entity_snapshots_entity_created` (`entity_type`,`entity_id`,`created_at`),
  KEY `idx_entity_snapshots_tenant_type` (`tenant_id`,`entity_type`),
  KEY `idx_entity_snapshots_operator_created` (`operator_user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_attempt_answers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `attempt_id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `display_order` int NOT NULL,
  `presented_options_json` json DEFAULT NULL,
  `answer_json` json NOT NULL,
  `is_correct` tinyint(1) DEFAULT NULL,
  `score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `judged_at` datetime(3) DEFAULT NULL,
  `judge_source` varchar(32) NOT NULL DEFAULT 'auto',
  `reviewer_user_id` bigint DEFAULT NULL,
  `review_comment` text,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exam_attempt_answers_order` (`attempt_id`,`display_order`),
  KEY `idx_eaa_tenant_attempt` (`tenant_id`,`attempt_id`),
  KEY `fk_eaa_question` (`question_id`),
  KEY `fk_eaa_question_version` (`question_version_id`),
  KEY `idx_exam_attempt_answers_reviewer` (`reviewer_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_attempts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `exam_id` bigint NOT NULL,
  `paper_id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `start_at` datetime(3) DEFAULT NULL,
  `submit_at` datetime(3) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'not_started',
  `objective_score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `subjective_score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `final_score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `snapshot_json` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exam_attempts_exam_user` (`exam_id`,`user_id`),
  KEY `fk_exam_attempts_paper` (`paper_id`),
  KEY `fk_exam_attempts_tenant` (`tenant_id`),
  KEY `fk_exam_attempts_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_fixed_question_drafts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `exam_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `display_order` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exam_fixed_question_drafts_order` (`exam_id`,`display_order`),
  UNIQUE KEY `uk_exam_fixed_question_drafts_question` (`exam_id`,`question_id`,`question_version_id`),
  KEY `fk_efqd_question` (`question_id`),
  KEY `fk_efqd_question_version` (`question_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_paper_question_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `paper_id` bigint NOT NULL,
  `question_type` varchar(32) NOT NULL,
  `score_per_question` decimal(10,2) NOT NULL,
  `question_count` int NOT NULL,
  `knowledge_tag_ids_json` json DEFAULT NULL,
  `bank_scope_json` json DEFAULT NULL,
  `course_id` bigint DEFAULT NULL,
  `difficulty_range_json` json DEFAULT NULL,
  `per_knowledge_count_json` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_epqr_paper_type` (`paper_id`,`question_type`),
  KEY `fk_epqr_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_paper_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `paper_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `order_no` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exam_paper_questions_order` (`paper_id`,`order_no`),
  KEY `fk_epq_question` (`question_id`),
  KEY `fk_epq_question_version` (`question_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_papers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `exam_id` bigint DEFAULT NULL,
  `creator_id` bigint NOT NULL,
  `paper_type` varchar(32) NOT NULL,
  `paper_name` varchar(255) NOT NULL,
  `source_type` varchar(32) NOT NULL DEFAULT 'manual',
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `total_score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_exam_papers_exam` (`exam_id`),
  KEY `idx_exam_papers_tenant_status` (`tenant_id`,`status`),
  KEY `idx_exam_papers_creator` (`creator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exam_targets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `exam_id` bigint NOT NULL,
  `target_type` varchar(32) NOT NULL,
  `target_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exam_targets` (`exam_id`,`target_type`,`target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `exams` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `owner_org_type` varchar(32) NOT NULL,
  `owner_org_id` bigint NOT NULL,
  `creator_id` bigint NOT NULL,
  `name` varchar(255) NOT NULL,
  `exam_mode` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `start_time` datetime(3) NOT NULL,
  `end_time` datetime(3) NOT NULL,
  `duration_minutes` int NOT NULL,
  `total_score` decimal(10,2) NOT NULL DEFAULT '0.00',
  `paper_id` bigint DEFAULT NULL,
  `assembly_rule_json` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_exams_tenant_status_time` (`tenant_id`,`status`,`start_time`,`end_time`),
  KEY `fk_exams_creator` (`creator_id`),
  KEY `idx_exams_paper` (`paper_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `file_assets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `uploader_id` bigint NOT NULL,
  `source_type` varchar(32) NOT NULL,
  `original_url` varchar(1000) DEFAULT NULL,
  `original_filename` varchar(255) DEFAULT NULL,
  `object_key` varchar(500) NOT NULL,
  `public_url` varchar(1000) DEFAULT NULL,
  `mime_type` varchar(128) DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `checksum` varchar(128) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_file_assets_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_file_assets_uploader_created` (`uploader_id`,`created_at`),
  KEY `idx_file_assets_checksum` (`checksum`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `grades` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `grade_level` int NOT NULL,
  `school_year` varchar(32) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grades_school_code` (`school_id`,`code`),
  KEY `idx_grades_tenant_school` (`tenant_id`,`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `import_job_rows` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `job_id` bigint NOT NULL,
  `row_no` int NOT NULL,
  `raw_data_json` json NOT NULL,
  `normalized_data_json` json DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `error_code` varchar(64) DEFAULT NULL,
  `error_message` varchar(500) DEFAULT NULL,
  `target_entity_type` varchar(32) DEFAULT NULL,
  `target_entity_id` bigint DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_import_job_rows_job_row` (`job_id`,`row_no`),
  KEY `idx_import_job_rows_job_status` (`job_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `import_jobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `import_type` varchar(32) NOT NULL,
  `template_version` varchar(32) NOT NULL,
  `file_asset_id` bigint DEFAULT NULL,
  `file_url` varchar(500) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'uploaded',
  `total_rows` int NOT NULL DEFAULT '0',
  `success_rows` int NOT NULL DEFAULT '0',
  `failed_rows` int NOT NULL DEFAULT '0',
  `error_summary` text,
  `operator_id` bigint NOT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_import_jobs_tenant_type_status` (`tenant_id`,`import_type`,`status`),
  KEY `idx_import_jobs_operator_created` (`operator_id`,`created_at`),
  KEY `fk_import_jobs_file_asset` (`file_asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `parent_id` bigint DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `menu_type` varchar(32) NOT NULL,
  `path` varchar(255) DEFAULT NULL,
  `component` varchar(255) DEFAULT NULL,
  `icon` varchar(64) DEFAULT NULL,
  `permission_code` varchar(128) DEFAULT NULL,
  `visible` tinyint(1) NOT NULL DEFAULT '1',
  `sort_no` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_menus_parent_sort` (`parent_id`,`sort_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `notice_type` varchar(32) NOT NULL,
  `publisher_id` bigint NOT NULL,
  `publish_scope_type` varchar(32) NOT NULL,
  `publish_scope_json` json NOT NULL,
  `publish_at` datetime(3) NOT NULL,
  `expire_at` datetime(3) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_notices_tenant_status_publish` (`tenant_id`,`status`,`publish_at`),
  KEY `fk_notices_publisher` (`publisher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `recipient_user_id` bigint NOT NULL,
  `category` varchar(32) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `source_type` varchar(32) DEFAULT NULL,
  `source_id` bigint DEFAULT NULL,
  `read_at` datetime(3) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'unread',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_status_created` (`recipient_user_id`,`status`,`created_at`),
  KEY `fk_notifications_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `org_nodes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `node_type` varchar(32) NOT NULL,
  `node_id` bigint NOT NULL,
  `parent_node_id` bigint DEFAULT NULL,
  `path` varchar(1024) NOT NULL,
  `depth` int NOT NULL DEFAULT '1',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_nodes_tenant_type_id` (`tenant_id`,`node_type`,`node_id`),
  KEY `idx_org_nodes_parent` (`parent_node_id`),
  KEY `idx_org_nodes_path` (`path`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(128) NOT NULL,
  `module` varchar(64) NOT NULL,
  `action_name` varchar(64) NOT NULL,
  `resource_type` varchar(64) DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permissions_code` (`code`),
  KEY `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `practice_answers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_question_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `answer_json` json NOT NULL,
  `is_correct` tinyint(1) NOT NULL,
  `answered_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_practice_answers_user_answered` (`user_id`,`answered_at`),
  KEY `fk_practice_answers_session_question` (`session_question_id`),
  KEY `fk_practice_answers_question` (`question_id`),
  KEY `fk_practice_answers_question_version` (`question_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `practice_session_question_reviews` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `student_user_id` bigint NOT NULL,
  `session_id` bigint NOT NULL,
  `session_question_id` bigint NOT NULL,
  `teacher_user_id` bigint NOT NULL,
  `review_comment` text NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_psqr_tenant_question_teacher` (`tenant_id`,`session_question_id`,`teacher_user_id`),
  KEY `idx_psqr_class_course_student` (`tenant_id`,`class_id`,`course_id`,`student_user_id`),
  KEY `idx_psqr_session_question` (`session_id`,`session_question_id`),
  KEY `fk_psqr_class` (`class_id`),
  KEY `fk_psqr_course` (`course_id`),
  KEY `fk_psqr_student_user` (`student_user_id`),
  KEY `fk_psqr_session_question` (`session_question_id`),
  KEY `fk_psqr_teacher_user` (`teacher_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `practice_session_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `display_order` int NOT NULL,
  `presented_options_json` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_psq_session_order` (`session_id`,`display_order`),
  KEY `fk_psq_question` (`question_id`),
  KEY `fk_psq_question_version` (`question_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `practice_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `practice_mode` varchar(32) NOT NULL,
  `source_mode` varchar(32) NOT NULL,
  `course_id` bigint DEFAULT NULL,
  `bank_scope_json` json NOT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` datetime(3) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `idx_practice_sessions_tenant_user` (`tenant_id`,`user_id`),
  KEY `idx_practice_sessions_user_status` (`user_id`,`status`,`started_at`),
  KEY `fk_practice_sessions_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_bank_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_bank_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `sort_no` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_question_bank_questions` (`question_bank_id`,`question_id`),
  KEY `fk_qbq_question` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_bank_visibility` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_bank_id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL,
  `grant_type` varchar(32) NOT NULL,
  `target_type` varchar(32) NOT NULL,
  `target_id` bigint NOT NULL,
  `permission_type` varchar(32) NOT NULL,
  `inherit_to_children` tinyint(1) NOT NULL DEFAULT '0',
  `granted_by` bigint NOT NULL,
  `granted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expired_at` datetime(3) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_qbv_unique` (`question_bank_id`,`grant_type`,`target_type`,`target_id`,`permission_type`),
  KEY `idx_qbv_target_perm_status` (`target_type`,`target_id`,`permission_type`,`status`),
  KEY `idx_qbv_bank_status` (`question_bank_id`,`status`),
  KEY `fk_qbv_tenant` (`tenant_id`),
  KEY `fk_qbv_granted_by` (`granted_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_banks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `owner_org_type` varchar(32) NOT NULL,
  `owner_org_id` bigint NOT NULL,
  `creator_id` bigint NOT NULL,
  `course_id` bigint DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `source_type` varchar(32) NOT NULL DEFAULT 'manual',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_question_banks_tenant_status` (`tenant_id`,`status`),
  KEY `idx_question_banks_owner` (`owner_org_type`,`owner_org_id`),
  KEY `idx_question_banks_course` (`course_id`),
  KEY `fk_question_banks_creator` (`creator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_challenges` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `challenger_user_id` bigint NOT NULL,
  `challenger_org_type` varchar(32) NOT NULL,
  `challenger_org_id` bigint NOT NULL,
  `challenge_type` varchar(32) NOT NULL,
  `description` text NOT NULL,
  `attachments_json` json DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `assigned_to` bigint DEFAULT NULL,
  `reviewed_by` bigint DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `review_comment` text,
  `resolved_version_id` bigint DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_question_challenges_status_created` (`tenant_id`,`status`,`created_at`),
  KEY `fk_question_challenges_question` (`question_id`),
  KEY `fk_question_challenges_question_version` (`question_version_id`),
  KEY `fk_question_challenges_challenger` (`challenger_user_id`),
  KEY `fk_question_challenges_assigned_to` (`assigned_to`),
  KEY `fk_question_challenges_reviewed_by` (`reviewed_by`),
  KEY `fk_question_challenges_resolved_version` (`resolved_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_comments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `parent_comment_id` bigint DEFAULT NULL,
  `comment_type` varchar(32) NOT NULL,
  `is_private` tinyint(1) NOT NULL DEFAULT '0',
  `content` text NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_question_comments_question_created` (`question_id`,`created_at`),
  KEY `fk_question_comments_tenant` (`tenant_id`),
  KEY `fk_question_comments_question_version` (`question_version_id`),
  KEY `fk_question_comments_user` (`user_id`),
  KEY `fk_question_comments_parent` (`parent_comment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_course_bindings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_question_course_bindings` (`question_id`,`course_id`),
  KEY `idx_qcb_tenant_course` (`tenant_id`,`course_id`),
  KEY `fk_qcb_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_tags` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_id` bigint NOT NULL,
  `tag_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_question_tags` (`question_id`,`tag_id`),
  KEY `fk_question_tags_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `question_versions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_id` bigint NOT NULL,
  `version_no` int NOT NULL,
  `content_json` json NOT NULL,
  `answer_json` json NOT NULL,
  `analysis_json` json DEFAULT NULL,
  `structure_hash` varchar(64) NOT NULL,
  `change_summary` varchar(500) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_question_versions_no` (`question_id`,`version_no`),
  KEY `idx_question_versions_question_created` (`question_id`,`created_at`),
  KEY `fk_question_versions_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `owner_org_type` varchar(32) NOT NULL,
  `owner_org_id` bigint NOT NULL,
  `question_type` varchar(32) NOT NULL,
  `difficulty` varchar(32) DEFAULT NULL,
  `current_version_id` bigint DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `source_type` varchar(32) NOT NULL DEFAULT 'manual',
  `creator_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_questions_tenant_status_type` (`tenant_id`,`status`,`question_type`),
  KEY `idx_questions_owner` (`owner_org_type`,`owner_org_id`),
  KEY `idx_questions_current_version` (`current_version_id`),
  KEY `fk_questions_creator` (`creator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `role_menu_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `role_id` bigint NOT NULL,
  `menu_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_menu_permissions` (`role_id`,`menu_id`),
  KEY `fk_role_menu_permissions_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `role_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `role_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permissions` (`role_id`,`permission_id`),
  KEY `fk_role_permissions_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `role_type` varchar(32) NOT NULL DEFAULT 'builtin',
  `data_scope_type` varchar(32) NOT NULL DEFAULT 'self',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_tenant_code` (`tenant_id`,`code`),
  KEY `idx_roles_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `schools` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `object_type_code` int DEFAULT NULL,
  `object_type` int NOT NULL DEFAULT '1' COMMENT '字典 school_object_type：1=学校，2=组织',
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `english_name` varchar(255) DEFAULT NULL,
  `address` varchar(500) DEFAULT NULL,
  `logo_url` varchar(1024) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schools_tenant_code` (`tenant_id`,`code`),
  KEY `idx_schools_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `student_class_memberships` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `joined_at` datetime(3) NOT NULL,
  `left_at` datetime(3) DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_scm_student_current` (`student_id`,`is_current`,`status`),
  KEY `idx_scm_class_current` (`class_id`,`is_current`,`status`),
  KEY `idx_scm_grade_current` (`grade_id`,`is_current`,`status`),
  KEY `fk_scm_tenant` (`tenant_id`),
  KEY `fk_scm_school` (`school_id`),
  KEY `fk_scm_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `student_profiles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `student_no` varchar(64) DEFAULT NULL,
  `enrollment_status` varchar(32) NOT NULL DEFAULT 'active',
  `entered_at` datetime(3) DEFAULT NULL,
  `graduated_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_profiles_user` (`user_id`),
  UNIQUE KEY `uk_student_profiles_tenant_no` (`tenant_id`,`student_no`),
  KEY `idx_student_profiles_school_status` (`school_id`,`enrollment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `student_transitions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `transition_type` varchar(32) NOT NULL,
  `from_school_id` bigint DEFAULT NULL,
  `from_grade_id` bigint DEFAULT NULL,
  `from_class_id` bigint DEFAULT NULL,
  `to_school_id` bigint DEFAULT NULL,
  `to_grade_id` bigint DEFAULT NULL,
  `to_class_id` bigint DEFAULT NULL,
  `occurred_at` datetime(3) NOT NULL,
  `operator_id` bigint NOT NULL,
  `remark` varchar(500) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_student_transitions_student_occurred` (`student_id`,`occurred_at`),
  KEY `fk_student_transitions_tenant` (`tenant_id`),
  KEY `fk_student_transitions_from_school` (`from_school_id`),
  KEY `fk_student_transitions_from_grade` (`from_grade_id`),
  KEY `fk_student_transitions_from_class` (`from_class_id`),
  KEY `fk_student_transitions_to_school` (`to_school_id`),
  KEY `fk_student_transitions_to_grade` (`to_grade_id`),
  KEY `fk_student_transitions_to_class` (`to_class_id`),
  KEY `fk_student_transitions_operator` (`operator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tags` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `tag_type` varchar(32) NOT NULL,
  `owner_user_id` bigint DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `category` varchar(64) DEFAULT NULL,
  `color` varchar(32) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tags_tenant_type_owner_name` (`tenant_id`,`tag_type`,`owner_user_id`,`name`),
  KEY `idx_tags_tenant_type_status` (`tenant_id`,`tag_type`,`status`),
  KEY `fk_tags_owner_user` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_assignment_histories` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `teacher_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `course_id` bigint DEFAULT NULL,
  `assignment_type` varchar(32) NOT NULL DEFAULT 'course_teacher',
  `change_type` varchar(32) NOT NULL,
  `effective_from` datetime(3) NOT NULL,
  `effective_to` datetime(3) DEFAULT NULL,
  `operator_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_teacher_assignment_histories_teacher_from` (`teacher_id`,`effective_from`),
  KEY `idx_teacher_assignment_histories_class_course` (`class_id`,`course_id`),
  KEY `idx_teacher_assignment_histories_type` (`assignment_type`),
  KEY `fk_tah_tenant` (`tenant_id`),
  KEY `fk_tah_course` (`course_id`),
  KEY `fk_tah_operator` (`operator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `class_head_teacher_assignments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `teacher_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `effective_from` datetime(3) NOT NULL,
  `effective_to` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_chta_teacher_current` (`teacher_id`,`is_current`,`status`),
  KEY `idx_chta_class_current` (`class_id`,`is_current`,`status`),
  KEY `fk_chta_tenant` (`tenant_id`),
  KEY `fk_chta_school` (`school_id`),
  KEY `fk_chta_grade` (`grade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_class_course_assignments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `teacher_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `course_id` bigint NOT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `effective_from` datetime(3) NOT NULL,
  `effective_to` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_tcca_teacher_current` (`teacher_id`,`is_current`,`status`),
  KEY `idx_tcca_class_course_current` (`class_id`,`course_id`,`is_current`,`status`),
  KEY `fk_tcca_tenant` (`tenant_id`),
  KEY `fk_tcca_school` (`school_id`),
  KEY `fk_tcca_grade` (`grade_id`),
  KEY `fk_tcca_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_profiles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `teacher_no` varchar(64) DEFAULT NULL,
  `employment_status` varchar(32) NOT NULL DEFAULT 'active',
  `hired_at` datetime(3) DEFAULT NULL,
  `left_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_teacher_profiles_user` (`user_id`),
  UNIQUE KEY `uk_teacher_profiles_tenant_no` (`tenant_id`,`teacher_no`),
  KEY `idx_teacher_profiles_school_status` (`school_id`,`employment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tenants` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `tenant_type` varchar(32) NOT NULL DEFAULT 'school',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenants_code` (`code`),
  KEY `idx_tenants_type_status` (`tenant_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_question_state_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `source_type` varchar(32) NOT NULL,
  `action_type` varchar(32) NOT NULL,
  `payload_json` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_uqsl_user_created` (`user_id`,`created_at`),
  KEY `fk_uqsl_question` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_question_states` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `question_version_id` bigint NOT NULL,
  `practice_correct_count` int NOT NULL DEFAULT '0',
  `practice_wrong_count` int NOT NULL DEFAULT '0',
  `exam_wrong_count` int NOT NULL DEFAULT '0',
  `is_mastered` tinyint(1) NOT NULL DEFAULT '0',
  `mastered_at` datetime(3) DEFAULT NULL,
  `is_confused` tinyint(1) NOT NULL DEFAULT '0',
  `confused_at` datetime(3) DEFAULT NULL,
  `last_wrong_at` datetime(3) DEFAULT NULL,
  `last_answer_json` json DEFAULT NULL,
  `last_result` varchar(32) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_question_states_user_question` (`user_id`,`question_id`),
  KEY `idx_uqs_user_mastered_confused` (`user_id`,`is_mastered`,`is_confused`,`updated_at`),
  KEY `fk_uqs_tenant` (`tenant_id`),
  KEY `fk_uqs_question` (`question_id`),
  KEY `fk_uqs_question_version` (`question_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_question_tags` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `question_id` bigint NOT NULL,
  `tag_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_question_tags` (`user_id`,`question_id`,`tag_id`),
  KEY `fk_user_question_tags_question` (`question_id`),
  KEY `fk_user_question_tags_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `role_id` bigint NOT NULL,
  `effective_from` datetime(3) DEFAULT NULL,
  `effective_to` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_roles_user_role` (`user_id`,`role_id`),
  KEY `idx_user_roles_tenant_user` (`tenant_id`,`user_id`),
  KEY `fk_user_roles_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `username` varchar(64) NOT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `email` varchar(128) DEFAULT NULL,
  `avatar_url` varchar(1024) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(128) NOT NULL,
  `user_type` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  `last_login_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_tenant_username` (`tenant_id`,`username`),
  UNIQUE KEY `uk_users_tenant_phone` (`tenant_id`,`phone`),
  UNIQUE KEY `uk_users_tenant_email` (`tenant_id`,`email`),
  KEY `idx_users_tenant_status` (`tenant_id`,`status`),
  KEY `idx_users_must_change_password` (`must_change_password`),
  KEY `idx_users_type` (`user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Foreign keys are added after all tables to avoid circular dependency issues.
ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_logs_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_logs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `classes` ADD CONSTRAINT `fk_classes_grade` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `classes` ADD CONSTRAINT `fk_classes_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `classes` ADD CONSTRAINT `fk_classes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `courses` ADD CONSTRAINT `fk_courses_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `data_scopes` ADD CONSTRAINT `fk_data_scopes_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);
ALTER TABLE `dictionary_items` ADD CONSTRAINT `fk_dictionary_items_dictionary` FOREIGN KEY (`dictionary_id`) REFERENCES `dictionaries` (`id`);
ALTER TABLE `entity_snapshots` ADD CONSTRAINT `fk_entity_snapshots_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `entity_snapshots` ADD CONSTRAINT `fk_entity_snapshots_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `exam_attempt_answers` ADD CONSTRAINT `fk_eaa_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `exam_attempts` (`id`);
ALTER TABLE `exam_attempt_answers` ADD CONSTRAINT `fk_eaa_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `exam_attempt_answers` ADD CONSTRAINT `fk_eaa_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `exam_attempt_answers` ADD CONSTRAINT `fk_eaa_reviewer_user` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `exam_attempt_answers` ADD CONSTRAINT `fk_eaa_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `exam_attempts` ADD CONSTRAINT `fk_exam_attempts_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`);
ALTER TABLE `exam_attempts` ADD CONSTRAINT `fk_exam_attempts_paper` FOREIGN KEY (`paper_id`) REFERENCES `exam_papers` (`id`);
ALTER TABLE `exam_attempts` ADD CONSTRAINT `fk_exam_attempts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `exam_attempts` ADD CONSTRAINT `fk_exam_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `exam_fixed_question_drafts` ADD CONSTRAINT `fk_efqd_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`);
ALTER TABLE `exam_fixed_question_drafts` ADD CONSTRAINT `fk_efqd_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `exam_fixed_question_drafts` ADD CONSTRAINT `fk_efqd_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `exam_paper_question_rules` ADD CONSTRAINT `fk_epqr_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `exam_paper_question_rules` ADD CONSTRAINT `fk_epqr_paper` FOREIGN KEY (`paper_id`) REFERENCES `exam_papers` (`id`);
ALTER TABLE `exam_paper_questions` ADD CONSTRAINT `fk_epq_paper` FOREIGN KEY (`paper_id`) REFERENCES `exam_papers` (`id`);
ALTER TABLE `exam_paper_questions` ADD CONSTRAINT `fk_epq_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `exam_paper_questions` ADD CONSTRAINT `fk_epq_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `exam_papers` ADD CONSTRAINT `fk_exam_papers_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`);
ALTER TABLE `exam_papers` ADD CONSTRAINT `fk_exam_papers_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`);
ALTER TABLE `exam_papers` ADD CONSTRAINT `fk_exam_papers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `exam_targets` ADD CONSTRAINT `fk_exam_targets_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`);
ALTER TABLE `exams` ADD CONSTRAINT `fk_exams_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`);
ALTER TABLE `exams` ADD CONSTRAINT `fk_exams_paper` FOREIGN KEY (`paper_id`) REFERENCES `exam_papers` (`id`);
ALTER TABLE `exams` ADD CONSTRAINT `fk_exams_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `file_assets` ADD CONSTRAINT `fk_file_assets_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `file_assets` ADD CONSTRAINT `fk_file_assets_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`);
ALTER TABLE `grades` ADD CONSTRAINT `fk_grades_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `grades` ADD CONSTRAINT `fk_grades_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `import_job_rows` ADD CONSTRAINT `fk_import_job_rows_job` FOREIGN KEY (`job_id`) REFERENCES `import_jobs` (`id`);
ALTER TABLE `import_jobs` ADD CONSTRAINT `fk_import_jobs_file_asset` FOREIGN KEY (`file_asset_id`) REFERENCES `file_assets` (`id`);
ALTER TABLE `import_jobs` ADD CONSTRAINT `fk_import_jobs_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`);
ALTER TABLE `import_jobs` ADD CONSTRAINT `fk_import_jobs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `menus` ADD CONSTRAINT `fk_menus_parent` FOREIGN KEY (`parent_id`) REFERENCES `menus` (`id`);
ALTER TABLE `notices` ADD CONSTRAINT `fk_notices_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `users` (`id`);
ALTER TABLE `notices` ADD CONSTRAINT `fk_notices_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_user` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `org_nodes` ADD CONSTRAINT `fk_org_nodes_parent` FOREIGN KEY (`parent_node_id`) REFERENCES `org_nodes` (`id`);
ALTER TABLE `org_nodes` ADD CONSTRAINT `fk_org_nodes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `practice_answers` ADD CONSTRAINT `fk_practice_answers_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `practice_answers` ADD CONSTRAINT `fk_practice_answers_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `practice_answers` ADD CONSTRAINT `fk_practice_answers_session_question` FOREIGN KEY (`session_question_id`) REFERENCES `practice_session_questions` (`id`);
ALTER TABLE `practice_answers` ADD CONSTRAINT `fk_practice_answers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_session_question` FOREIGN KEY (`session_question_id`) REFERENCES `practice_session_questions` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_session` FOREIGN KEY (`session_id`) REFERENCES `practice_sessions` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_student_user` FOREIGN KEY (`student_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_teacher_user` FOREIGN KEY (`teacher_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `practice_session_question_reviews` ADD CONSTRAINT `fk_psqr_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `practice_session_questions` ADD CONSTRAINT `fk_psq_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `practice_session_questions` ADD CONSTRAINT `fk_psq_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `practice_session_questions` ADD CONSTRAINT `fk_psq_session` FOREIGN KEY (`session_id`) REFERENCES `practice_sessions` (`id`);
ALTER TABLE `practice_sessions` ADD CONSTRAINT `fk_practice_sessions_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `practice_sessions` ADD CONSTRAINT `fk_practice_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `practice_sessions` ADD CONSTRAINT `fk_practice_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `question_bank_questions` ADD CONSTRAINT `fk_qbq_bank` FOREIGN KEY (`question_bank_id`) REFERENCES `question_banks` (`id`);
ALTER TABLE `question_bank_questions` ADD CONSTRAINT `fk_qbq_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `question_bank_visibility` ADD CONSTRAINT `fk_qbv_bank` FOREIGN KEY (`question_bank_id`) REFERENCES `question_banks` (`id`);
ALTER TABLE `question_bank_visibility` ADD CONSTRAINT `fk_qbv_granted_by` FOREIGN KEY (`granted_by`) REFERENCES `users` (`id`);
ALTER TABLE `question_bank_visibility` ADD CONSTRAINT `fk_qbv_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `question_banks` ADD CONSTRAINT `fk_question_banks_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `question_banks` ADD CONSTRAINT `fk_question_banks_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`);
ALTER TABLE `question_banks` ADD CONSTRAINT `fk_question_banks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_challenger` FOREIGN KEY (`challenger_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_resolved_version` FOREIGN KEY (`resolved_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`);
ALTER TABLE `question_challenges` ADD CONSTRAINT `fk_question_challenges_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `question_comments` ADD CONSTRAINT `fk_question_comments_parent` FOREIGN KEY (`parent_comment_id`) REFERENCES `question_comments` (`id`);
ALTER TABLE `question_comments` ADD CONSTRAINT `fk_question_comments_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `question_comments` ADD CONSTRAINT `fk_question_comments_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `question_comments` ADD CONSTRAINT `fk_question_comments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `question_comments` ADD CONSTRAINT `fk_question_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `question_course_bindings` ADD CONSTRAINT `fk_qcb_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `question_course_bindings` ADD CONSTRAINT `fk_qcb_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `question_course_bindings` ADD CONSTRAINT `fk_qcb_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `question_tags` ADD CONSTRAINT `fk_question_tags_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `question_tags` ADD CONSTRAINT `fk_question_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`);
ALTER TABLE `question_versions` ADD CONSTRAINT `fk_question_versions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `question_versions` ADD CONSTRAINT `fk_question_versions_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `questions` ADD CONSTRAINT `fk_questions_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`);
ALTER TABLE `questions` ADD CONSTRAINT `fk_questions_current_version` FOREIGN KEY (`current_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `questions` ADD CONSTRAINT `fk_questions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `role_menu_permissions` ADD CONSTRAINT `fk_role_menu_permissions_menu` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`id`);
ALTER TABLE `role_menu_permissions` ADD CONSTRAINT `fk_role_menu_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`);
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);
ALTER TABLE `roles` ADD CONSTRAINT `fk_roles_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `schools` ADD CONSTRAINT `fk_schools_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `student_class_memberships` ADD CONSTRAINT `fk_scm_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `student_class_memberships` ADD CONSTRAINT `fk_scm_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `student_class_memberships` ADD CONSTRAINT `fk_scm_grade` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `student_class_memberships` ADD CONSTRAINT `fk_scm_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `student_class_memberships` ADD CONSTRAINT `fk_scm_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`);
ALTER TABLE `student_class_memberships` ADD CONSTRAINT `fk_scm_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `student_profiles` ADD CONSTRAINT `fk_student_profiles_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `student_profiles` ADD CONSTRAINT `fk_student_profiles_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `student_profiles` ADD CONSTRAINT `fk_student_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_from_class` FOREIGN KEY (`from_class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_from_grade` FOREIGN KEY (`from_grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_from_school` FOREIGN KEY (`from_school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_to_class` FOREIGN KEY (`to_class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_to_grade` FOREIGN KEY (`to_grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `student_transitions` ADD CONSTRAINT `fk_student_transitions_to_school` FOREIGN KEY (`to_school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `tags` ADD CONSTRAINT `fk_tags_owner_user` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`);
ALTER TABLE `tags` ADD CONSTRAINT `fk_tags_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `teacher_assignment_histories` ADD CONSTRAINT `fk_tah_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `teacher_assignment_histories` ADD CONSTRAINT `fk_tah_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `teacher_assignment_histories` ADD CONSTRAINT `fk_tah_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`);
ALTER TABLE `teacher_assignment_histories` ADD CONSTRAINT `fk_tah_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`);
ALTER TABLE `teacher_assignment_histories` ADD CONSTRAINT `fk_tah_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `class_head_teacher_assignments` ADD CONSTRAINT `fk_chta_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `class_head_teacher_assignments` ADD CONSTRAINT `fk_chta_grade` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `class_head_teacher_assignments` ADD CONSTRAINT `fk_chta_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `class_head_teacher_assignments` ADD CONSTRAINT `fk_chta_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`);
ALTER TABLE `class_head_teacher_assignments` ADD CONSTRAINT `fk_chta_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `teacher_class_course_assignments` ADD CONSTRAINT `fk_tcca_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);
ALTER TABLE `teacher_class_course_assignments` ADD CONSTRAINT `fk_tcca_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`);
ALTER TABLE `teacher_class_course_assignments` ADD CONSTRAINT `fk_tcca_grade` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `teacher_class_course_assignments` ADD CONSTRAINT `fk_tcca_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `teacher_class_course_assignments` ADD CONSTRAINT `fk_tcca_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`);
ALTER TABLE `teacher_class_course_assignments` ADD CONSTRAINT `fk_tcca_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `fk_teacher_profiles_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`);
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `fk_teacher_profiles_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `fk_teacher_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `user_question_state_logs` ADD CONSTRAINT `fk_uqsl_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `user_question_state_logs` ADD CONSTRAINT `fk_uqsl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `user_question_states` ADD CONSTRAINT `fk_uqs_question_version` FOREIGN KEY (`question_version_id`) REFERENCES `question_versions` (`id`);
ALTER TABLE `user_question_states` ADD CONSTRAINT `fk_uqs_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `user_question_states` ADD CONSTRAINT `fk_uqs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `user_question_states` ADD CONSTRAINT `fk_uqs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `user_question_tags` ADD CONSTRAINT `fk_user_question_tags_question` FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`);
ALTER TABLE `user_question_tags` ADD CONSTRAINT `fk_user_question_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`);
ALTER TABLE `user_question_tags` ADD CONSTRAINT `fk_user_question_tags_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `users` ADD CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`);

-- 基础种子数据。不包含本地用户密码或个人数据。
INSERT INTO tenants (id, code, name, tenant_type, status, remark)
VALUES (1, 'platform', '平台虚拟租户', 'platform', 'active', '系统内置平台级虚拟租户')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tenant_type = VALUES(tenant_type),
  status = VALUES(status);

INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark)
VALUES
  (1, 'sys_admin', '系统管理员', 'builtin', 'all', 'active', '平台全局管理员')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  data_scope_type = VALUES(data_scope_type),
  status = VALUES(status);

INSERT INTO permissions (code, module, action_name, resource_type, name, description)
VALUES
  ('auth:login', 'auth', 'login', 'auth', '登录', '账号密码登录'),
  ('tenant:manage', 'tenant', 'manage', 'tenant', '租户管理', '管理学校或组织租户'),
  ('user:manage', 'user', 'manage', 'user', '用户管理', '管理用户与账号状态'),
  ('role:manage', 'role', 'manage', 'role', '角色管理', '管理角色、权限、菜单和数据范围'),
  ('org:manage', 'org', 'manage', 'org', '组织管理', '管理学校、年级、班级和课程'),
  ('question_bank:manage', 'question_bank', 'manage', 'question_bank', '题库管理', '管理题库与下发范围'),
  ('question:manage', 'question', 'manage', 'question', '题目管理', '管理题目与版本'),
  ('practice:use', 'practice', 'use', 'practice', '练题', '进行练题与题目状态维护'),
  ('exam:manage', 'exam', 'manage', 'exam', '考试管理', '创建、发布、作答和统计考试'),
  ('notice:manage', 'notice', 'manage', 'notice', '公告管理', '管理公告与站内通知'),
  ('import:manage', 'import', 'manage', 'import', '导入管理', '模板下载与导入任务管理'),
  ('file:upload', 'file', 'upload', 'file', '文件上传', '上传或转储文件资产'),
  ('analytics:view', 'analytics', 'view', 'analytics', '数据分析', '查看练题和考试统计'),
  ('audit:view', 'audit', 'view', 'audit', '审计查看', '查看审计日志')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.tenant_id = 1
  AND r.code = 'sys_admin';

INSERT INTO dictionaries (code, name, status, remark)
VALUES
  ('school_object_type', '学校与组织类型', 'active', '学校/组织统一管理对象类型'),
  ('exam_mode', '考试组卷方式', 'active', 'exams.exam_mode'),
  ('exam_paper_type', '试卷类型', 'active', 'exam_papers.paper_type'),
  ('exam_paper_status', '试卷状态', 'active', 'exam_papers.status')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);
SET @school_object_type_id := (SELECT id FROM dictionaries WHERE code = 'school_object_type' LIMIT 1);
SET @exam_mode_id := (SELECT id FROM dictionaries WHERE code = 'exam_mode' LIMIT 1);
SET @exam_paper_type_id := (SELECT id FROM dictionaries WHERE code = 'exam_paper_type' LIMIT 1);
SET @exam_paper_status_id := (SELECT id FROM dictionaries WHERE code = 'exam_paper_status' LIMIT 1);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
VALUES
  (@school_object_type_id, 1, '学校', 10, 'active', 'code=school'),
  (@school_object_type_id, 2, '组织', 20, 'active', 'code=organization'),
  (@exam_mode_id, 1, '固定试卷', 10, 'active', 'code=fixed'),
  (@exam_mode_id, 2, '选择已有试卷', 20, 'active', 'code=paper'),
  (@exam_mode_id, 3, '现场随机组卷', 30, 'active', 'code=random_assembly'),
  (@exam_paper_type_id, 1, '固定试卷', 10, 'active', 'code=fixed'),
  (@exam_paper_type_id, 2, '随机试卷', 20, 'active', 'code=random_rule'),
  (@exam_paper_status_id, 1, '草稿', 10, 'active', 'code=draft'),
  (@exam_paper_status_id, 2, '已发布', 20, 'active', 'code=published')
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  sort_no = VALUES(sort_no),
  status = VALUES(status),
  remark = VALUES(remark);

INSERT INTO dictionaries (code, name, status, remark)
SELECT v.code, v.name, 'active', v.remark
FROM (
  SELECT 'tenant_status' AS code, '租户状态' AS name, 'tenants.status' AS remark
  UNION ALL SELECT 'school_status', '学校状态', 'schools.status'
  UNION ALL SELECT 'grade_status', '年级状态', 'grades.status'
  UNION ALL SELECT 'class_status', '班级状态', 'classes.status'
  UNION ALL SELECT 'course_status', '课程状态', 'courses.status'
  UNION ALL SELECT 'org_node_status', '组织节点状态', 'org_nodes.status'
  UNION ALL SELECT 'user_status', '用户状态', 'users.status'
  UNION ALL SELECT 'student_enrollment_status', '学生学籍状态', 'student_profiles.enrollment_status'
  UNION ALL SELECT 'teacher_employment_status', '教师任职状态', 'teacher_profiles.employment_status'
  UNION ALL SELECT 'role_status', '角色状态', 'roles.status'
  UNION ALL SELECT 'student_class_membership_status', '学生班级关系状态', 'student_class_memberships.status'
  UNION ALL SELECT 'teacher_class_course_assignment_status', '教师任课关系状态', 'teacher_class_course_assignments.status'
  UNION ALL SELECT 'question_bank_status', '题库状态', 'question_banks.status'
  UNION ALL SELECT 'question_bank_visibility_status', '题库可见性状态', 'question_bank_visibility.status'
  UNION ALL SELECT 'question_status', '题目状态', 'questions.status'
  UNION ALL SELECT 'tag_status', '标签状态', 'tags.status'
  UNION ALL SELECT 'question_comment_status', '题目评论状态', 'question_comments.status'
  UNION ALL SELECT 'question_challenge_status', '题目质疑状态', 'question_challenges.status'
  UNION ALL SELECT 'practice_session_status', '练习会话状态', 'practice_sessions.status'
  UNION ALL SELECT 'practice_review_status', '练习批注状态', 'practice_session_question_reviews.status'
  UNION ALL SELECT 'exam_status', '考试状态', 'exams.status'
  UNION ALL SELECT 'exam_attempt_status', '考试作答状态', 'exam_attempts.status'
  UNION ALL SELECT 'exam_review_status', '考试批阅状态', 'analytics.exam_review_status'
  UNION ALL SELECT 'notice_status', '公告状态', 'notices.status'
  UNION ALL SELECT 'notification_status', '通知状态', 'notifications.status'
  UNION ALL SELECT 'file_asset_status', '文件状态', 'file_assets.status'
  UNION ALL SELECT 'import_job_status', '导入任务状态', 'import_jobs.status'
  UNION ALL SELECT 'import_job_row_status', '导入明细状态', 'import_job_rows.status'
  UNION ALL SELECT 'audit_result_status', '审计结果状态', 'audit_logs.result'
  UNION ALL SELECT 'dictionary_status', '字典状态', 'dictionaries.status'
  UNION ALL SELECT 'dictionary_item_status', '字典项状态', 'dictionary_items.status'
) v
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
SELECT d.id, v.item_value, v.item_label, v.sort_no, 'active', v.remark
FROM dictionaries d
JOIN (
  SELECT 'tenant_status' AS code, 1 AS item_value, '启用' AS item_label, 10 AS sort_no, 'code=active' AS remark
  UNION ALL SELECT 'tenant_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'school_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'school_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'grade_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'grade_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'class_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'class_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'course_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'course_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'org_node_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'org_node_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'user_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'user_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'role_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'role_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'student_class_membership_status', 1, '有效', 10, 'code=active'
  UNION ALL SELECT 'student_class_membership_status', 2, '无效', 20, 'code=inactive'
  UNION ALL SELECT 'teacher_class_course_assignment_status', 1, '有效', 10, 'code=active'
  UNION ALL SELECT 'teacher_class_course_assignment_status', 2, '无效', 20, 'code=inactive'
  UNION ALL SELECT 'student_enrollment_status', 1, '在读', 10, 'code=active'
  UNION ALL SELECT 'student_enrollment_status', 2, '毕业', 20, 'code=graduated'
  UNION ALL SELECT 'student_enrollment_status', 3, '离校', 30, 'code=left_school'
  UNION ALL SELECT 'student_enrollment_status', 4, '转出', 40, 'code=transferred_out'
  UNION ALL SELECT 'student_enrollment_status', 5, '转学', 50, 'code=transferred'
  UNION ALL SELECT 'teacher_employment_status', 1, '在职', 10, 'code=active'
  UNION ALL SELECT 'teacher_employment_status', 2, '离职', 20, 'code=left'
  UNION ALL SELECT 'question_bank_status', 1, '草稿', 10, 'code=draft'
  UNION ALL SELECT 'question_bank_status', 2, '启用', 20, 'code=active'
  UNION ALL SELECT 'question_bank_visibility_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'question_bank_visibility_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'question_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_status', 3, '草稿', 30, 'code=draft'
  UNION ALL SELECT 'tag_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'tag_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_comment_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'question_comment_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_challenge_status', 1, '待处理', 10, 'code=pending'
  UNION ALL SELECT 'question_challenge_status', 2, '处理中', 20, 'code=reviewing'
  UNION ALL SELECT 'question_challenge_status', 3, '已解决', 30, 'code=resolved'
  UNION ALL SELECT 'question_challenge_status', 4, '已拒绝', 40, 'code=rejected'
  UNION ALL SELECT 'question_challenge_status', 5, '已采纳', 50, 'code=accepted'
  UNION ALL SELECT 'question_challenge_status', 6, '已合并', 60, 'code=merged'
  UNION ALL SELECT 'practice_session_status', 1, '进行中', 10, 'code=active'
  UNION ALL SELECT 'practice_session_status', 2, '已完成', 20, 'code=finished'
  UNION ALL SELECT 'practice_review_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'practice_review_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'exam_status', 1, '草稿', 10, 'code=draft'
  UNION ALL SELECT 'exam_status', 2, '已发布', 20, 'code=published'
  UNION ALL SELECT 'exam_attempt_status', 1, '未开始', 10, 'code=not_started'
  UNION ALL SELECT 'exam_attempt_status', 2, '进行中', 20, 'code=in_progress'
  UNION ALL SELECT 'exam_attempt_status', 3, '已提交', 30, 'code=submitted'
  UNION ALL SELECT 'exam_attempt_status', 4, '超时提交', 40, 'code=timeout_submitted'
  UNION ALL SELECT 'exam_review_status', 1, '未开始', 10, 'code=not_started'
  UNION ALL SELECT 'exam_review_status', 2, '待批阅', 20, 'code=pending'
  UNION ALL SELECT 'exam_review_status', 3, '已批阅', 30, 'code=reviewed'
  UNION ALL SELECT 'notice_status', 1, '草稿', 10, 'code=draft'
  UNION ALL SELECT 'notice_status', 2, '已发布', 20, 'code=published'
  UNION ALL SELECT 'notice_status', 3, '已撤回', 30, 'code=recalled'
  UNION ALL SELECT 'notification_status', 1, '未读', 10, 'code=unread'
  UNION ALL SELECT 'notification_status', 2, '已读', 20, 'code=read'
  UNION ALL SELECT 'file_asset_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'file_asset_status', 2, '待处理', 20, 'code=pending'
  UNION ALL SELECT 'file_asset_status', 3, '失败', 30, 'code=failed'
  UNION ALL SELECT 'file_asset_status', 4, '已删除', 40, 'code=deleted'
  UNION ALL SELECT 'import_job_status', 1, '已上传', 10, 'code=uploaded'
  UNION ALL SELECT 'import_job_status', 2, '解析中', 20, 'code=parsing'
  UNION ALL SELECT 'import_job_status', 3, '校验中', 30, 'code=validating'
  UNION ALL SELECT 'import_job_status', 4, '导入中', 40, 'code=importing'
  UNION ALL SELECT 'import_job_status', 5, '成功', 50, 'code=success'
  UNION ALL SELECT 'import_job_status', 6, '部分成功', 60, 'code=partial_success'
  UNION ALL SELECT 'import_job_status', 7, '失败', 70, 'code=failed'
  UNION ALL SELECT 'import_job_row_status', 1, '待处理', 10, 'code=pending'
  UNION ALL SELECT 'import_job_row_status', 2, '成功', 20, 'code=success'
  UNION ALL SELECT 'import_job_row_status', 3, '失败', 30, 'code=failed'
  UNION ALL SELECT 'import_job_row_status', 4, '跳过', 40, 'code=skipped'
  UNION ALL SELECT 'audit_result_status', 1, '成功', 10, 'code=success'
  UNION ALL SELECT 'audit_result_status', 2, '失败', 20, 'code=failed'
  UNION ALL SELECT 'dictionary_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'dictionary_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'dictionary_item_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'dictionary_item_status', 2, '停用', 20, 'code=disabled'
) v ON v.code = d.code
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  sort_no = VALUES(sort_no),
  status = VALUES(status),
  remark = VALUES(remark);
