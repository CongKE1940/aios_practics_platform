# 阶段 2C 练题核心链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成定量练习、连续刷题、即时判题、错题/熟题/疑惑题状态、SDK 与用户端最小练题页。

**Architecture:** 后端新增 `internal/modules/practice`，以服务层统一处理抽题、会话、判题和用户题目状态，仓库接口隔离内存测试与 MySQL。前端在 API SDK 中补齐练题方法，用户端新增 `/app/practice` 的最小练题体验。

**Tech Stack:** Go 1.x、Gin、MySQL、React、TypeScript、Vitest、Testing Library、OpenAPI YAML。

---

## File Structure

- Create: `internal/modules/practice/model.go`，定义会话、会话题目、答题请求、判题响应、用户题目状态、分页、错误和仓库接口。
- Create: `internal/modules/practice/service.go`，实现定量练习、连续刷题、抽题、判题、标熟、标疑惑和状态列表。
- Create: `internal/modules/practice/handler.go`，实现练题 API 与 `practice:use` 鉴权。
- Create: `internal/modules/practice/mysql_repository.go`，落库 `practice_sessions`、`practice_session_questions`、`practice_answers`、`user_question_states`。
- Create: `internal/modules/practice/handler_test.go`，覆盖定量练习、连续刷题、判题、状态、权限和租户隔离。
- Modify: `cmd/server/main.go`，注册 practice 模块。
- Modify: `internal/modules/rbac/menu.go` and `internal/modules/rbac/menu_service_test.go`，用户端菜单新增练题中心。
- Modify: `packages/api-sdk/src/client.ts` and `packages/api-sdk/src/client.test.ts`，补齐练题类型和方法。
- Create: `apps/user-web/src/practice-panel.tsx` and `apps/user-web/src/practice-panel.test.tsx`，新增用户端练题页。
- Modify: `apps/user-web/src/app.tsx` and `apps/user-web/src/app.test.tsx`，挂载最小练题入口。
- Modify: `docs/api/openapi.yaml` and `docs/docs/openapi_design_v1.md`，正式化练题接口。
- Create: `docs/docs/23_stage2c_implementation_status.md`，记录阶段 2C 状态。
- Modify: `docs/README.md`，加入阶段 2C 状态入口。

## Task 1: 后端练题红测

**Files:**
- Create: `internal/modules/practice/handler_test.go`

- [ ] **Step 1: Write failing handler tests**

Tests must create a Gin router with fake token parser and memory repository. Cover:
- `POST /api/v1/practice/sessions` fixed count defaults to 10 and creates session questions.
- fixed count accepts custom `question_count`.
- continuous session returns first question and `next-question` returns a different question before round rollover.
- `POST /answer` judges single choice and updates wrong/correct state.
- `mark-mastered` and `mark-confused` set and unset flags.
- missing `practice:use` returns 403.
- tenant/user mismatch returns 404.

- [ ] **Step 2: Run backend module test and verify red**

Run: `go test -work ./internal/modules/practice`

Expected: FAIL because `internal/modules/practice` production code does not exist.

## Task 2: 后端练题实现

**Files:**
- Create: `internal/modules/practice/model.go`
- Create: `internal/modules/practice/service.go`
- Create: `internal/modules/practice/handler.go`
- Create: `internal/modules/practice/mysql_repository.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Implement model and contracts**

Define constants:
- practice mode: `random`, `sequential`
- source mode: `single_bank`, `multi_bank`
- flow mode: `fixed_count`, `continuous`
- status: `active`, `finished`
- state filters: `wrong`, `mastered`, `confused`
- errors: invalid input, not found, no candidates

- [ ] **Step 2: Implement service**

Implement:
- default fixed count = 10
- candidate selection by bank ids
- sequential ordering keeps repository order
- random ordering uses `random_seed` when provided
- continuous creates one first question and `next-question` adds more
- continuous rolls over to a new round after current round candidates are exhausted
- answer judging supports `by_option_key` and `boolean`
- answer submission writes practice answer and updates state
- mark mastered/confused upserts state and writes log
- finish session marks session finished

- [ ] **Step 3: Implement handler**

Register:
```text
POST /practice/sessions
GET /practice/sessions/:id
POST /practice/sessions/:id/next-question
POST /practice/sessions/:id/answer
POST /practice/sessions/:id/finish
POST /practice/questions/:id/mark-mastered
POST /practice/questions/:id/mark-confused
GET /user-question-states
```

All routes require `practice:use`.

- [ ] **Step 4: Implement MySQL repository**

Read active questions from `question_banks`, `question_bank_questions`, `questions`, `question_versions`; persist sessions/questions/answers/states/logs with tenant and user guards.

- [ ] **Step 5: Run backend tests**

Run:
```powershell
go test -work ./internal/modules/practice
go test -work ./...
```

Expected: PASS.

## Task 3: SDK 与用户端练题页

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Create: `apps/user-web/src/practice-panel.tsx`
- Create: `apps/user-web/src/practice-panel.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`
- Modify: `internal/modules/rbac/menu.go`
- Modify: `internal/modules/rbac/menu_service_test.go`

- [ ] **Step 1: Write frontend and SDK red tests**

Cover SDK request paths and user page flows for fixed-count answer submission and continuous next question.

- [ ] **Step 2: Implement SDK methods**

Add methods:
```ts
createPracticeSession(body)
getPracticeSession(id)
nextPracticeQuestion(id)
submitPracticeAnswer(id, body)
finishPracticeSession(id)
markPracticeQuestionMastered(id, body)
markPracticeQuestionConfused(id, body)
listUserQuestionStates(query?)
```

- [ ] **Step 3: Implement user practice panel**

Build a minimal controlled form, question renderer for choice and true/false, submit result area, next question action, mastered/confused buttons, and finish action.

- [ ] **Step 4: Run frontend tests**

Run: `pnpm test`

Expected: PASS.

## Task 4: OpenAPI 与文档

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Create: `docs/docs/23_stage2c_implementation_status.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update OpenAPI**

Replace practice placeholder responses with concrete request bodies, schemas, and responses for sessions, next question, answer, finish, mark state, and user question states.

- [ ] **Step 2: Update docs**

Record delivered scope, limitations, verification commands, and next recommended stage.

- [ ] **Step 3: Parse OpenAPI**

Run temporary Go YAML parse with `github.com/goccy/go-yaml`, then delete the temp file.

Expected: parse succeeds.

## Task 5: Verification and commit

**Files:**
- All changed files

- [ ] **Step 1: Full verification**

Run:
```powershell
go test -work ./...
pnpm test
pnpm typecheck
pnpm build
```

- [ ] **Step 2: Hygiene checks**

Run checks for OpenAPI parse, abnormal citation markers, known sensitive secrets without storing them in repo files, UTF-8 BOM, and mixed line endings.

- [ ] **Step 3: Commit**

Run:
```powershell
git add cmd internal apps packages docs
git diff --cached --check
git commit -m "新增：完成阶段2c练题核心链路"
```

Expected: commit succeeds and worktree is clean.
