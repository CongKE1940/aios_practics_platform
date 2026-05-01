INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark)
SELECT t.id, 'org_operator', '学校/组织协管员', 'builtin', 'tenant', 'active', '系统自动创建的低权限组织管理员角色'
FROM tenants t
WHERE t.tenant_type <> 'platform'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role_type = VALUES(role_type),
  data_scope_type = VALUES(data_scope_type),
  status = VALUES(status),
  remark = VALUES(remark);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN tenants t ON t.id = r.tenant_id
JOIN permissions p ON p.code IN (
  'auth:login',
  'user:manage',
  'practice:use',
  'notice:manage',
  'file:upload',
  'analytics:view'
)
WHERE t.tenant_type <> 'platform'
  AND r.code = 'org_operator';
