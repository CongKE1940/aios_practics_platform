# Stage 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成阶段 1 的可运行工程基础，覆盖登录认证、多租户上下文、用户/角色/菜单/权限、学校/年级/班级/课程基础管理，以及公告/通知的第一版闭环。

**Architecture:** 后端采用 Go 1.22+、Gin、GORM、MySQL 8、Redis、Zap、Viper，按 `cmd/server`、`internal/common`、`internal/modules`、`pkg` 分层。前端采用 pnpm workspace、React 18、TypeScript、Vite、TanStack Query、Zustand、Ant Design 5，按 `apps` 与 `packages` 拆分管理端、用户端和共享包。数据库以 `docs/database/migrations` 为正式基线，接口以 `docs/api/openapi.yaml` 为正式契约。

**Tech Stack:** Go, Gin, GORM, MySQL 8, Redis, React, TypeScript, Vite, pnpm, Vitest, Testing Library.

---

## Delivery Order

- [x] 1. 仓库与工程卫生
  - [x] 初始化 Git 仓库并切换到 `codex/stage1-foundation` 分支。
  - [x] 补齐 `.gitignore`、`.editorconfig`、根 `README.md`，明确正式文档入口、编码、换行、敏感信息规则。
  - [x] 检查现有文档、OpenAPI、migration 是否无中文文件名、无残留引用标记、无编码异常。

- [x] 2. 环境与依赖前置检查
  - [x] 检查 Go、Node.js、pnpm、MySQL 客户端是否可用。
  - [x] 检查是否存在本地数据库连接配置；执行 migration 前必须再次向用户确认目标库。
  - [x] 若缺少运行时或包管理器，先停止并请用户确认安装路径与缓存目录。
  - [x] 记录当前限制：MySQL CLI 未在 PATH 中，已发现 `mysql_local_dev` 连接配置；执行数据库变更前等待用户确认执行方式。

- [x] 3. 后端测试先行骨架
  - [x] 创建 Go module 与后端目录结构。
  - [x] 先写配置加载、健康检查、统一响应、多租户上下文中间件的最小测试。
  - [x] 实现能通过测试的后端启动骨架。
  - [x] 保持数据库访问层只接入接口和迁移契约，不在未确认数据库前执行写库。

- [x] 4. 后端阶段 1 模块
  - [x] 认证：登录、刷新令牌、退出、当前用户信息。
  - [x] 多租户：平台级虚拟租户、租户上下文注入、系统管理员租户切换边界。
  - [x] RBAC：角色、权限、菜单、用户角色绑定。
  - [x] 组织与课程：学校、年级、班级、课程，课程包含 `start_at` 和 `end_at`。
  - [x] 公告通知：公告管理、发布、通知读取状态。

- [x] 5. 前端测试先行骨架
  - [x] 创建 pnpm workspace 与共享 TypeScript 配置。
  - [x] 先写 API 客户端错误处理、菜单权限过滤的最小测试。
  - [x] 补充路由守卫、权限按钮的最小测试。
  - [x] 搭建管理端和用户端 Vite 应用骨架。
  - [x] 接入阶段 1 的登录页、管理端基础布局、组织/用户/RBAC/公告入口。

- [ ] 6. API 契约与生成约束
  - [x] 将 `docs/api/openapi.yaml` 作为唯一正式接口契约。
  - [x] 后端 handler 与前端 API SDK 均以 OpenAPI 字段命名为准。
  - [ ] 若实现发现契约缺项，先更新 OpenAPI 与设计文档，再实现代码。

- [x] 7. 数据库落地
  - [x] 用户确认目标数据库后，按顺序执行 `docs/database/migrations/*.sql`。
  - [x] 执行后核对核心表、平台级虚拟租户、课程时间字段、文件资产表是否存在。
  - [x] 写入最小开发种子数据时先说明影响范围并等待确认。

- [x] 8. 验证与阶段出口
  - [x] 后端：`go test ./...`、配置加载测试、HTTP smoke test。
  - [x] 前端：`pnpm test`、`pnpm typecheck`、`pnpm build`。
  - [x] 契约：OpenAPI YAML 可解析。
  - [x] 契约：schema `$ref` 无缺失。
  - [x] 文档：阶段 1 已实现 API、数据库变更、未解决问题同步更新。

## Stage 1 Exit Criteria

- [x] 用户可以完成登录并获取当前用户、租户、角色、菜单与权限信息。
- [x] 系统管理员归属平台级虚拟租户，普通用户均具备非空 `tenant_id`。
- [x] 租户隔离在后端 repository 或 middleware 层有默认保护。
- [x] 学校、年级、班级、课程、用户、角色、菜单、公告通知具备可测 API。
- [x] 学校、年级、班级、课程具备可测 API。
- [x] 公告通知具备可测 API。
- [x] 课程开始/结束时间在数据库、OpenAPI、前后端表单和列表中一致。
- [x] 文件上传、转储接口保留契约与后端接口入口，但 OSS/MinIO 真实连接仍作为后续任务。
- [x] 本地验证命令有明确结果；若数据库未执行，必须标注为等待用户确认。
