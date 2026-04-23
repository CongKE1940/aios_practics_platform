# 阶段 2F 老师侧单题完整详情页 Implementation Plan

日期：2026-04-23
状态：已完成

## 1. 目标

基于已完成的“老师侧单次练题详情页”，继续下钻到“单题完整详情页”，补齐后端接口、SDK/OpenAPI 契约、前端路由与页面，并完成配套测试与状态文档同步。

## 2. 范围

1. 新增老师侧只读接口：`GET /api/v1/analytics/student-practice-session-question-detail`。
2. 新增用户端页面：`/app/class-learning/student/session/question`。
3. 在单次练题详情页每道题增加“查看题目详情”入口。
4. 同步 `packages/api-sdk`、`docs/api/openapi.yaml`、`docs/docs/openapi_design_v1.md`。
5. 更新阶段状态文档：`docs/docs/26_stage2f_implementation_status.md`。

本次不包含老师讲评、轨迹时间线、导出能力。

## 3. 执行任务

- [x] Task 1：后端 `analytics` 新增单题详情模型、服务与路由。
- [x] Task 2：MySQL 仓储新增单题详情查询能力与仓储测试。
- [x] Task 3：SDK 与 OpenAPI 契约补齐单题详情。
- [x] Task 4：用户端新增单题详情页面并接入路由与入口。
- [x] Task 5：更新阶段状态文档并执行回归验证。

## 4. 验证命令

```powershell
go test ./internal/modules/analytics
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/student-practice-session-detail-page.test.tsx apps/user-web/src/student-practice-session-question-detail-page.test.tsx apps/user-web/src/app.test.tsx
pnpm typecheck
go run -work D:\workspace\temp\openapi_parse_stage2f.go
```

## 5. 完成标准

1. 老师可从单次练题详情页进入单题详情页并返回原会话详情页。
2. 新接口满足租户、班级课程、学生归属、会话归属与题目归属校验。
3. OpenAPI 与 SDK 契约一致，测试通过。
4. 阶段状态文档与当前能力保持一致，无“已实现能力仍写为未支持”的描述冲突。
