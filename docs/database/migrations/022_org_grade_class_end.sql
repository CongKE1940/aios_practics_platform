SET @has_grades_ended_at := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'grades'
    AND COLUMN_NAME = 'ended_at'
);
SET @sql := IF(
  @has_grades_ended_at = 0,
  'ALTER TABLE grades ADD COLUMN ended_at DATETIME(3) NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_grades_end_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'grades'
    AND INDEX_NAME = 'idx_grades_tenant_status_end'
);
SET @sql := IF(
  @has_grades_end_index = 0,
  'ALTER TABLE grades ADD KEY idx_grades_tenant_status_end (tenant_id, status, ended_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_classes_ended_at := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'classes'
    AND COLUMN_NAME = 'ended_at'
);
SET @sql := IF(
  @has_classes_ended_at = 0,
  'ALTER TABLE classes ADD COLUMN ended_at DATETIME(3) NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_classes_end_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'classes'
    AND INDEX_NAME = 'idx_classes_tenant_status_end'
);
SET @sql := IF(
  @has_classes_end_index = 0,
  'ALTER TABLE classes ADD KEY idx_classes_tenant_status_end (tenant_id, status, ended_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO dictionaries (code, name, status, remark)
VALUES ('entity_status', '实体状态', 'active', '通用实体状态')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);

SET @entity_status_id := (SELECT id FROM dictionaries WHERE code = 'entity_status' LIMIT 1);
SET @grade_status_id := (SELECT id FROM dictionaries WHERE code = 'grade_status' LIMIT 1);
SET @class_status_id := (SELECT id FROM dictionaries WHERE code = 'class_status' LIMIT 1);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
SELECT dictionary_id, 3, '已结束', 30, 'active', 'code=ended'
FROM (
  SELECT @entity_status_id AS dictionary_id
  UNION ALL SELECT @grade_status_id
  UNION ALL SELECT @class_status_id
) target
WHERE dictionary_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  sort_no = VALUES(sort_no),
  status = VALUES(status),
  remark = VALUES(remark);
