# 阶段 6 管理端数据看板与快照历史闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理端补齐数据看板、快照历史页面，以及学生流转/老师任课变更的后端写入与查询闭环。

**Architecture:** 新增 `snapshot` 模块承载历史查询和变更命令，扩展 `analytics` 模块提供管理端概览，组织与考试模块在关键事件后补写审计日志和实体快照。前端在 admin-web 增加两个面板，通过 SDK 接入正式接口。

**Tech Stack:** Go、Gin、MySQL、TypeScript、React、Vitest

---

### Task 1: 文档与正式契约基线

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\README.md`
- Create: `D:\workspace\projects\aios_practice_platform\docs\docs\28_stage6_admin_analytics_snapshot_status.md`

- [ ] 补充阶段 6 正式接口入口：管理端概览、审计日志、实体快照、学生流转、老师任课历史
- [ ] 明确权限：`analytics:view`、`audit:view`、`org:manage`
- [ ] 新增阶段 6 状态文档入口

### Task 2: Snapshot 模块红测与骨架

**Files:**
- Create: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\model.go`
- Create: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\service.go`
- Create: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\handler.go`
- Create: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\mysql_repository.go`
- Create: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\handler_test.go`

- [ ] 先写失败测试：审计日志列表、实体快照列表、学生流转列表、老师任课历史列表
- [ ] 再写失败测试：学生流转录入、老师任课变更录入
- [ ] 验证测试确实失败
- [ ] 建立 `snapshot` 模块基本模型、权限校验和路由

### Task 3: 学生流转命令实现

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\model.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\mysql_repository.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\handler_test.go`

- [ ] 实现 `POST /student-transitions` 输入校验
- [ ] 在事务内完成：读取当前归属、关闭旧归属、按类型创建新归属或更新 profile
- [ ] 写入 `student_transitions`
- [ ] 写入学生实体快照与审计日志
- [ ] 跑 snapshot 模块测试直到通过

### Task 4: 老师任课变更命令实现

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\model.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\mysql_repository.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\snapshot\handler_test.go`

- [ ] 实现 `POST /teacher-assignment-changes` 输入校验
- [ ] 在事务内完成 `assign / unassign`
- [ ] 写入 `teacher_assignment_histories`
- [ ] 写入老师任课实体快照与审计日志
- [ ] 跑 snapshot 模块测试直到通过

### Task 5: 管理端概览接口

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\model.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\handler.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\mysql_repository.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\handler_test.go`

- [ ] 先写失败测试：`GET /analytics/admin-overview`
- [ ] 验证失败
- [ ] 实现概览聚合与最近记录查询
- [ ] 跑 analytics 模块测试直到通过

### Task 6: 组织与考试关键事件补写审计 / 快照

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\org\model.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\org\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\org\handler.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\org\handler_test.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\exam\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\exam\handler_test.go`

- [ ] 在组织新增 / 更新 / 停用后写审计日志与实体快照
- [ ] 在考试发布后写审计日志与实体快照
- [ ] 验证现有测试并补充关键断言

### Task 7: SDK 契约扩展

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.ts`
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.test.ts`

- [ ] 先写失败测试：管理端概览、历史列表、学生流转提交、老师任课变更提交
- [ ] 验证失败
- [ ] 实现 SDK 方法与类型
- [ ] 跑 SDK 测试直到通过

### Task 8: 管理端看板与历史页面

**Files:**
- Create: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\analytics-panel.tsx`
- Create: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\analytics-panel.test.tsx`
- Create: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\history-panel.tsx`
- Create: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\history-panel.test.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.test.tsx`

- [ ] 先写失败测试：打开数据看板、打开快照历史页、提交流转表单、提交任课变更表单
- [ ] 验证失败
- [ ] 实现管理端数据看板
- [ ] 实现快照历史页与两个录入表单
- [ ] 跑 admin-web 测试直到通过

### Task 9: 菜单、服务注册与文档收尾

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\rbac\menu.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\rbac\menu_service_test.go`
- Modify: `D:\workspace\projects\aios_practice_platform\cmd\server\main.go`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\28_stage6_admin_analytics_snapshot_status.md`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\README.md`

- [ ] 注册 snapshot handler
- [ ] 为管理端新增“数据看板”“快照历史”菜单
- [ ] 同步正式 OpenAPI 与状态文档

### Task 10: 全量验证与提交

**Files:**
- Verify only

- [ ] 运行 `go test ./...`
- [ ] 运行 `pnpm test`
- [ ] 运行 `pnpm typecheck`
- [ ] 运行 `git diff --check`
- [ ] 检查修改文件 UTF-8 无 BOM
- [ ] 使用中文提交信息提交
