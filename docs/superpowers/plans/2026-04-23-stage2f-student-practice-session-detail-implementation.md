# 阶段 2F 老师侧单次练题详情页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从老师侧学生学习详情页继续下钻到“单次练题详情”，提供只读的 session 级题目作答明细。

**Architecture:** 延续 `internal/modules/analytics` 作为老师视角只读域，不复用学生端 `practice:use` 接口。后端新增 `student-practice-session-detail` 查询与权限校验，SDK/OpenAPI 同步扩展。前端在 `apps/user-web` 增加单次练题详情页，并在学生详情页 `sessions` 标签增加下钻入口与返回链路。

**Tech Stack:** Go, Gin, MySQL 8, sqlmock, React 18, TypeScript, Vitest, OpenAPI 3.0 YAML.

---

## 文件清单

- 修改：`internal/modules/analytics/model.go`
- 修改：`internal/modules/analytics/service.go`
- 修改：`internal/modules/analytics/handler.go`
- 修改：`internal/modules/analytics/handler_test.go`
- 修改：`internal/modules/analytics/mysql_repository.go`
- 修改：`internal/modules/analytics/mysql_repository_test.go`
- 修改：`packages/api-sdk/src/client.ts`
- 修改：`packages/api-sdk/src/client.test.ts`
- 修改：`docs/api/openapi.yaml`
- 修改：`docs/docs/openapi_design_v1.md`
- 修改：`apps/user-web/src/student-learning-detail-page.tsx`
- 修改：`apps/user-web/src/student-learning-detail-page.test.tsx`
- 新增：`apps/user-web/src/student-practice-session-detail-page.tsx`
- 新增：`apps/user-web/src/student-practice-session-detail-page.test.tsx`
- 修改：`apps/user-web/src/app.tsx`
- 修改：`apps/user-web/src/app.test.tsx`
- 修改：`docs/docs/26_stage2f_implementation_status.md`

## Task 1：后端接口骨架与服务测试

**Files:**
- Modify: `internal/modules/analytics/model.go`
- Modify: `internal/modules/analytics/service.go`
- Modify: `internal/modules/analytics/handler.go`
- Modify: `internal/modules/analytics/handler_test.go`

- [ ] **Step 1: Write failing tests**

在 `internal/modules/analytics/handler_test.go` 增加测试：

```go
func TestHandler_GetStudentPracticeSessionDetailSuccess(t *testing.T)
func TestHandler_GetStudentPracticeSessionDetailRejectsTeacherWithoutAssignment(t *testing.T)
func TestHandler_GetStudentPracticeSessionDetailRejectsStudentOutsideClass(t *testing.T)
func TestHandler_GetStudentPracticeSessionDetailRejectsSessionNotBelongToStudent(t *testing.T)
func TestHandler_GetStudentPracticeSessionDetailRejectsInvalidQuery(t *testing.T)
```

请求样例：

```go
rec := performAnalyticsRequest(
  router,
  http.MethodGet,
  "/api/v1/analytics/student-practice-session-detail?class_id=301&course_id=10&student_user_id=501&session_id=9001",
  nil,
  "token",
)
```

断言核心字段：
- `data.student_summary.student_user_id`
- `data.session.session_id`
- `data.questions[0].session_question_id`

- [ ] **Step 2: Run tests to verify fail**

Run:

```powershell
go test ./internal/modules/analytics -run "StudentPracticeSessionDetail" -count=1
```

Expected: FAIL，提示缺少路由、类型或服务方法。

- [ ] **Step 3: Implement minimal backend skeleton**

在 `model.go` 增加：

```go
type StudentPracticeSessionDetailQuery struct {
  TenantID      int64
  ClassID       int64
  CourseID      int64
  StudentUserID int64
  SessionID     int64
}
```

```go
type StudentPracticeSessionStudentSummary struct { ... }
type StudentPracticeSessionSummary struct { ... }
type StudentPracticeSessionQuestionItem struct { ... }
type StudentPracticeSessionDetailResult struct { ... }
```

在 `Repository` 增加：

```go
GetStudentPracticeSessionDetail(ctx context.Context, query StudentPracticeSessionDetailQuery) (StudentPracticeSessionDetailResult, error)
```

在 `service.go` 增加：

```go
func (service *Service) GetStudentPracticeSessionDetail(ctx context.Context, scope Scope, query StudentPracticeSessionDetailQuery) (StudentPracticeSessionDetailResult, error)
```

