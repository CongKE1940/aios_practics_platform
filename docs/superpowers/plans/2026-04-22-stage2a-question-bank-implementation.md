# Stage 2A Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成阶段 2A 的管理端题库管理、题目编辑与题库下发最小闭环，为后续练题与考试提供稳定题源。

**Architecture:** 后端新增 `questionbank` 与 `question` 两个模块，延续当前 Gin + Service + Repository + TDD 结构；前端在管理端新增题库页与题目页，沿用现有 `OrganizationPanel` / `NoticePanel` 的最小闭环形态。接口契约以 `docs/api/openapi.yaml` 为唯一基线，先更新契约，再落测试与实现。

**Tech Stack:** Go, Gin, database/sql, MySQL 8, React 18, TypeScript, Vite, pnpm, Vitest, Testing Library.

---

## File Map

### Backend

- Create: `internal/modules/questionbank/model.go`
- Create: `internal/modules/questionbank/service.go`
- Create: `internal/modules/questionbank/handler.go`
- Create: `internal/modules/questionbank/mysql_repository.go`
- Create: `internal/modules/questionbank/handler_test.go`
- Create: `internal/modules/question/model.go`
- Create: `internal/modules/question/service.go`
- Create: `internal/modules/question/handler.go`
- Create: `internal/modules/question/mysql_repository.go`
- Create: `internal/modules/question/handler_test.go`
- Modify: `cmd/server/main.go`
- Modify: `internal/modules/rbac/menu.go`

### Frontend / SDK

- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Create: `apps/admin-web/src/question-bank-panel.tsx`
- Create: `apps/admin-web/src/question-bank-panel.test.tsx`
- Create: `apps/admin-web/src/question-panel.tsx`
- Create: `apps/admin-web/src/question-panel.test.tsx`
- Modify: `apps/admin-web/src/app.tsx`
- Modify: `apps/admin-web/src/app.test.tsx`

### Docs

- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Modify: `docs/docs/20_stage1_implementation_status.md`

---

## Task 1: 补齐阶段 2A 契约

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`

- [ ] **Step 1: 为题库接口补完整 schema 与 query 参数**

补充以下契约对象：

```yaml
QuestionBank:
  type: object
  required: [id, tenant_id, owner_org_type, owner_org_id, creator_id, name, status, source_type]
QuestionBankInput:
  type: object
  required: [name]
QuestionBankVisibilityInput:
  type: object
  required: [grants]
```

- [ ] **Step 2: 为题目与版本接口补完整 schema**

补充以下契约对象：

```yaml
Question:
  type: object
QuestionVersion:
  type: object
QuestionInput:
  type: object
QuestionVersionInput:
  type: object
QuestionContentInput:
  type: object
QuestionAnswerInput:
  type: object
```

- [ ] **Step 3: 运行契约结构检查**

Run: `rg -n "question-banks|questions" docs/api/openapi.yaml docs/docs/openapi_design_v1.md`

Expected: 题库、题目、版本、下发字段都能在正式文档中找到。

- [ ] **Step 4: Commit**

```bash
git add docs/api/openapi.yaml docs/docs/openapi_design_v1.md
git commit -m "文档：补齐阶段2a题库与题目契约"
```

## Task 2: 题库模块后端 TDD

**Files:**
- Create: `internal/modules/questionbank/model.go`
- Create: `internal/modules/questionbank/service.go`
- Create: `internal/modules/questionbank/handler.go`
- Create: `internal/modules/questionbank/mysql_repository.go`
- Create: `internal/modules/questionbank/handler_test.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: 先写题库 handler 失败测试**

覆盖以下行为：

```go
func TestHandler_QuestionBankLifecycleAndVisibility(t *testing.T) {}
func TestHandler_QuestionBankRequiresPermission(t *testing.T) {}
func TestHandler_QuestionBankRejectsCrossTenantAccess(t *testing.T) {}
```

断言内容：

1. 可创建题库
2. 可列表查询
3. 可更新
4. 可发布
5. 可写入 visibility 授权
6. 无 `question_bank:manage` 权限返回 403
7. 跨租户访问返回 404

- [ ] **Step 2: 运行测试确认红灯**

Run: `go test -work ./internal/modules/questionbank`

Expected: FAIL，报缺少模块或符号未定义。

- [ ] **Step 3: 写最小模型与服务**

模型至少包含：

```go
type QuestionBank struct {
    ID int64 `json:"id"`
    TenantID int64 `json:"tenant_id"`
    OwnerOrgType string `json:"owner_org_type"`
    OwnerOrgID int64 `json:"owner_org_id"`
    CreatorID int64 `json:"creator_id"`
    CourseID *int64 `json:"course_id"`
    Name string `json:"name"`
    Description string `json:"description,omitempty"`
    Status string `json:"status"`
    SourceType string `json:"source_type"`
}
```

服务规则：

