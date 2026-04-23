# 老师侧考试答卷明细 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为老师考试管理页补齐单个学生答卷明细与按题查看能力。

**Architecture:** 继续沿用 `analytics` 模块承接老师侧查询接口，前端保持在 `TeacherExamPage` 中完成统计页到答卷明细的二级查看。接口返回老师视角的答卷摘要与题目明细，前端按题切换展示。

**Tech Stack:** Go, Gin, MySQL, sqlmock, TypeScript, React, Vitest, OpenAPI

---

### Task 1: 后端接口与模型

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\model.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\handler.go`
- Test: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\handler_test.go`

- [ ] 定义 `ExamAttemptReviewQuery / Summary / QuestionItem / Result`
- [ ] 为 `Repository`、`Service`、`Handler` 增加老师侧答卷明细方法
- [ ] 补 handler 内存仓储测试

### Task 2: 仓储查询

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\mysql_repository.go`
- Test: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\mysql_repository_test.go`

- [ ] 实现答卷摘要查询
- [ ] 实现按题答卷明细查询
- [ ] 补 sqlmock 仓储测试

### Task 3: SDK 与老师页接入

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.ts`
- Test: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.test.ts`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.test.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.test.tsx`

- [ ] 在 SDK 中增加老师侧答卷明细查询方法
- [ ] 在成绩列表中增加“查看答卷”入口
- [ ] 展示答卷摘要与按题查看区
- [ ] 补前端与路由守卫测试

### Task 4: 文档与验证

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\27_stage2g_exam_main_flow_status.md`

- [ ] 为 `GET /api/v1/analytics/exam-attempt-review` 补齐强类型 schema
- [ ] 更新考试主链路状态文档
- [ ] 运行 `go test ./...`、`pnpm test`、`pnpm typecheck`、`git diff --check`
