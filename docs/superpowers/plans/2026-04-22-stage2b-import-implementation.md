# 阶段 2B 模板导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成题库、题目 CSV 模板下载、同步导入任务、行级结果查看、SDK 与管理端导入中心闭环。

**Architecture:** 后端新增 `internal/modules/importjob`，以同步服务串联 CSV 解析、行级校验、导入任务持久化和业务表写入；先用仓库接口隔离 MySQL 和测试内存实现。前端在 API SDK 增补导入方法，管理端新增 `/admin/imports` 页面并通过 RBAC 菜单进入。

**Tech Stack:** Go 1.x、Gin、MySQL、React、TypeScript、Vitest、Testing Library、OpenAPI YAML。

---

## File Structure

- Create: `internal/modules/importjob/model.go`，定义导入任务、行结果、请求体、分页、状态、错误码与仓库接口。
- Create: `internal/modules/importjob/parser.go`，解析和归一化题库、题目 CSV 行。
- Create: `internal/modules/importjob/service.go`，执行同步导入、生成任务统计、隔离租户查询。
- Create: `internal/modules/importjob/handler.go`，注册模板下载、任务创建、任务列表、详情和行结果接口。
- Create: `internal/modules/importjob/mysql_repository.go`，读写 `import_jobs`、`import_job_rows`，并写入题库、题目、版本、题库关联。
- Create: `internal/modules/importjob/handler_test.go`，覆盖模板、导入、权限、跨租户和行结果。
- Modify: `cmd/server/main.go`，注册导入模块。
- Modify: `internal/modules/rbac/menu.go` and `internal/modules/rbac/menu_service_test.go`，新增导入中心菜单。
- Modify: `packages/api-sdk/src/client.ts` and `packages/api-sdk/src/client.test.ts`，新增导入 API 类型与方法。
- Create: `apps/admin-web/src/import-panel.tsx` and `apps/admin-web/src/import-panel.test.tsx`，新增导入中心页面与测试。
- Modify: `apps/admin-web/src/app.tsx` and `apps/admin-web/src/app.test.tsx`，接入导入中心路由和注入 API。
- Modify: `docs/api/openapi.yaml` and `docs/docs/openapi_design_v1.md`，补齐正式导入接口契约。
- Create: `docs/docs/22_stage2b_implementation_status.md`，记录阶段 2B 状态。
- Modify: `docs/README.md`，加入阶段 2B 状态入口。

## Task 1: 后端导入模块测试骨架

**Files:**
- Create: `internal/modules/importjob/handler_test.go`

- [ ] **Step 1: Write the failing backend handler tests**

Add tests that construct a Gin router with a fake token parser and memory repository:

```go
func TestHandlerTemplateDownloadAndJobLifecycle(t *testing.T) {
    repo := newMemoryImportRepository()
    router := newImportTestRouter(repo, fakeImportParser{claims: auth.AccessClaims{TenantID: 1, UserID: 9, Permissions: []string{"import:manage"}}})

    templateReq := httptest.NewRequest(http.MethodGet, "/api/v1/import/templates/question", nil)
    templateReq.Header.Set("Authorization", "Bearer ok")
    templateResp := httptest.NewRecorder()
    router.ServeHTTP(templateResp, templateReq)
    require.Equal(t, http.StatusOK, templateResp.Code)
    require.Contains(t, templateResp.Body.String(), "bank_name")

    body := `{"import_type":"question_bank","template_version":"v1","file_url":"/api/v1/files/1/content","content":"bank_name,owner_scope_type,owner_scope_name,course_name,description,status\n阶段2题库,,,数学,说明,active\n"}`
    createReq := httptest.NewRequest(http.MethodPost, "/api/v1/import/jobs", strings.NewReader(body))
    createReq.Header.Set("Authorization", "Bearer ok")
    createReq.Header.Set("Content-Type", "application/json")
    createResp := httptest.NewRecorder()
    router.ServeHTTP(createResp, createReq)
    require.Equal(t, http.StatusOK, createResp.Code)
}
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run: `go test -work ./internal/modules/importjob`

Expected: FAIL because package `internal/modules/importjob` does not exist.

## Task 2: 后端导入模块最小实现

**Files:**
- Create: `internal/modules/importjob/model.go`
- Create: `internal/modules/importjob/parser.go`
- Create: `internal/modules/importjob/service.go`
- Create: `internal/modules/importjob/handler.go`
- Create: `internal/modules/importjob/mysql_repository.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Implement model and repository contracts**

