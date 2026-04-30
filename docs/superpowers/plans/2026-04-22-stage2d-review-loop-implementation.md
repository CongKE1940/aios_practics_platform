# 阶段 2D 练题记录与复习闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成学生端练题结果、练题记录、会话回看、错题本、熟题本、疑惑题和从状态列表继续练的闭环。

**Architecture:** 继续扩展 `internal/modules/practice`，不新增独立复习模块。后端在现有会话、答案和题目状态数据上补查询聚合与按题目列表建会话能力；前端在 `apps/user-web` 内新增轻量页面组件，SDK 统一承接 API 类型和请求方法。

**Tech Stack:** Go 1.x、Gin、MySQL、React、TypeScript、Vitest、Testing Library、OpenAPI YAML。

---

## File Structure

- Modify: `internal/modules/practice/model.go`，新增阶段 2D 请求、响应、分页筛选和仓库接口。
- Modify: `internal/modules/practice/service.go`，新增会话列表、结果详情、从题目列表创建会话、题目状态详情服务。
- Modify: `internal/modules/practice/handler.go`，新增阶段 2D API 路由。
- Modify: `internal/modules/practice/mysql_repository.go`，实现聚合查询和题目状态增强查询。
- Modify: `internal/modules/practice/handler_test.go`，扩展内存仓库和后端行为测试。
- Modify: `internal/modules/rbac/menu.go` and `internal/modules/rbac/menu_service_test.go`，新增学生端复习闭环菜单。
- Modify: `packages/api-sdk/src/client.ts` and `packages/api-sdk/src/client.test.ts`，补齐阶段 2D SDK。
- Modify: `apps/user-web/src/practice-panel.tsx` and `apps/user-web/src/practice-panel.test.tsx`，练题结束后通知外层进入结果页。
- Modify: `apps/user-web/src/app.tsx` and `apps/user-web/src/app.test.tsx`，挂载阶段 2D 页面。
- Create: `apps/user-web/src/practice-review-pages.tsx`，实现结果页、记录页、会话详情页、错题本、熟题本、疑惑题列表。
- Create: `apps/user-web/src/practice-review-pages.test.tsx`，覆盖阶段 2D 学生端页面。
- Modify: `docs/api/openapi.yaml` and `docs/docs/openapi_design_v1.md`，同步阶段 2D API。
- Create: `docs/docs/24_stage2d_implementation_status.md`，记录阶段 2D 实施状态。
- Modify: `docs/README.md`，加入阶段 2D 文档入口。

## Task 1: 后端阶段 2D 红测

**Files:**
- Modify: `internal/modules/practice/handler_test.go`

- [ ] **Step 1: Add failing tests for session history and result detail**

Add tests that:
- create a fixed-count session with 2 questions;
- submit correct answers;
- finish the session;
- call `GET /api/v1/practice/sessions?status=finished&page=1&page_size=20`;
- assert one `PracticeSessionListItem` with `answered_count=2`、`correct_count=2`、`accuracy=1`;
- call `GET /api/v1/practice/sessions/{id}/results`;
- assert the response includes session summary, two questions, user answer, correct answer, analysis and state.

Use these expected response types in tests:

```go
var list practiceEnvelope[PageResult[PracticeSessionListItem]]
var results practiceEnvelope[PracticeSessionResults]
```

- [ ] **Step 2: Add failing tests for state detail and from-questions**

Add tests that:
- answer one question wrongly;
- mark the same question confused;
- call `GET /api/v1/user-question-states?state_type=wrong&bank_id=1`;
- assert one `UserQuestionStateDetail` with `question_type` and `content.stem`;
- call `POST /api/v1/practice/sessions/from-questions` with that `question_id`;
- assert the new session uses that question.

Use this expected response type:

```go
var states practiceEnvelope[PageResult[UserQuestionStateDetail]]
```

- [ ] **Step 3: Add failing tests for empty candidates and cross-user access**

