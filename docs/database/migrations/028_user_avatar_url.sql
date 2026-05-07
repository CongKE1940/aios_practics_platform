SET @has_users_avatar_url := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'avatar_url'
);

SET @sql := IF(
  @has_users_avatar_url = 0,
  'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(1024) NULL AFTER email',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
