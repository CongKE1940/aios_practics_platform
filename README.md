# AIOS Practice Platform

AIOS Practice Platform 是面向学校、老师与学生的题库练习和考试平台。本仓库当前进入阶段 1：基础平台能力。

## 正式文档入口

- AI 执行入口：[docs/00_ai_execution_entry.md](docs/00_ai_execution_entry.md)
- 文档索引：[docs/README.md](docs/README.md)
- 正式 OpenAPI：[docs/api/openapi.yaml](docs/api/openapi.yaml)
- 正式数据库 migration：[docs/database/migrations](docs/database/migrations)
- 阶段 1 执行计划：[docs/superpowers/plans/2026-04-21-stage1-foundation.md](docs/superpowers/plans/2026-04-21-stage1-foundation.md)

`docs/api/07_openapi_draft.yaml` 与 `docs/database/08_database_schema.sql` 仅作为历史草案保留，不作为开发基线。

## 阶段 1 范围

- 登录认证与当前用户信息
- 多租户上下文与平台级虚拟租户
- 用户、角色、菜单、权限
- 学校、年级、班级、课程基础管理
- 公告与通知

## 本地约束

- 文本文件统一使用 UTF-8、LF 换行。
- 新增文件名使用小写字母、数字、连字符或下划线。
- 不提交 `.env`、密钥、证书、数据库凭据、缓存、日志和临时上传文件。
- 数据库以 `docs/database/migrations` 为准；执行前需要确认目标库。

## 开发顺序

1. 先维护接口契约和数据库 migration。
2. 后端遵循测试先行，先覆盖配置、响应、租户上下文、路由健康检查。
3. 前端遵循测试先行，先覆盖 API 客户端、路由守卫、权限展示。
4. 业务模块按认证、多租户、RBAC、组织课程、公告通知推进。