1. 新建默认 `owner_org_type=school`
2. 新建默认 `status=draft`
3. 发布改为 `active`
4. 下发写入 `question_bank_visibility`

- [ ] **Step 4: 写最小 handler 与内存仓储通过测试**

handler 路由：

```go
router.GET("/question-banks", handler.listQuestionBanks)
router.POST("/question-banks", handler.createQuestionBank)
router.PUT("/question-banks/:id", handler.updateQuestionBank)
router.POST("/question-banks/:id/publish", handler.publishQuestionBank)
router.POST("/question-banks/:id/visibility", handler.assignVisibility)
```

- [ ] **Step 5: 运行测试确认绿灯**

Run: `go test -work ./internal/modules/questionbank`

Expected: PASS

- [ ] **Step 6: 落 MySQL 仓储并接到 server**

仓储至少支持：

1. `ListQuestionBanks`
2. `GetQuestionBank`
3. `CreateQuestionBank`
4. `UpdateQuestionBank`
5. `PublishQuestionBank`
6. `ReplaceVisibility`

- [ ] **Step 7: 运行模块与全量后端测试**

Run: `go test -work ./internal/modules/questionbank ./...`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add internal/modules/questionbank cmd/server/main.go
git commit -m "新增：题库管理后端最小闭环"
```

## Task 3: 题目与版本模块后端 TDD

**Files:**
- Create: `internal/modules/question/model.go`
- Create: `internal/modules/question/service.go`
- Create: `internal/modules/question/handler.go`
- Create: `internal/modules/question/mysql_repository.go`
- Create: `internal/modules/question/handler_test.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: 先写题目模块失败测试**

覆盖以下行为：

```go
func TestHandler_QuestionLifecycleAndVersions(t *testing.T) {}
func TestHandler_QuestionRequiresPermission(t *testing.T) {}
```

断言内容：

1. 创建题目时自动生成版本 1
2. 创建题目时写入题库关联
3. 更新主信息不覆盖版本
4. 查询版本列表正确
5. 新增版本时 `version_no` 递增
6. 无 `question:manage` 权限返回 403

- [ ] **Step 2: 运行测试确认红灯**

Run: `go test -work ./internal/modules/question`

Expected: FAIL，报未定义实现。

- [ ] **Step 3: 写最小模型与 JSON 校验**

至少定义：

```go
type QuestionInput struct {
    QuestionType string `json:"question_type" binding:"required"`
    Difficulty string `json:"difficulty"`
    Content map[string]any `json:"content" binding:"required"`
    Answer map[string]any `json:"answer" binding:"required"`
    Analysis map[string]any `json:"analysis"`
    BankIDs []int64 `json:"bank_ids"`
}
```

服务规则：

1. 创建题目默认 `owner_org_type=school`
2. 创建时生成 `structure_hash`
3. 创建时建立 `question_bank_questions`
4. 新增版本后更新 `current_version_id`

- [ ] **Step 4: 写最小 handler 与内存仓储通过测试**

路由：

```go
router.GET("/questions", handler.listQuestions)
router.POST("/questions", handler.createQuestion)
router.PUT("/questions/:id", handler.updateQuestion)
router.GET("/questions/:id/versions", handler.listQuestionVersions)
router.POST("/questions/:id/versions", handler.createQuestionVersion)
```

- [ ] **Step 5: 运行测试确认绿灯**

Run: `go test -work ./internal/modules/question`

Expected: PASS

- [ ] **Step 6: 落 MySQL 仓储并接到 server**

仓储至少支持：

1. 创建题目事务
2. 创建版本事务
3. 题目列表按 `bank_id`、`question_type`、`status` 过滤
4. 版本列表读取

- [ ] **Step 7: 运行模块与全量后端测试**

Run: `go test -work ./internal/modules/question ./...`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add internal/modules/question cmd/server/main.go
git commit -m "新增：题目与版本后端最小闭环"
```

## Task 4: SDK 与菜单 TDD

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Modify: `internal/modules/rbac/menu.go`

- [ ] **Step 1: 先写 SDK 失败测试**

新增测试：

```ts
it("requests question banks and publishes visibility")
it("requests questions and creates versions")
```

断言：

1. SDK 发起 `question-banks` 查询、创建、发布、下发
2. SDK 发起 `questions` 查询、创建、版本查询、版本新增

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm test -- --run packages/api-sdk/src/client.test.ts`

Expected: FAIL，报缺少方法。

- [ ] **Step 3: 补 SDK 类型与方法**

至少新增：

```ts
listQuestionBanks()
createQuestionBank()
updateQuestionBank()
publishQuestionBank()
assignQuestionBankVisibility()
listQuestions()
createQuestion()
updateQuestion()
listQuestionVersions()
createQuestionVersion()
```

- [ ] **Step 4: 补管理端菜单入口**

