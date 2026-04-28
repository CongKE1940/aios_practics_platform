CREATE TABLE dictionaries (
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

CREATE TABLE dictionary_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dictionary_id BIGINT NOT NULL,
  item_value INT NOT NULL,
  item_label VARCHAR(128) NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_dictionary_items_dict_value (dictionary_id, item_value),
  KEY idx_dictionary_items_dict_status_sort (dictionary_id, status, sort_no),
  CONSTRAINT fk_dictionary_items_dictionary FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO dictionaries (code, name, status, remark)
VALUES ('school_object_type', '学校与组织类型', 'active', '学校/组织统一管理对象类型')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
SELECT d.id, v.item_value, v.item_label, v.sort_no, 'active', '学校/组织统一管理对象类型'
FROM dictionaries d
JOIN (
  SELECT 1 AS item_value, '学校' AS item_label, 10 AS sort_no
  UNION ALL
  SELECT 2 AS item_value, '组织' AS item_label, 20 AS sort_no
) v
WHERE d.code = 'school_object_type'
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  sort_no = VALUES(sort_no),
  status = VALUES(status),
  remark = VALUES(remark);

ALTER TABLE schools
  DROP KEY idx_schools_tenant_type_status;

ALTER TABLE schools
  ADD COLUMN object_type_code INT NULL AFTER tenant_id;

UPDATE schools
SET object_type_code = CASE
  WHEN object_type = 'organization' THEN 2
  WHEN object_type = '2' THEN 2
  ELSE 1
END;

ALTER TABLE schools
  DROP COLUMN object_type;

ALTER TABLE schools
  CHANGE COLUMN object_type_code object_type INT NOT NULL DEFAULT 1 COMMENT '字典 school_object_type：1=学校，2=组织';

ALTER TABLE schools
  ADD KEY idx_schools_tenant_type_status (tenant_id, object_type, status);
