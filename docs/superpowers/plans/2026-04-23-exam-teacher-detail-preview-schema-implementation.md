# 考试老师详情编辑与预览实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐老师侧考试详情编辑页与试卷预览页，并把考试相关 OpenAPI 响应正式收口成强类型 schema。

**Architecture:** 复用现有 `TeacherExamPage` 与考试模块后端接口，不新增独立老师路由。前端通过“列表选中详情 + 草稿回填编辑 + 预览区域”完成增强；SDK 补 `getExam / updateExam`；正式契约在 `docs/api/openapi.yaml` 中从通用 `Ok` 收口到专用响应组件。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Go/Gin、手写 `packages/api-sdk`、OpenAPI YAML。

---

### Task 1: 先补前端老师考试页失败测试

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖查看详情、回填编辑、试卷预览**
- [ ] **Step 2: 运行定向测试并确认失败原因来自能力缺失**

### Task 2: 扩展老师考试页 API 接口与页面状态

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\teacher-exam-page.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.tsx`

- [ ] **Step 1: 增加 `getExam / updateExam` API 约束与类型守卫**
- [ ] **Step 2: 实现列表详情加载、草稿回填编辑、更新提交**
- [ ] **Step 3: 实现固定试卷与随机组卷预览区域**
- [ ] **Step 4: 跑老师页与应用壳定向测试，确认转绿**

### Task 3: 补真实菜单入口

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\internal\modules\rbac\menu.go`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖真实菜单中的考试入口**
- [ ] **Step 2: 最小修改菜单构建逻辑，补 `/app/exams`**
- [ ] **Step 3: 跑相关测试确认不影响既有学习菜单**

### Task 4: 扩展 SDK 能力

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.ts`
- Modify: `D:\workspace\projects\aios_practice_platform\packages\api-sdk\src\client.test.ts`

- [ ] **Step 1: 为考试补 `getExam / updateExam` 类型与方法**
- [ ] **Step 2: 写请求路径和响应解析测试**
- [ ] **Step 3: 运行 SDK 定向测试确认通过**

### Task 5: 收口考试 OpenAPI 强类型响应

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml`
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md`

- [ ] **Step 1: 为考试列表、详情、作答、结果增加专用 schema 与 response**
- [ ] **Step 2: 将考试路径从通用 `Ok` 改为专用响应引用**
- [ ] **Step 3: 同步设计文档中的接口说明**

### Task 6: 更新阶段文档与最终验证

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\27_stage2g_exam_main_flow_status.md`

- [ ] **Step 1: 记录本轮新增能力与验证命令**
- [ ] **Step 2: 运行 `pnpm test`、`pnpm typecheck`、`go test ./...`、`git diff --check`**
- [ ] **Step 3: 如验证通过，按中文提交信息提交代码**
