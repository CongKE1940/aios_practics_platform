ALTER TABLE grades
  ADD COLUMN ended_at DATETIME(3) NULL AFTER status,
  ADD KEY idx_grades_tenant_status_end (tenant_id, status, ended_at);

ALTER TABLE classes
  ADD COLUMN ended_at DATETIME(3) NULL AFTER status,
  ADD KEY idx_classes_tenant_status_end (tenant_id, status, ended_at);

INSERT INTO dictionaries (tenant_id, dict_type, code, name, sort_no, status)
SELECT 0, 'entity_status', 'ended', '已结束', 30, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM dictionaries WHERE tenant_id = 0 AND dict_type = 'entity_status' AND code = 'ended'
);