逻辑顺序：
1. 权限 `analytics:view`。
2. 参数正整数校验。
3. 校验班级课程可见范围（teacher 先验任课后验存在性）。
4. 校验学生在班级。
5. 调仓储查询明细。

在 `handler.go` 注册与解析：

```go
router.GET("/analytics/student-practice-session-detail", handler.getStudentPracticeSessionDetail)
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
go test ./internal/modules/analytics -run "StudentPracticeSessionDetail" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/modules/analytics/model.go internal/modules/analytics/service.go internal/modules/analytics/handler.go internal/modules/analytics/handler_test.go
git commit -m "新增：补齐老师侧单次练题详情接口骨架"
```

## Task 2：MySQL 仓储查询与去重口径

**Files:**
- Modify: `internal/modules/analytics/mysql_repository.go`
- Modify: `internal/modules/analytics/mysql_repository_test.go`

- [ ] **Step 1: Write failing repository tests**

新增：

```go
func TestMySQLRepositoryGetStudentPracticeSessionDetailSuccess(t *testing.T)
func TestMySQLRepositoryGetStudentPracticeSessionDetailReturnsNotFoundWhenSessionMismatch(t *testing.T)
```

关键断言：
- `session_id + student_user_id + course_id + tenant_id` 绑定。
- 题目按 `display_order ASC`。
- 答案按 `session_question_id + user_id` 取 `MAX(id)` 最新答案。
- `answered_count/correct_count/wrong_count/accuracy` 与题目明细一致。

- [ ] **Step 2: Run tests to verify fail**

```powershell
go test ./internal/modules/analytics -run "StudentPracticeSessionDetailSuccess|StudentPracticeSessionDetailReturnsNotFound" -count=1
```

Expected: FAIL.

- [ ] **Step 3: Implement repository query**

在 `mysql_repository.go` 增加：

```go
func (repo *MySQLRepository) GetStudentPracticeSessionDetail(ctx context.Context, query StudentPracticeSessionDetailQuery) (StudentPracticeSessionDetailResult, error)
```

实现要点：
1. 查询 `student_summary`：学生、班级、课程名称与学号。
2. 查询 session 基础信息并验证归属。
3. 查询题目列表（`practice_session_questions` + `presented_options_json`）。
4. 关联最新答案子查询：

```sql
SELECT pa1.session_question_id, pa1.user_id, pa1.answer_json, pa1.is_correct, pa1.answered_at
FROM practice_answers pa1
JOIN (
  SELECT session_question_id, user_id, MAX(id) AS max_id
  FROM practice_answers
  GROUP BY session_question_id, user_id
) latest ON latest.max_id = pa1.id
```

5. 计算汇总字段并填充 `Session`。

- [ ] **Step 4: Run targeted repository tests**

```powershell
go test ./internal/modules/analytics -run "StudentPracticeSessionDetailSuccess|StudentPracticeSessionDetailReturnsNotFound|StudentPracticeSummary|StudentPracticeSessions" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/modules/analytics/mysql_repository.go internal/modules/analytics/mysql_repository_test.go
git commit -m "新增：补齐老师侧单次练题详情仓储查询"
```

## Task 3：SDK 与 OpenAPI 契约

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`

- [ ] **Step 1: Write failing SDK test**

新增测试：

```ts
it("queries student practice session detail analytics", async () => { ... });
```

断言 URL：

```text
/analytics/student-practice-session-detail?class_id=301&course_id=10&student_user_id=501&session_id=9001
```

- [ ] **Step 2: Run test to verify fail**

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: FAIL，`getStudentPracticeSessionDetail` 未定义。

- [ ] **Step 3: Implement SDK/OpenAPI**

在 `client.ts` 增加类型：
- `StudentPracticeSessionDetailQuery`
- `StudentPracticeSessionStudentSummary`
- `StudentPracticeSessionSummary`
- `StudentPracticeSessionQuestionItem`
- `StudentPracticeSessionDetailResult`

在 `ApiClient` 增加：

```ts
getStudentPracticeSessionDetail(query: StudentPracticeSessionDetailQuery): Promise<StudentPracticeSessionDetailResult>;
```

在 `createApiClient` 增加实现：

```ts
request(fetcher, options, buildPath("/analytics/student-practice-session-detail", query), { method: "GET" })
```

在 `openapi.yaml` 增加：
- `GET /analytics/student-practice-session-detail`
- `StudentPracticeSessionDetailOk`
- 对应 response/schema。

在 `openapi_design_v1.md` 增补接口说明与权限口径。

- [ ] **Step 4: Run contract verification**

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
go run -work D:\workspace\temp\openapi_parse_stage2f.go
```