Define `ImportJob`, `ImportJobRow`, `ImportJobInput`, `ImportJobListFilter`, `ImportJobRowFilter`, `Scope`, `PageResult[T]`, import statuses, row statuses, stable error codes, and repository methods for task persistence plus course/bank lookup and business writes.

- [ ] **Step 2: Implement CSV parser and validation**

Parse with `encoding/csv`; trim fields; validate exact headers for `question_bank` and `question`; normalize successful rows into maps; produce row-level failures with Chinese messages and stable codes such as `required_field_missing`, `invalid_status`, `course_not_found`, `bank_not_found`, `invalid_question_type`, `invalid_answer`.

- [ ] **Step 3: Implement synchronous service**

Create the job in `uploaded`, parse content, process rows, write successful business entities, persist every row result, then update final status to `success`, `partial_success`, or `failed` with row counters and summary.

- [ ] **Step 4: Implement Gin handler**

Register:

```text
GET /import/templates/:type
POST /import/jobs
GET /import/jobs
GET /import/jobs/:id
GET /import/jobs/:id/rows
```

Authorize via `import:manage`; return 401/403/404/400 using existing response envelope; templates return `text/csv; charset=utf-8`.

- [ ] **Step 5: Implement MySQL repository and server registration**

Use transactions for `CreateJobWithRows` and business writes; query by `tenant_id`; insert imported questions with version 1 and `source_type='import'`; register handler in `cmd/server/main.go`.

- [ ] **Step 6: Run backend module tests**

Run: `go test -work ./internal/modules/importjob`

Expected: PASS.

## Task 3: 菜单、SDK 与管理端导入中心

**Files:**
- Modify: `internal/modules/rbac/menu.go`
- Modify: `internal/modules/rbac/menu_service_test.go`
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Create: `apps/admin-web/src/import-panel.tsx`
- Create: `apps/admin-web/src/import-panel.test.tsx`
- Modify: `apps/admin-web/src/app.tsx`
- Modify: `apps/admin-web/src/app.test.tsx`

- [ ] **Step 1: Add failing SDK and UI tests**

Cover raw template download, create/list/detail/rows import job methods, RBAC menu inclusion for `import:manage`, App route rendering, and ImportPanel create + row viewing flow.

- [ ] **Step 2: Implement SDK methods**

Add `ImportType`, `ImportJob`, `ImportJobInput`, `ImportJobRow`, query types, and methods:

```ts
downloadImportTemplate(type: "question" | "question_bank" | "exam"): Promise<string>;
createImportJob(body: ImportJobInput): Promise<ImportJob>;
listImportJobs(query?: ImportJobListQuery): Promise<PageResult<ImportJob>>;
getImportJob(id: number): Promise<ImportJob>;
listImportJobRows(id: number, query?: ImportJobRowListQuery): Promise<PageResult<ImportJobRow>>;
```

- [ ] **Step 3: Implement admin import panel**

Build a functional page with template buttons, import type/version/file URL/content inputs, task table, and row result table. Use existing admin panel patterns and keep controls compact and stable.

- [ ] **Step 4: Register route and menu**

Add `/admin/imports` branch to `App`, pass `importApi`, and add menu item `导入中心` requiring `import:manage`.

- [ ] **Step 5: Run frontend tests**

Run: `pnpm test`

Expected: PASS.

## Task 4: OpenAPI 与阶段文档

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Create: `docs/docs/22_stage2b_implementation_status.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update OpenAPI**

Replace old multipart import job draft with JSON `ImportJobInput`, add template download text response, list/detail/rows schemas and query params.

- [ ] **Step 2: Update design docs and status**

Record Stage 2B delivered scope, known limitations, verification commands, and next recommended Stage 2C direction.

- [ ] **Step 3: Parse OpenAPI**

Run a temporary Go YAML parse script with `github.com/goccy/go-yaml`, then delete the script.

Expected: parse succeeds.

## Task 5: 全量验证与提交

**Files:**
- All changed files

- [ ] **Step 1: Run full verification**

Run:

```powershell
go test -work ./...
pnpm test
pnpm typecheck
pnpm build
```

Expected: tests/build pass and no stale citation markers remain. Sensitive credentials should be checked without writing known secrets into repository files.

- [ ] **Step 2: Check encoding and line endings**

Run a UTF-8/BOM/mixed-line check that skips `.git`, `node_modules`, `dist`, and `temp`.

Expected: no UTF-8 BOM or mixed CRLF/LF problems.

- [ ] **Step 3: Stage and commit**

Run:

```powershell
git add cmd internal apps packages docs
git diff --cached --check
git commit -m "新增：完成阶段2b模板导入闭环"
```

Expected: commit succeeds and worktree is clean.
