# 阶段 2F 老师讲评（单题详情页）Implementation Plan

日期：2026-04-23
状态：执行中

## 1. 目标

为老师侧单题详情页补齐最小讲评能力：支持加载当前老师讲评并保存更新。

## 2. 任务清单

- [ ] Task 1：新增 `practice_session_question_reviews` 迁移。
- [ ] Task 2：后端 analytics 扩展详情返回并新增讲评保存接口。
- [ ] Task 3：SDK 与 OpenAPI 同步讲评类型与接口。
- [ ] Task 4：前端单题详情页增加讲评输入与保存交互。
- [ ] Task 5：更新阶段状态文档并执行回归。

## 3. 验证命令

```powershell
go test ./internal/modules/analytics
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/student-practice-session-question-detail-page.test.tsx apps/user-web/src/app.test.tsx
pnpm typecheck
go run -work D:\workspace\temp\openapi_parse_stage2f.go
```
