-- 基于既有 schools 表的学校/组织统一管理结构升级脚本
-- 适用场景：已执行 002_org_structure.sql 的旧库增量升级。
-- 说明：
-- 1. 学校与组织继续复用 schools 表，通过 object_type 区分 school / organization。
-- 2. code 继续保留唯一约束，但新增对象由后端自动生成编码，前端不再手动维护。
-- 3. logo_url 可为空；为空时由应用层展示默认图像。
-- 4. 本脚本面向 MySQL 8。生产执行前请先备份并在预发环境验证。

ALTER TABLE schools
  ADD COLUMN object_type VARCHAR(32) NOT NULL DEFAULT 'school' COMMENT 'school/organization' AFTER tenant_id,
  ADD COLUMN english_name VARCHAR(255) NULL AFTER name,
  ADD COLUMN address VARCHAR(500) NULL AFTER english_name,
  ADD COLUMN logo_url VARCHAR(1024) NULL AFTER address;

UPDATE schools
SET object_type = 'school'
WHERE object_type IS NULL OR object_type = '';

ALTER TABLE schools
  ADD KEY idx_schools_tenant_type_status (tenant_id, object_type, status);

-- 可选数据修正：如历史 tenants 中存在 tenant_type = 'organization' 且 schools.code 与 tenants.code 对应，
-- 可按需打开以下语句将对应 schools 记录标记为 organization。
-- UPDATE schools s
-- JOIN tenants t ON t.id = s.tenant_id
-- SET s.object_type = 'organization'
-- WHERE t.tenant_type = 'organization'
--   AND s.deleted_at IS NULL;