Add tests that:
- `POST /api/v1/practice/sessions/from-questions` with empty `question_ids` returns 400;
- user 8 calling user 7's `GET /api/v1/practice/sessions/{id}/results` returns 404.

- [ ] **Step 4: Extend memory repository only enough for tests to compile after model changes**

After model/interface changes, add these memory repository methods:
- `ListSessions`
- `GetSessionResults`
- `ListCandidatesByQuestionIDs`
- `ListStateDetails`

Each method should filter by `scope.TenantID` and `scope.UserID`. `ListSessions` and `GetSessionResults` should aggregate from `repo.sessions`、`repo.sessionQuestions`、`repo.answers`、`repo.states` instead of inventing new storage.

- [ ] **Step 5: Run backend module test and verify red**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./internal/modules/practice
```

Expected: FAIL before production implementation is complete.

## Task 2: 后端模型、服务和处理器

**Files:**
- Modify: `internal/modules/practice/model.go`
- Modify: `internal/modules/practice/service.go`
- Modify: `internal/modules/practice/handler.go`

- [ ] **Step 1: Add model types**

Add these types to `model.go`:

```go
type PracticeSessionListFilter struct {
	Status       string
	FlowMode     string
	PracticeMode string
	Page         int
	PageSize     int
}

type PracticeSessionListItem struct {
	ID            int64      `json:"id"`
	Status        string     `json:"status"`
	PracticeMode  string     `json:"practice_mode"`
	SourceMode    string     `json:"source_mode"`
	FlowMode      string     `json:"flow_mode"`
	BankIDs       []int64    `json:"bank_ids"`
	StartedAt     time.Time  `json:"started_at,omitempty"`
	EndedAt       *time.Time `json:"ended_at,omitempty"`
	TotalCount    int        `json:"total_count"`
	AnsweredCount int        `json:"answered_count"`
	CorrectCount  int        `json:"correct_count"`
	WrongCount    int        `json:"wrong_count"`
	Accuracy      float64    `json:"accuracy"`
}

type PracticeSessionResults struct {
	Session   PracticeSessionListItem       `json:"session"`
	Questions []PracticeSessionResultQuestion `json:"questions"`
}

type PracticeSessionResultQuestion struct {
	SessionQuestionID int64             `json:"session_question_id"`
	QuestionID        int64             `json:"question_id"`
	QuestionVersionID int64             `json:"question_version_id"`
	DisplayOrder      int               `json:"display_order"`
	QuestionType      string            `json:"question_type"`
	Content           map[string]any     `json:"content"`
	Answer            map[string]any     `json:"answer"`
	CorrectAnswer     map[string]any     `json:"correct_answer"`
	IsCorrect         bool              `json:"is_correct"`
	Analysis          map[string]any     `json:"analysis,omitempty"`
	State             UserQuestionState `json:"state"`
}

type PracticeSessionFromQuestionsInput struct {
	QuestionIDs     []int64 `json:"question_ids" binding:"required"`
	PracticeMode    string  `json:"practice_mode"`
	FlowMode        string  `json:"flow_mode"`
	QuestionCount   int     `json:"question_count"`
	ExcludeMastered bool    `json:"exclude_mastered"`
	RandomSeed      int64   `json:"random_seed"`
}

