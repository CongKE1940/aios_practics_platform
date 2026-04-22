INSERT INTO tenants (id, code, name, tenant_type, status, remark)
VALUES (1, 'platform', '平台虚拟租户', 'platform', 'active', '系统内置平台级虚拟租户')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tenant_type = VALUES(tenant_type),
  status = VALUES(status);

INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark)
VALUES
  (1, 'sys_admin', '系统管理员', 'builtin', 'all', 'active', '平台全局管理员')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  data_scope_type = VALUES(data_scope_type),
  status = VALUES(status);

INSERT INTO permissions (code, module, action_name, resource_type, name, description)
VALUES
  ('auth:login', 'auth', 'login', 'auth', '登录', '账号密码登录'),
  ('tenant:manage', 'tenant', 'manage', 'tenant', '租户管理', '管理学校或组织租户'),
  ('user:manage', 'user', 'manage', 'user', '用户管理', '管理用户与账号状态'),
  ('role:manage', 'role', 'manage', 'role', '角色管理', '管理角色、权限、菜单和数据范围'),
  ('org:manage', 'org', 'manage', 'org', '组织管理', '管理学校、年级、班级和课程'),
  ('question_bank:manage', 'question_bank', 'manage', 'question_bank', '题库管理', '管理题库与下发范围'),
  ('question:manage', 'question', 'manage', 'question', '题目管理', '管理题目与版本'),
  ('practice:use', 'practice', 'use', 'practice', '练题', '进行练题与题目状态维护'),
  ('exam:manage', 'exam', 'manage', 'exam', '考试管理', '创建、发布、作答和统计考试'),
  ('notice:manage', 'notice', 'manage', 'notice', '公告管理', '管理公告与站内通知'),
  ('import:manage', 'import', 'manage', 'import', '导入管理', '模板下载与导入任务管理'),
  ('file:upload', 'file', 'upload', 'file', '文件上传', '上传或转储文件资产'),
  ('analytics:view', 'analytics', 'view', 'analytics', '数据分析', '查看练题和考试统计'),
  ('audit:view', 'audit', 'view', 'audit', '审计查看', '查看审计日志')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.tenant_id = 1
  AND r.code = 'sys_admin';