在 `internal/modules/rbac/menu.go` 增加：

```go
{id: 15, name: "题库管理", path: "/admin/question-banks", requiredPermissions: []string{"question_bank:manage"}},
{id: 16, name: "题目管理", path: "/admin/questions", requiredPermissions: []string{"question:manage"}},
```

- [ ] **Step 5: 运行前后端相关测试**

Run: `pnpm test -- --run packages/api-sdk/src/client.test.ts`

Run: `go test -work ./internal/modules/rbac`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts internal/modules/rbac/menu.go
git commit -m "新增：题库与题目SDK及菜单入口"
```

## Task 5: 管理端题库页 TDD

**Files:**
- Create: `apps/admin-web/src/question-bank-panel.tsx`
- Create: `apps/admin-web/src/question-bank-panel.test.tsx`
- Modify: `apps/admin-web/src/app.tsx`
- Modify: `apps/admin-web/src/app.test.tsx`

- [ ] **Step 1: 先写题库页失败测试**

新增测试：

```tsx
it("loads and renders question banks")
it("creates and publishes question banks")
it("assigns visibility grants")
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm test -- --run apps/admin-web/src/question-bank-panel.test.tsx apps/admin-web/src/app.test.tsx`

Expected: FAIL，报缺少组件或入口。

- [ ] **Step 3: 实现最小题库面板**

界面最小能力：

1. 题库列表
2. 新建题库表单
3. 发布按钮
4. 下发表单（目标类型、目标 ID、权限类型）

- [ ] **Step 4: 接入管理端 app**

在 `app.tsx` 中增加：

```tsx
selectedPath === "/admin/question-banks"
```

并接入默认 SDK API。

- [ ] **Step 5: 运行测试确认绿灯**

Run: `pnpm test -- --run apps/admin-web/src/question-bank-panel.test.tsx apps/admin-web/src/app.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/question-bank-panel.tsx apps/admin-web/src/question-bank-panel.test.tsx apps/admin-web/src/app.tsx apps/admin-web/src/app.test.tsx
git commit -m "新增：管理端题库管理页面"
```

## Task 6: 管理端题目页 TDD

**Files:**
- Create: `apps/admin-web/src/question-panel.tsx`
- Create: `apps/admin-web/src/question-panel.test.tsx`
- Modify: `apps/admin-web/src/app.tsx`
- Modify: `apps/admin-web/src/app.test.tsx`

- [ ] **Step 1: 先写题目页失败测试**

新增测试：

```tsx
it("loads and renders questions")
it("creates objective questions")
it("creates new question versions")
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm test -- --run apps/admin-web/src/question-panel.test.tsx apps/admin-web/src/app.test.tsx`

Expected: FAIL，报缺少组件。

- [ ] **Step 3: 实现最小题目面板**

界面最小能力：

1. 题目列表
2. 单选、多选、判断题创建
3. 绑定题库
4. 版本列表展示
5. 基于当前题目新增版本

- [ ] **Step 4: 接入管理端 app**

在 `app.tsx` 中增加：

```tsx
selectedPath === "/admin/questions"
```

- [ ] **Step 5: 运行测试确认绿灯**

Run: `pnpm test -- --run apps/admin-web/src/question-panel.test.tsx apps/admin-web/src/app.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/question-panel.tsx apps/admin-web/src/question-panel.test.tsx apps/admin-web/src/app.tsx apps/admin-web/src/app.test.tsx
git commit -m "新增：管理端题目管理页面"
```

## Task 7: 文档同步与全量验证

**Files:**
- Modify: `docs/docs/20_stage1_implementation_status.md`
- Optionally Modify: `docs/superpowers/plans/2026-04-22-stage2a-question-bank-implementation.md`

- [ ] **Step 1: 更新阶段文档**

补充：

1. 阶段 2A 已实现能力
2. 当前限制
3. 下一步 2B / 2C 顺序

- [ ] **Step 2: 运行全量验证**

Run: `go test -work ./...`

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: 全部 PASS

- [ ] **Step 3: 检查敏感信息与编码**

Run: 搜索本地开发明文密码、`password_env` 和异常引用标记，确保没有进入源码或正式文档。

Expected: 无结果

- [ ] **Step 4: Commit**

```bash
git add docs/docs/21_stage2a_implementation_status.md
git commit -m "文档：同步阶段2a实施状态"
```

## Spec Coverage Check

本计划覆盖的 spec 要点：

1. 管理端先行：Task 5、Task 6
2. 题库下发授权模型：Task 2
3. 题目版本化：Task 3
4. 学校级归属收敛：Task 2、Task 3 的模型与服务规则
5. SDK 与菜单入口：Task 4
6. 契约先行：Task 1

未纳入本计划的内容与 spec 一致，明确延后：

1. 模板下载与导入
2. 标签、评论、质疑
3. 老师端题库维护
4. 练题与考试