type UserQuestionStateDetail struct {
	UserQuestionState
	QuestionType string         `json:"question_type"`
	Content      map[string]any `json:"content"`
}
```

Extend `Repository`:

```go
ListSessions(ctx context.Context, scope Scope, filter PracticeSessionListFilter) (PageResult[PracticeSessionListItem], error)
GetSessionResults(ctx context.Context, scope Scope, id int64) (PracticeSessionResults, error)
ListCandidatesByQuestionIDs(ctx context.Context, scope Scope, questionIDs []int64, excludeMastered bool) ([]QuestionCandidate, error)
ListStateDetails(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionStateDetail], error)
```

- [ ] **Step 2: Add service methods**

Add methods to `service.go`:
- `ListSessions(ctx, scope, filter)` normalizes page and delegates repository.
- `GetSessionResults(ctx, scope, id)` delegates repository.
- `ListStateDetails(ctx, scope, filter)` normalizes page and delegates repository.
- `CreateSessionFromQuestions(ctx, scope, input)` normalizes defaults, validates non-empty `question_ids`, asks repository for candidates, shuffles when `random`, limits to `question_count`, builds session questions, and calls `CreateSession`.

Use defaults:
- `practice_mode=random`
- `flow_mode=fixed_count`
- `question_count=10`
- `random_seed=time.Now().Unix()` when absent
- `source_mode=question_list`
- `bank_scope.source_mode=question_list`

- [ ] **Step 3: Add handler routes**

Update `RegisterRoutes`:

```go
router.GET("/practice/sessions", handler.listSessions)
router.POST("/practice/sessions/from-questions", handler.createSessionFromQuestions)
router.GET("/practice/sessions/:id/results", handler.getSessionResults)
```

Add handlers:
- `listSessions` reads `status`、`flow_mode`、`practice_mode`、`page`、`page_size`;
- `createSessionFromQuestions` binds `PracticeSessionFromQuestionsInput`;
- `getSessionResults` uses `authorizeWithID`;
- `listStates` should call `service.ListStateDetails` so existing endpoint returns enhanced rows.

- [ ] **Step 4: Run module test**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./internal/modules/practice
```

Expected: compile failure until MySQL repository implements the extended interface; then PASS after Task 3.

## Task 3: MySQL repository

**Files:**
- Modify: `internal/modules/practice/mysql_repository.go`

- [ ] **Step 1: Implement `ListSessions`**

Query `practice_sessions` by `tenant_id` and `user_id`, left join `practice_session_questions` and `practice_answers`, group by session, and return `PracticeSessionListItem`.

Required behavior:
- supports `status` and `practice_mode` in SQL;
- derives `flow_mode` and `bank_ids` from `bank_scope_json`;
- filters `flow_mode` after parsing;
- computes `accuracy = correct_count / answered_count` when answered count is greater than 0;
- orders by `started_at DESC, id DESC`;
- returns `pageOf(items, filter.Page, filter.PageSize)`.

- [ ] **Step 2: Implement `GetSessionResults`**

Use `GetSession(ctx, scope, id)` to enforce tenant and user isolation. For each session question:
- load latest answer by `user_id + session_question_id`;
- load `UserQuestionState` with `getState`;
- return `PracticeSessionResultQuestion` with `answer`、`correct_answer`、`is_correct`、`analysis`、`state`.

Aggregate `answered_count`、`correct_count`、`wrong_count`、`accuracy` into the returned `Session`.

- [ ] **Step 3: Implement `ListCandidatesByQuestionIDs`**

Query active questions by current tenant and requested IDs:
- `questions.tenant_id = scope.TenantID`
- `questions.status = 'active'`
- `questions.deleted_at IS NULL`
- `questions.current_version_id IS NOT NULL`
- join `question_versions` on current version
- left join `question_bank_questions` to obtain a representative `bank_id`
- exclude mastered when `excludeMastered=true`

The result should preserve the input `question_ids` order when `practice_mode=sequential` later uses it.

- [ ] **Step 4: Implement `ListStateDetails`**

Enhance `ListStates` by joining:
- `questions` for `question_type`
- `question_versions` for `content_json`

Filter by:
- `wrong`: `practice_wrong_count > 0`
- `mastered`: `is_mastered = 1`
- `confused`: `is_confused = 1`
- `bank_id`: exists in `question_bank_questions`

Return `PageResult[UserQuestionStateDetail]`.

- [ ] **Step 5: Add helpers**

