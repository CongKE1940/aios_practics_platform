CREATE TABLE IF NOT EXISTS dictionaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_dictionaries_code (code),
  KEY idx_dictionaries_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO dictionaries (code, name, status, remark)
VALUES ('school_object_type', '学校与组织类型', 'active', '学校/组织统一管理对象类型')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);

CREATE TABLE IF NOT EXISTS dictionary_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dictionary_id BIGINT NULL,
  item_value INT NOT NULL,
  item_label VARCHAR(128) NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 兼容旧版一层字典项表：dictionary_items(dict_type, item_value, item_label, ...)
SET @has_dictionary_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dictionary_items'
    AND COLUMN_NAME = 'dictionary_id'
);
SET @sql := IF(
  @has_dictionary_id = 0,
  'ALTER TABLE dictionary_items ADD COLUMN dictionary_id BIGINT NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dict_type := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dictionary_items'
    AND COLUMN_NAME = 'dict_type'
);
SET @sql := IF(
  @has_dict_type > 0,
  'INSERT INTO dictionaries (code, name, status, remark)
   SELECT DISTINCT dict_type, dict_type, ''active'', NULL
   FROM dictionary_items
   WHERE dict_type IS NOT NULL AND dict_type <> ''''
   ON DUPLICATE KEY UPDATE code = VALUES(code)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_dict_type > 0,
  'UPDATE dictionary_items di
   JOIN dictionaries d ON d.code = di.dict_type
   SET di.dictionary_id = d.id
   WHERE di.dictionary_id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE dictionary_items di
JOIN dictionaries d ON d.id = di.dictionary_id
SET di.item_value = CASE
  WHEN CAST(di.item_value AS CHAR) IN ('organization', '2') THEN 2
  ELSE 1
END
WHERE d.code = 'school_object_type';

SET @school_object_type_id := (
  SELECT id
  FROM dictionaries
  WHERE code = 'school_object_type'
  LIMIT 1
);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
VALUES
  (@school_object_type_id, 1, '学校', 10, 'active', '学校/组织统一管理对象类型'),
  (@school_object_type_id, 2, '组织', 20, 'active', '学校/组织统一管理对象类型')
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  sort_no = VALUES(sort_no),
  status = VALUES(status),
  remark = VALUES(remark);

SET @has_item_value_int := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dictionary_items'
    AND COLUMN_NAME = 'item_value'
    AND DATA_TYPE IN ('int', 'bigint', 'smallint', 'tinyint', 'mediumint')
);
SET @sql := IF(
  @has_item_value_int = 0,
  'ALTER TABLE dictionary_items MODIFY COLUMN item_value INT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @null_dictionary_id_count := (
  SELECT COUNT(*)
  FROM dictionary_items
  WHERE dictionary_id IS NULL
);
SET @sql := IF(
  @null_dictionary_id_count = 0,
  'ALTER TABLE dictionary_items MODIFY COLUMN dictionary_id BIGINT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dictionary_items_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dictionary_items'
    AND INDEX_NAME = 'uk_dictionary_items_dict_value'
);
SET @sql := IF(
  @has_dictionary_items_unique = 0,
  'ALTER TABLE dictionary_items ADD UNIQUE KEY uk_dictionary_items_dict_value (dictionary_id, item_value)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dictionary_items_sort_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dictionary_items'
    AND INDEX_NAME = 'idx_dictionary_items_dict_status_sort'
);
SET @sql := IF(
  @has_dictionary_items_sort_index = 0,
  'ALTER TABLE dictionary_items ADD KEY idx_dictionary_items_dict_status_sort (dictionary_id, status, sort_no)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dictionary_items_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dictionary_items'
    AND CONSTRAINT_NAME = 'fk_dictionary_items_dictionary'
);
SET @sql := IF(
  @has_dictionary_items_fk = 0,
  'ALTER TABLE dictionary_items ADD CONSTRAINT fk_dictionary_items_dictionary FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schools_type_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND INDEX_NAME = 'idx_schools_tenant_type_status'
);
SET @sql := IF(
  @has_schools_type_index > 0,
  'ALTER TABLE schools DROP KEY idx_schools_tenant_type_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @schools_object_type_data_type := (
  SELECT DATA_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type'
  LIMIT 1
);
SET @has_schools_object_type_code := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type_code'
);
SET @sql := IF(
  @schools_object_type_data_type NOT IN ('int', 'bigint', 'smallint', 'tinyint', 'mediumint')
    AND @has_schools_object_type_code = 0,
  'ALTER TABLE schools ADD COLUMN object_type_code INT NULL AFTER tenant_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schools_object_type_code := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type_code'
);
SET @sql := IF(
  @has_schools_object_type_code > 0
    AND @schools_object_type_data_type NOT IN ('int', 'bigint', 'smallint', 'tinyint', 'mediumint'),
  'UPDATE schools
   SET object_type_code = CASE
     WHEN CAST(object_type AS CHAR) = ''organization'' THEN 2
     WHEN CAST(object_type AS CHAR) = ''2'' THEN 2
     ELSE 1
   END
   WHERE object_type_code IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schools_object_type := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type'
);
SET @sql := IF(
  @has_schools_object_type > 0
    AND @has_schools_object_type_code > 0
    AND @schools_object_type_data_type NOT IN ('int', 'bigint', 'smallint', 'tinyint', 'mediumint'),
  'ALTER TABLE schools DROP COLUMN object_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schools_object_type := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type'
);
SET @has_schools_object_type_code := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type_code'
);
SET @sql := IF(
  @has_schools_object_type = 0
    AND @has_schools_object_type_code > 0,
  'ALTER TABLE schools CHANGE COLUMN object_type_code object_type INT NOT NULL DEFAULT 1 COMMENT ''字典 school_object_type：1=学校，2=组织''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @schools_object_type_data_type := (
  SELECT DATA_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND COLUMN_NAME = 'object_type'
  LIMIT 1
);
SET @sql := IF(
  @schools_object_type_data_type IN ('int', 'bigint', 'smallint', 'tinyint', 'mediumint'),
  'UPDATE schools SET object_type = 1 WHERE object_type IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @schools_object_type_data_type IN ('int', 'bigint', 'smallint', 'tinyint', 'mediumint'),
  'ALTER TABLE schools MODIFY COLUMN object_type INT NOT NULL DEFAULT 1 COMMENT ''字典 school_object_type：1=学校，2=组织''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_schools_type_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schools'
    AND INDEX_NAME = 'idx_schools_tenant_type_status'
);
SET @sql := IF(
  @has_schools_type_index = 0,
  'ALTER TABLE schools ADD KEY idx_schools_tenant_type_status (tenant_id, object_type, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
