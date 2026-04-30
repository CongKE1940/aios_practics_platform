-- 对齐当前数据看板与考试作答明细的租户口径。
-- 背景：analytics/admin-overview 查询 exam_attempt_answers.tenant_id，
-- 但旧表结构没有该字段，导致数据看板总览接口返回 500。

SET @has_eaa_tenant := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exam_attempt_answers'
    AND COLUMN_NAME = 'tenant_id'
);
SET @sql := IF(
  @has_eaa_tenant = 0,
  'ALTER TABLE exam_attempt_answers ADD COLUMN tenant_id BIGINT NULL AFTER attempt_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE exam_attempt_answers eaa
JOIN exam_attempts ea ON ea.id = eaa.attempt_id
SET eaa.tenant_id = ea.tenant_id
WHERE eaa.tenant_id IS NULL;

SET @eaa_tenant_null_count := (
  SELECT COUNT(*)
  FROM exam_attempt_answers
  WHERE tenant_id IS NULL
);
SET @sql := IF(
  @eaa_tenant_null_count = 0,
  'ALTER TABLE exam_attempt_answers MODIFY COLUMN tenant_id BIGINT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_eaa_tenant_attempt_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exam_attempt_answers'
    AND INDEX_NAME = 'idx_eaa_tenant_attempt'
);
SET @sql := IF(
  @has_eaa_tenant_attempt_index = 0,
  'ALTER TABLE exam_attempt_answers ADD KEY idx_eaa_tenant_attempt (tenant_id, attempt_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_eaa_tenant_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exam_attempt_answers'
    AND CONSTRAINT_NAME = 'fk_eaa_tenant'
);
SET @sql := IF(
  @has_eaa_tenant_fk = 0,
  'ALTER TABLE exam_attempt_answers ADD CONSTRAINT fk_eaa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO dictionaries (code, name, status, remark)
VALUES
  ('exam_mode', '考试组卷方式', 'active', 'exams.exam_mode'),
  ('exam_paper_type', '试卷类型', 'active', 'exam_papers.paper_type'),
  ('exam_paper_status', '试卷状态', 'active', 'exam_papers.status')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);

SET @exam_mode_id := (SELECT id FROM dictionaries WHERE code = 'exam_mode' LIMIT 1);
SET @exam_paper_type_id := (SELECT id FROM dictionaries WHERE code = 'exam_paper_type' LIMIT 1);
SET @exam_paper_status_id := (SELECT id FROM dictionaries WHERE code = 'exam_paper_status' LIMIT 1);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
VALUES
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