Add helpers:
- `scanSessionListItem`
- `latestAnswer`
- `scanStateDetail`
- `scanCandidates`

Refactor `ListCandidates` to use `scanCandidates` so candidate JSON parsing stays in one place.

- [ ] **Step 6: Run backend tests**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./internal/modules/practice
```

Expected: PASS.

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./...
```

Expected: PASS.

## Task 4: SDK

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`

- [ ] **Step 1: Add SDK failing test**

Add one test that calls:
- `listPracticeSessions({ status: "finished", flow_mode: "fixed_count" })`
- `getPracticeSessionResults(501)`
- `createPracticeSessionFromQuestions({ question_ids: [1001, 1002], practice_mode: "random", flow_mode: "fixed_count", question_count: 10, exclude_mastered: false })`

Assert URLs:
- `/practice/sessions?status=finished&flow_mode=fixed_count`
- `/practice/sessions/501/results`
- `/practice/sessions/from-questions`

Assert `from-questions` body exactly matches the object passed in.

- [ ] **Step 2: Add SDK types**

Add:
- `PracticeSessionListQuery`
- `PracticeSessionListItem`
- `PracticeSessionResults`
- `PracticeSessionResultQuestion`
- `PracticeSessionFromQuestionsInput`

Extend `UserQuestionState` with optional:
- `question_type?: string`
- `content?: QuestionContentInput | Record<string, unknown>`

- [ ] **Step 3: Add SDK methods**

Extend `ApiClient` and `createApiClient`:

```ts
listPracticeSessions(query?: PracticeSessionListQuery): Promise<PageResult<PracticeSessionListItem>>;
getPracticeSessionResults(id: number): Promise<PracticeSessionResults>;
createPracticeSessionFromQuestions(body: PracticeSessionFromQuestionsInput): Promise<PracticeSessionDetail>;
```

Implementation paths:

```ts
buildPath("/practice/sessions", query)
`/practice/sessions/${id}/results`
"/practice/sessions/from-questions"
```

- [ ] **Step 4: Run SDK test**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: PASS.

## Task 5: 学生端复习页面

**Files:**
- Create: `apps/user-web/src/practice-review-pages.tsx`
- Create: `apps/user-web/src/practice-review-pages.test.tsx`
- Modify: `apps/user-web/src/practice-panel.tsx`
- Modify: `apps/user-web/src/practice-panel.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`
- Modify: `internal/modules/rbac/menu.go`
- Modify: `internal/modules/rbac/menu_service_test.go`

- [ ] **Step 1: Add frontend tests**

Create tests for:
- result page renders summary and buttons `查看本次明细`、`进入错题本`、`继续练习`;
- history page renders `会话 #501` and clicking `查看详情` navigates to `/app/practice/history/501`;
- state list page renders a question stem and clicking `继续练习` calls `createPracticeSessionFromQuestions` with current `question_ids`.

- [ ] **Step 2: Create review components**

Create `PracticeReviewApi` with:

```ts
listPracticeSessions(query?: PracticeSessionListQuery): Promise<PageResult<PracticeSessionListItem>>;
getPracticeSessionResults(id: number): Promise<PracticeSessionResults>;
createPracticeSessionFromQuestions(body: PracticeSessionFromQuestionsInput): Promise<PracticeSessionDetail>;
listUserQuestionStates(query?: UserQuestionStateListQuery): Promise<PageResult<UserQuestionState>>;
```

Export:
- `PracticeResultPage`
- `PracticeHistoryPage`
- `PracticeSessionDetailPage`
- `PracticeStateListPage`

Keep pages minimal and accessible:
- each page has an `h2`;
- empty lists render clear Chinese empty state;
- state list `继续练习` uses current loaded `question_id` list and default count 10.

- [ ] **Step 3: Notify finish from practice panel**

Add optional prop:

```ts
onFinished?: (summary: PracticeSessionSummary) => void;
```

After `finishPracticeSession`, call:

