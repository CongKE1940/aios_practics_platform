INSERT INTO permissions (code, module, action_name, resource_type, name, description)
VALUES
  ('system:manage', 'system', 'manage', 'system', '系统配置', '管理平台级系统配置与全局权限')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'system:manage'
WHERE r.tenant_id = 1
  AND r.code = 'sys_admin';
