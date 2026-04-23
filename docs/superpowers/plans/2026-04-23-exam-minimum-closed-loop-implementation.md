# 考试主链路最小闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有题库、练题、认证与老师侧学习分析基础上，新增用户端老师创建发布考试、学生参加考试、自动保存、自动判分与结果查看的最小正式闭环。

**Architecture:** 后端新增 `internal/modules/exam`，沿用 `practice` 与 `analytics` 的 `model/service/repository/handler` 结构，直接复用已有考试 DDL 表。前端只扩展 `apps/user-web`，以最小页面闭环支持老师考试列表/创建与学生考试列表/详情/作答/结果；SDK 继续以 `packages/api-sdk` 为唯一契约入口，文档以 `docs/api/openapi.yaml` 和 `docs/docs/openapi_design_v1.md` 为正式基线。

**Tech Stack:** Go, Gin, MySQL 8, React, TypeScript, Vite, Vitest, Testing Library, pnpm.

---

## File Structure

### 后端新增或修改

- Create: `internal/modules/exam/model.go`
- Create: `internal/modules/exam/service.go`
- Create: `internal/modules/exam/mysql_repository.go`
- Create: `internal/modules/exam/handler.go`
- Create: `internal/modules/exam/handler_test.go`
- Create: `internal/modules/exam/mysql_repository_test.go`
- Modify: `cmd/server/main.go`
- Modify: `internal/bootstrap/http.go`
- Modify: `internal/modules/rbac/*`（菜单种子或菜单过滤接线，按现有实现风格）
- Modify: `internal/modules/practice/*`（仅在需要复用用户题目状态更新逻辑时做最小抽取）

### 前端与 SDK 新增或修改

- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`
- Create: `apps/user-web/src/exam-list-page.tsx`
- Create: `apps/user-web/src/exam-list-page.test.tsx`
- Create: `apps/user-web/src/teacher-exam-editor-page.tsx`
- Create: `apps/user-web/src/teacher-exam-editor-page.test.tsx`
- Create: `apps/user-web/src/exam-detail-page.tsx`
- Create: `apps/user-web/src/exam-detail-page.test.tsx`
- Create: `apps/user-web/src/exam-attempt-page.tsx`
- Create: `apps/user-web/src/exam-attempt-page.test.tsx`
- Create: `apps/user-web/src/exam-result-page.tsx`
- Create: `apps/user-web/src/exam-result-page.test.tsx`

### 文档新增或修改

- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Create: `docs/docs/27_stage3a_exam_implementation_status.md`
- Modify: `docs/README.md`

## Delivery Order

- [ ] 1. 后端考试模块红测与基础模型
- [ ] 2. 老师侧考试列表/创建/详情/更新
- [ ] 3. 发布固定试卷考试
- [ ] 4. 发布随机组卷考试与缺口校验
- [ ] 5. 学生开始考试、查看 attempt、自动保存答案
- [ ] 6. 手动交卷、超时自动交卷、结果查询、错题沉淀
- [ ] 7. SDK 契约补齐
- [ ] 8. 用户端老师考试页
- [ ] 9. 用户端学生考试列表、详情、作答、结果页
- [ ] 10. OpenAPI、状态文档与完整验证

## Task 1: 后端考试模块红测与基础模型

**Files:**
- Create: `internal/modules/exam/model.go`
- Create: `internal/modules/exam/service.go`
- Create: `internal/modules/exam/handler.go`
- Create: `internal/modules/exam/handler_test.go`
- Create: `internal/modules/exam/mysql_repository.go`
- Create: `internal/modules/exam/mysql_repository_test.go`

- [ ] **Step 1: 写考试模块最小红测**

```go
func TestHandler_ListExamsRequiresAuth(t *testing.T) {
	router := gin.New()
	handler := NewHandler(NewService(memoryRepository{}), func(*gin.Context) (Scope, bool) {
		return Scope{}, false
	})
	handler.RegisterRoutes(router.Group("/api/v1"))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/exams", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/modules/exam`

Expected: FAIL，提示模块或类型尚不存在。

- [ ] **Step 3: 写最小模型与路由骨架**

```go
type Scope struct {
	TenantID     int64
	UserID       int64
	UserType     string
	Permissions  []string
}

type Handler struct {
	service   *Service
	authorize func(*gin.Context) (Scope, bool)
}

func (handler *Handler) RegisterRoutes(router gin.IRouter) {
	router.GET("/exams", handler.listExams)
}
```

- [ ] **Step 4: 运行测试确认转绿**

Run: `go test ./internal/modules/exam`

Expected: PASS，至少通过认证红测。

- [ ] **Step 5: 提交**

```bash
git add internal/modules/exam
git commit -m "新增：建立考试模块基础骨架"
```

## Task 2: 老师侧考试列表/创建/详情/更新

**Files:**
- Modify: `internal/modules/exam/model.go`
- Modify: `internal/modules/exam/service.go`
- Modify: `internal/modules/exam/mysql_repository.go`
- Modify: `internal/modules/exam/handler.go`
- Modify: `internal/modules/exam/handler_test.go`
- Modify: `internal/modules/exam/mysql_repository_test.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: 写老师考试 CRUD 红测**

```go
func TestHandler_CreateExamSuccess(t *testing.T) {
	body := `{
	  "name":"七年级数学周测1",
	  "exam_mode":"fixed",
	  "start_time":"2026-04-24T09:00:00+08:00",
	  "end_time":"2026-04-24T10:00:00+08:00",
	  "duration_minutes":60,
	  "targets":[{"target_type":"class","target_id":301}],
	  "fixed_questions":[{"question_id":1001,"question_version_id":3001,"display_order":1,"score":2}]
	}`
	// 断言 200、exam_mode=fixed、status=draft。
}
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `go test ./internal/modules/exam -run "CreateExam|GetExam|UpdateExam|ListExams"`

Expected: FAIL，提示 handler/service/repository 未实现。

- [ ] **Step 3: 实现最小 CRUD**

```go
type Exam struct {
	ID               int64        `json:"id"`
	Name             string       `json:"name"`
	ExamMode         string       `json:"exam_mode"`
	Status           string       `json:"status"`
	StartTime        time.Time    `json:"start_time"`
	EndTime          time.Time    `json:"end_time"`
	DurationMinutes  int          `json:"duration_minutes"`
	Targets          []ExamTarget `json:"targets"`
}

func (service *Service) CreateExam(ctx context.Context, scope Scope, cmd CreateExamCommand) (Exam, error) {
	if !containsPermission(scope.Permissions, "exam:publish") {
		return Exam{}, ErrForbidden
	}
	return service.repo.CreateExam(ctx, cmd)
}
```

- [ ] **Step 4: 注册到服务启动入口**

```go
examHandler := exam.NewHandler(exam.NewService(examRepo), authz)
examHandler.RegisterRoutes(apiGroup)
```

- [ ] **Step 5: 跑后端定向测试**

Run: `go test ./internal/modules/exam -run "CreateExam|GetExam|UpdateExam|ListExams"`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add internal/modules/exam cmd/server/main.go internal/bootstrap/http.go
git commit -m "新增：补齐考试草稿定义接口"
```

## Task 3: 发布固定试卷考试

**Files:**
- Modify: `internal/modules/exam/service.go`
- Modify: `internal/modules/exam/mysql_repository.go`
- Modify: `internal/modules/exam/handler.go`
- Modify: `internal/modules/exam/handler_test.go`
- Modify: `internal/modules/exam/mysql_repository_test.go`

- [ ] **Step 1: 写固定试卷发布红测**

```go
func TestService_PublishFixedExamCreatesPaperSnapshot(t *testing.T) {
	repo := &memoryRepository{examMode: "fixed"}
	service := NewService(repo)

	result, err := service.PublishExam(context.Background(), teacherScope(), 9001)
	if err != nil {
		t.Fatalf("publish failed: %v", err)
	}
	if result.PaperID == 0 {
		t.Fatalf("expected paper id")
	}
}
```

- [ ] **Step 2: 运行失败验证**

Run: `go test ./internal/modules/exam -run "PublishFixed"`

Expected: FAIL，提示 publish 逻辑缺失。

- [ ] **Step 3: 实现发布时固化试卷**

```go
func (service *Service) PublishExam(ctx context.Context, scope Scope, examID int64) (PublishExamResult, error) {
	exam, fixedQuestions, err := service.repo.GetExamForPublish(ctx, examID, scope.TenantID)
	if err != nil {
		return PublishExamResult{}, err
	}
	paperID, err := service.repo.CreateFixedPaper(ctx, exam, fixedQuestions)
	if err != nil {
		return PublishExamResult{}, err
	}
	return service.repo.MarkExamPublished(ctx, examID, paperID)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `go test ./internal/modules/exam -run "PublishFixed"`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/modules/exam
git commit -m "新增：支持固定试卷考试发布"
```

## Task 4: 发布随机组卷考试与缺口校验

**Files:**
- Modify: `internal/modules/exam/model.go`
- Modify: `internal/modules/exam/service.go`
- Modify: `internal/modules/exam/mysql_repository.go`
- Modify: `internal/modules/exam/handler_test.go`
- Modify: `internal/modules/exam/mysql_repository_test.go`

- [ ] **Step 1: 写随机组卷缺口红测**

```go
func TestService_PublishRandomExamReturnsGapWhenPoolInsufficient(t *testing.T) {
	repo := &memoryRepository{
		examMode: "random_assembly",
		rulePools: []RulePoolStat{{QuestionType: "single_choice", Required: 10, Available: 6}},
	}
	_, err := NewService(repo).PublishExam(context.Background(), teacherScope(), 9002)
	if !errors.Is(err, ErrQuestionPoolInsufficient) {
		t.Fatalf("expected ErrQuestionPoolInsufficient, got %v", err)
	}
}
```

- [ ] **Step 2: 运行失败验证**

Run: `go test ./internal/modules/exam -run "PublishRandom|QuestionPoolInsufficient"`

Expected: FAIL。

- [ ] **Step 3: 实现规则统计与抽题**

```go
type RulePoolStat struct {
	QuestionType string
	Required     int
	Available    int
}

func (service *Service) buildRandomPaper(ctx context.Context, exam Exam, rules []ExamPaperRule) ([]ExamPaperQuestion, error) {
	stats, err := service.repo.StatRulePools(ctx, exam.TenantID, rules)
	if err != nil {
		return nil, err
	}
	for _, stat := range stats {
		if stat.Available < stat.Required {
			return nil, ErrQuestionPoolInsufficient
		}
	}
	return service.repo.DrawPaperQuestions(ctx, exam.TenantID, rules)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `go test ./internal/modules/exam -run "PublishRandom|QuestionPoolInsufficient"`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/modules/exam
git commit -m "新增：支持随机组卷发布与缺口校验"
```

## Task 5: 学生开始考试、查看 attempt、自动保存答案

**Files:**
- Modify: `internal/modules/exam/model.go`
- Modify: `internal/modules/exam/service.go`
- Modify: `internal/modules/exam/mysql_repository.go`
- Modify: `internal/modules/exam/handler.go`
- Modify: `internal/modules/exam/handler_test.go`
- Modify: `internal/modules/exam/mysql_repository_test.go`

- [ ] **Step 1: 写开始考试与自动保存红测**

```go
func TestService_StartExamReturnsExistingInProgressAttempt(t *testing.T) {
	repo := &memoryRepository{existingAttempt: &ExamAttempt{ID: 8001, Status: "in_progress"}}
	attempt, err := NewService(repo).StartExam(context.Background(), studentScope(), 9001)
	if err != nil {
		t.Fatalf("start failed: %v", err)
	}
	if attempt.ID != 8001 {
		t.Fatalf("expected existing attempt")
	}
}

func TestService_SaveAttemptAnswerIsIdempotent(t *testing.T) {
	// 重复保存同一 display_order，断言仍只保留一条 answer。
}
```

- [ ] **Step 2: 运行失败验证**

Run: `go test ./internal/modules/exam -run "StartExam|SaveAttemptAnswer"`

Expected: FAIL。

- [ ] **Step 3: 实现开始考试与保存答案**

```go
func (service *Service) StartExam(ctx context.Context, scope Scope, examID int64) (ExamAttemptDetail, error) {
	if existing, ok, err := service.repo.GetUserActiveAttempt(ctx, scope.TenantID, examID, scope.UserID); err != nil {
		return ExamAttemptDetail{}, err
	} else if ok {
		return existing, nil
	}
	return service.repo.CreateAttempt(ctx, scope.TenantID, examID, scope.UserID)
}

func (service *Service) SaveAttemptAnswer(ctx context.Context, scope Scope, attemptID int64, cmd SaveAttemptAnswerCommand) (ExamAttemptAnswer, error) {
	return service.repo.UpsertAttemptAnswer(ctx, scope.TenantID, scope.UserID, attemptID, cmd)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `go test ./internal/modules/exam -run "StartExam|SaveAttemptAnswer"`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/modules/exam
git commit -m "新增：支持开始考试与自动保存答案"
```

## Task 6: 手动交卷、超时自动交卷、结果查询、错题沉淀

**Files:**
- Modify: `internal/modules/exam/service.go`
- Modify: `internal/modules/exam/mysql_repository.go`
- Modify: `internal/modules/exam/handler_test.go`
- Modify: `internal/modules/exam/mysql_repository_test.go`
- Modify: `internal/modules/practice/model.go`（仅当需要抽取共享状态更新结构）

- [ ] **Step 1: 写交卷与结果红测**

```go
func TestService_SubmitAttemptUpdatesExamWrongCountWithoutMastered(t *testing.T) {
	repo := &memoryRepository{
		answers: []ExamAttemptAnswer{{DisplayOrder: 1, IsCorrect: false}},
	}
	result, err := NewService(repo).SubmitAttempt(context.Background(), studentScope(), 8001)
	if err != nil {
		t.Fatalf("submit failed: %v", err)
	}
	if result.ObjectiveScore != 0 {
		t.Fatalf("expected zero score")
	}
	if repo.updatedState.IsMastered {
		t.Fatalf("exam should not mark mastered")
	}
}
```

- [ ] **Step 2: 运行失败验证**

Run: `go test ./internal/modules/exam -run "SubmitAttempt|GetAttemptResult"`

Expected: FAIL。

- [ ] **Step 3: 实现判分、超时提交和错题沉淀**

```go
func (service *Service) SubmitAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	attempt, answers, err := service.repo.LoadAttemptForSubmit(ctx, scope.TenantID, scope.UserID, attemptID)
	if err != nil {
		return ExamAttemptResult{}, err
	}
	result := scoreObjectiveAnswers(answers)
	status := "submitted"
	if attempt.IsExpired(time.Now()) {
		status = "timeout_submitted"
	}
	if err := service.repo.FinalizeAttempt(ctx, attemptID, status, result); err != nil {
		return ExamAttemptResult{}, err
	}
	if err := service.repo.UpdateExamWrongCounts(ctx, attempt.UserID, answers); err != nil {
		return ExamAttemptResult{}, err
	}
	return service.repo.GetAttemptResult(ctx, scope.TenantID, scope.UserID, attemptID)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `go test ./internal/modules/exam -run "SubmitAttempt|GetAttemptResult"`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/modules/exam internal/modules/practice/model.go
git commit -m "新增：支持考试交卷判分与结果查询"
```

## Task 7: SDK 契约补齐

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`

- [ ] **Step 1: 写 SDK 红测**

```ts
it("creates exam and submits attempt answer", async () => {
  const client = createApiClient({ baseUrl: "http://example.test", fetch: fetchMock as FetchLike });
  await client.createExam({ name: "周测", exam_mode: "fixed", targets: [], fixed_questions: [] });
  await client.saveExamAttemptAnswer(8001, { display_order: 1, answer: { selected_keys: ["A"] } });
  expect(fetchMock).toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行失败验证**

Run: `pnpm test -- packages/api-sdk/src/client.test.ts`

Expected: FAIL，提示方法未定义。

- [ ] **Step 3: 实现 SDK 类型与方法**

```ts
export interface CreateExamInput { /* ... */ }
export interface ExamAttemptAnswerInput { display_order: number; answer: Record<string, unknown>; }

createExam(body: CreateExamInput): Promise<ExamDetail>;
publishExam(id: number): Promise<ExamPublishResult>;
startExamAttempt(id: number): Promise<ExamAttemptDetail>;
saveExamAttemptAnswer(id: number, body: ExamAttemptAnswerInput): Promise<ExamAttemptAnswer>;
submitExamAttempt(id: number): Promise<ExamAttemptResult>;
getExamAttemptResult(id: number): Promise<ExamAttemptResult>;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- packages/api-sdk/src/client.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts
git commit -m "新增：补齐考试 SDK 契约"
```

## Task 8: 用户端老师考试页

**Files:**
- Create: `apps/user-web/src/exam-list-page.tsx`
- Create: `apps/user-web/src/exam-list-page.test.tsx`
- Create: `apps/user-web/src/teacher-exam-editor-page.tsx`
- Create: `apps/user-web/src/teacher-exam-editor-page.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: 写老师页红测**

```tsx
it("allows teacher to create fixed exam draft", async () => {
  render(<TeacherExamEditorPage api={api} />);
  fireEvent.change(screen.getByLabelText("考试名称"), { target: { value: "七年级周测" } });
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(api.createExam).toHaveBeenCalled());
});
```

- [ ] **Step 2: 运行失败验证**

Run: `pnpm test -- apps/user-web/src/teacher-exam-editor-page.test.tsx apps/user-web/src/app.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现老师考试列表与编辑页**

```tsx
export function TeacherExamEditorPage({ api, examId, onNavigate }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"fixed" | "random_assembly">("fixed");
  const [message, setMessage] = useState("");

  async function handleSaveDraft() {
    const saved = examId
      ? await api.updateExam(examId, buildExamPayload(name, mode))
      : await api.createExam(buildExamPayload(name, mode));
    setMessage(`草稿已保存：${saved.name}`);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- apps/user-web/src/teacher-exam-editor-page.test.tsx apps/user-web/src/exam-list-page.test.tsx apps/user-web/src/app.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/user-web/src/exam-list-page* apps/user-web/src/teacher-exam-editor-page* apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：接入老师考试列表与创建页"
```

## Task 9: 用户端学生考试列表、详情、作答、结果页

**Files:**
- Create: `apps/user-web/src/exam-detail-page.tsx`
- Create: `apps/user-web/src/exam-detail-page.test.tsx`
- Create: `apps/user-web/src/exam-attempt-page.tsx`
- Create: `apps/user-web/src/exam-attempt-page.test.tsx`
- Create: `apps/user-web/src/exam-result-page.tsx`
- Create: `apps/user-web/src/exam-result-page.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: 写学生考试流程红测**

```tsx
it("starts exam, auto saves answer, and shows result", async () => {
  render(<ExamAttemptPage api={api} attemptId={8001} />);
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByRole("button", { name: "保存答案" }));
  await waitFor(() => expect(api.saveExamAttemptAnswer).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "交卷" }));
  await waitFor(() => expect(api.submitExamAttempt).toHaveBeenCalled());
});
```

- [ ] **Step 2: 运行失败验证**

Run: `pnpm test -- apps/user-web/src/exam-detail-page.test.tsx apps/user-web/src/exam-attempt-page.test.tsx apps/user-web/src/exam-result-page.test.tsx apps/user-web/src/app.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现学生考试详情、作答与结果页**

```tsx
export function ExamAttemptPage({ api, attemptId, onNavigate }: Props) {
  const [detail, setDetail] = useState<ExamAttemptDetail | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  async function handleSaveAnswer(displayOrder: number, selectedKeys: string[]) {
    await api.saveExamAttemptAnswer(attemptId, { display_order: displayOrder, answer: { selected_keys: selectedKeys } });
    setSaveMessage("答案已保存");
  }

  async function handleSubmit() {
    const result = await api.submitExamAttempt(attemptId);
    onNavigate(`/app/exam-result/${result.attempt_id}`);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- apps/user-web/src/exam-detail-page.test.tsx apps/user-web/src/exam-attempt-page.test.tsx apps/user-web/src/exam-result-page.test.tsx apps/user-web/src/app.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/user-web/src/exam-detail-page* apps/user-web/src/exam-attempt-page* apps/user-web/src/exam-result-page* apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：接入学生考试详情作答与结果页"
```

## Task 10: OpenAPI、状态文档与完整验证

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Create: `docs/docs/27_stage3a_exam_implementation_status.md`
- Modify: `docs/README.md`

- [ ] **Step 1: 先写契约与状态文档红测清单**

```text
核对接口：
- GET /api/v1/exams
- POST /api/v1/exams
- GET /api/v1/exams/{id}
- PUT /api/v1/exams/{id}
- POST /api/v1/exams/{id}/publish
- POST /api/v1/exams/{id}/attempts
- GET /api/v1/exam-attempts/{id}
- POST /api/v1/exam-attempts/{id}/answers
- POST /api/v1/exam-attempts/{id}/submit
- GET /api/v1/exam-attempts/{id}/result
```

- [ ] **Step 2: 同步文档**

```yaml
/exams:
  get:
    summary: 考试列表
  post:
    summary: 创建考试
/exam-attempts/{id}/submit:
  post:
    summary: 交卷
```

- [ ] **Step 3: 运行完整验证**

Run:

```powershell
go test ./internal/modules/exam
go test ./...
pnpm test
pnpm typecheck
pnpm build
go run -work D:\workspace\temp\openapi_parse_exam.go
git diff --check
```

Expected:
- 所有测试通过
- `openapi_parse_ok`
- `git diff --check` 无输出

- [ ] **Step 4: 提交**

```bash
git add docs/api/openapi.yaml docs/docs/openapi_design_v1.md docs/docs/27_stage3a_exam_implementation_status.md docs/README.md
git commit -m "文档：同步考试主链路实施状态"
```

## Spec Coverage Self-Review

- [x] 老师用户端创建、编辑、发布考试：Task 2、Task 3、Task 4、Task 8
- [x] 固定试卷与随机组卷：Task 3、Task 4
- [x] 发布对象支持班级、课程、指定学生：Task 2、Task 4、Task 8
- [x] 学生开始考试、自动保存、手动交卷、超时自动交卷：Task 5、Task 6、Task 9
- [x] 客观题自动判分与结果查询：Task 6、Task 9
- [x] 考试错题沉淀且不生成熟题：Task 6
- [x] SDK、OpenAPI、状态文档同步：Task 7、Task 10

## Placeholder Scan Self-Review

- [x] 计划中未保留 `TODO / TBD / 稍后补 / 适当处理` 类占位描述
- [x] 每个任务都给出了目标文件、测试示例、命令与提交建议
- [x] 命名在 `exam / exam-attempt / publish / submit / result` 口径上保持一致

## Exit Criteria

- [ ] 老师可在用户端创建并发布固定试卷与随机组卷考试
- [ ] 发布对象支持班级、课程、指定学生
- [ ] 学生只能看到命中自己的考试
- [ ] 自动保存幂等，超时自动交卷有效
- [ ] 客观题自动判分准确
- [ ] 考试错题沉淀有效且不生成熟题
- [ ] 所有新增接口已在 OpenAPI、SDK、前端路由与测试中收口