```ts
onFinished?.(summary);
```

- [ ] **Step 4: Wire pages in user app**

Update `UserApp`:
- `practiceApi` type becomes `PracticePanelApi & PracticeReviewApi`;
- add nav buttons for `练题记录`、`错题本`、`熟题本`、`疑惑题`;
- render:
  - `/app/practice/results/{id}` -> `PracticeResultPage`
  - `/app/practice/history` -> `PracticeHistoryPage`
  - `/app/practice/history/{id}` -> `PracticeSessionDetailPage`
  - `/app/practice/wrong` -> `PracticeStateListPage stateType="wrong"`
  - `/app/practice/mastered` -> `PracticeStateListPage stateType="mastered"`
  - `/app/practice/confused` -> `PracticeStateListPage stateType="confused"`

- [ ] **Step 5: Update RBAC menus**

Add user menu entries:

```go
{ID: 23, Name: "练题记录", Path: "/app/practice/history", RequiredPermissions: []string{"practice:use"}},
{ID: 24, Name: "错题本", Path: "/app/practice/wrong", RequiredPermissions: []string{"practice:use"}},
{ID: 25, Name: "熟题本", Path: "/app/practice/mastered", RequiredPermissions: []string{"practice:use"}},
{ID: 26, Name: "疑惑题", Path: "/app/practice/confused", RequiredPermissions: []string{"practice:use"}},
```

Add tests asserting these menu names exist.

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
pnpm test
```

Expected: PASS.

## Task 6: OpenAPI and documentation

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Create: `docs/docs/24_stage2d_implementation_status.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update OpenAPI paths**

Add:
- `GET /practice/sessions`
- `GET /practice/sessions/{id}/results`
- `POST /practice/sessions/from-questions`

Enhance `GET /user-question-states` item schema with `question_type` and `content`.

- [ ] **Step 2: Update OpenAPI schemas**

Add schemas:
- `PracticeSessionListItem`
- `PracticeSessionResultQuestion`
- `PracticeSessionResults`
- `PracticeSessionFromQuestionsInput`
- response wrappers for session page and results
- request body for from-questions

- [ ] **Step 3: Update API design markdown**

Append stage 2D entries in `docs/docs/openapi_design_v1.md`:
- 练题记录列表
- 练题会话结果详情
- 从题目列表继续练
- 用户题目状态列表增强字段

- [ ] **Step 4: Create stage status doc**

Create `docs/docs/24_stage2d_implementation_status.md` with:
- completed backend APIs;
- completed SDK methods;
- completed student pages;
- business rules;
- current limitations;
- verification commands;
- next stage recommendation.

- [ ] **Step 5: Update docs README**

Add `docs/24_stage2d_implementation_status.md` to:
- AI reading order after stage 2C;
- directory description list.

- [ ] **Step 6: Parse OpenAPI**

Run a temporary Go YAML parse from `D:\workspace\temp` and delete temporary source/exe afterwards.

Expected output:

```text
openapi_parse_ok
```

## Task 7: Full verification and commit

**Files:**
- All changed files

- [ ] **Step 1: Full verification**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./...
```

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all PASS.

- [ ] **Step 2: Hygiene checks**

Run an abnormal citation marker and known sensitive initial password scan without writing the sensitive value into repository files.

Then run:

```powershell
git diff --check
```

Expected:
- abnormal marker and sensitive value scan has no matches;
- `git diff --check` has no output and exit code 0.

Run UTF-8/BOM/mixed line ending check for:
- `apps`
- `cmd`
- `docs`
- `internal`
- `packages`
- `database`

Expected:

```text
bom=0 invalid=0 mixed=0
```

- [ ] **Step 3: Stage and commit**

Run:

```powershell
git add cmd internal apps packages docs
git diff --cached --check
git commit -m "新增：完成阶段2d复习闭环"
```

Expected: commit succeeds and `git status --short` is clean.