Expected: PASS 且 `openapi_parse_ok`。

- [ ] **Step 5: Commit**

```powershell
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts docs/api/openapi.yaml docs/docs/openapi_design_v1.md
git commit -m "文档：补齐单次练题详情SDK与OpenAPI契约"
```

## Task 4：用户端详情页与路由下钻

**Files:**
- Modify: `apps/user-web/src/student-learning-detail-page.tsx`
- Modify: `apps/user-web/src/student-learning-detail-page.test.tsx`
- Create: `apps/user-web/src/student-practice-session-detail-page.tsx`
- Create: `apps/user-web/src/student-practice-session-detail-page.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Write failing UI tests**

新增测试：

```ts
it("navigates from student sessions tab to session detail page", async () => { ... })
it("loads student practice session detail page", async () => { ... })
it("returns to student detail with context preserved", async () => { ... })
it("shows invalid message when session detail query is invalid", async () => { ... })
```

- [ ] **Step 2: Run tests to verify fail**

```powershell
pnpm test -- apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/student-practice-session-detail-page.test.tsx apps/user-web/src/app.test.tsx
```

Expected: FAIL，缺少新页面或路由。

- [ ] **Step 3: Implement frontend**

在 `student-learning-detail-page.tsx` 的 `sessions` 列表中增加按钮：

```tsx
onNavigate(`/app/class-learning/student/session?...`)
```

新增 `student-practice-session-detail-page.tsx`：
1. 解析 `class_id/course_id/student_user_id/session_id`。
2. 调 `api.getStudentPracticeSessionDetail`。
3. 展示学生摘要、session 摘要、题目列表。
4. 返回按钮回 `student` 详情路径并保留 `start_at/end_at`。

在 `app.tsx` 增加分支：

```tsx
selectedRoute.startsWith("/app/class-learning/student/session")
```

确保分支顺序：
1. `student/session`
2. `student`
3. `class-learning`

- [ ] **Step 4: Run frontend tests**

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/student-practice-session-detail-page.test.tsx apps/user-web/src/app.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/user-web/src/student-learning-detail-page.tsx apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/student-practice-session-detail-page.tsx apps/user-web/src/student-practice-session-detail-page.test.tsx apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：补齐老师侧单次练题详情页面"
```

## Task 5：阶段状态文档与最终验证

**Files:**
- Modify: `docs/docs/26_stage2f_implementation_status.md`

- [ ] **Step 1: Update status document**

追加完成项：
- analytics 新增 `student-practice-session-detail`
- user-web 新增 `StudentPracticeSessionDetailPage`

更新当前限制：
- 说明“完整题目详情页和老师讲评能力仍未包含在本次范围”。

- [ ] **Step 2: Run targeted verification**

```powershell
git diff --check
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/student-practice-session-detail-page.test.tsx apps/user-web/src/app.test.tsx
go test ./internal/modules/analytics
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

```powershell
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
go run -work D:\workspace\temp\openapi_parse_stage2f.go
```

Expected: PASS 且 `openapi_parse_ok`。

- [ ] **Step 4: Commit**

```powershell
git add docs/docs/26_stage2f_implementation_status.md
git commit -m "文档：同步单次练题详情实施状态"
```

## 自检

### 1. Spec coverage

覆盖映射：
1. 老师从学生详情页进入单次练题详情：Task 4。
2. analytics 只读接口与权限边界：Task 1、Task 2。
3. session 题目明细与最新答案口径：Task 2。
4. SDK/OpenAPI/文档同步：Task 3、Task 5。
5. 返回链路上下文保留：Task 4。

无遗漏项。

### 2. Placeholder scan

本计划未使用 `TBD`、`TODO`、`后续补`、`类似上文` 等占位语句。每个任务包含明确文件、命令、预期结果和提交节点。

### 3. Type consistency

统一命名：
1. `StudentPracticeSessionDetailQuery`
2. `StudentPracticeSessionStudentSummary`
3. `StudentPracticeSessionSummary`
4. `StudentPracticeSessionQuestionItem`
5. `StudentPracticeSessionDetailResult`
6. `getStudentPracticeSessionDetail`
7. `StudentPracticeSessionDetailPage`

前后端统一使用 `student_user_id` 作为对外字段，不混用 `student_id`。
