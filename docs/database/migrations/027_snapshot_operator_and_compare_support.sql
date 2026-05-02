ALTER TABLE entity_snapshots
  ADD COLUMN operator_user_id BIGINT NULL AFTER trigger_event_type,
  ADD KEY idx_entity_snapshots_operator_created (operator_user_id, created_at),
  ADD CONSTRAINT fk_entity_snapshots_operator FOREIGN KEY (operator_user_id) REFERENCES users(id);

UPDATE entity_snapshots es
JOIN audit_logs al
  ON al.tenant_id = es.tenant_id
 AND al.resource_type = es.entity_type
 AND al.resource_id = es.entity_id
 AND al.created_at = es.created_at
SET es.operator_user_id = al.operator_user_id
WHERE es.operator_user_id IS NULL
  AND al.operator_user_id IS NOT NULL;
