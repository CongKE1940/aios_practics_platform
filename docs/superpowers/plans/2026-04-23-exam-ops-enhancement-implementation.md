# 考试运营增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为老师侧补齐成绩筛选与导出、批阅工作台，为学生侧补齐考试异常恢复。

**Architecture:** 基于现有考试主链路增量扩展，不重构考试核心模型。老师侧围绕 analytics 模块扩展筛选、导出与批阅状态；学生侧复用现有考试 attempt 查询接口做恢复，前端补充本地恢复信息与失败重试体验。

**Tech Stack:** Go、Gin、MySQL、TypeScript、React、Vitest

---

### Task 1: 文档与契约基线

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\27_stage2g_exam_main_flow_status.md`

- [x] 先为考试统计筛选、CSV 导出、异常恢复补齐正式契约描述
- [x] 定义 `attempt_status` / `review_status` / `keyword` 查询参数
- [x] 定义 CSV 导出接口说明和老师批阅工作台状态说明

### Task 2: 老师侧成绩筛选与导出后端

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\model.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\service.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\handler.go`
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\mysql_repository.go`
- Test: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\handler_test.go`
- Test: `D:\workspace\projects\aios_practice_platform\internal\modules\analytics\mysql_repository_test.go`

- [x] 先写失败测试：考试统计查询支持新筛选参数、导出接口返回 CSV
- [x] 验证测试先失败，确认覆盖点正确
- [x] 实现 `ExamOverviewQuery` 新字段与批阅状态派生字段
- [x] 实现 `GET /analytics/exam-overview-export`
- [x] 跑 analytics 模块测试直到通过

### Task 3: SDK 与老师页筛选/导出前端

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.ts`
- Test: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.test.ts`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.test.tsx`

- [x] 先写失败测试：SDK 导出调用、老师页筛选提交/重置/导出
- [x] 验证测试失败
- [x] 实现 SDK 的 CSV 导出方法
- [x] 实现老师页筛选栏、批阅状态列、导出按钮
- [x] 跑前端相关测试直到通过

### Task 4: 批阅工作台增强

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.test.tsx`

- [x] 先写失败测试：自动定位首个待批阅题、只看待批阅、上一题下一题、批阅进度显示
- [x] 验证测试失败
- [x] 在老师页实现待批阅过滤、批阅队列导航和进度提示
- [x] 确保批阅保存后界面状态能同步前进
- [x] 跑老师页测试直到通过

### Task 5: 学生考试异常恢复

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.ts`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\student-exam-page.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\student-exam-page.test.tsx`

- [x] 先写失败测试：刷新恢复 in_progress 作答、保存失败可重试、交卷失败不丢上下文
- [x] 验证测试失败
- [x] 复用 `getExamAttempt` 做学生侧恢复
- [x] 用本地存储持久化最近一次未完成考试
- [x] 补齐错误提示和重试动作
- [x] 跑学生页测试直到通过

### Task 6: 全量文档与验证

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\27_stage2g_exam_main_flow_status.md`

- [ ] 同步最终接口与页面行为到文档
- [ ] 运行 `go test ./...`
- [ ] 运行 `pnpm test`
- [ ] 运行 `pnpm typecheck`
- [ ] 运行 `git diff --check`
- [ ] 检查 UTF-8 无 BOM
- [ ] 使用中文提交信息提交
