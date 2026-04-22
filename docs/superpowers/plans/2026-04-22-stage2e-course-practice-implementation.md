# 阶段 2E 课程维度练题入口与结果聚合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成课程维度练题入口、课程筛选的练题记录与题目状态列表，并把课程信息贯穿到练题结果和会话详情中。

**Architecture:** 继续扩展现有 `practice` 模块，不新增独立课程练题模块。后端在现有会话、候选题查询和状态列表查询上补 `course_id` 与 `source_mode=course` 支持；SDK 继续统一承接请求与类型；学生端在现有练题中心、练题记录、错题本、熟题本、疑惑题页面上增加最小课程入口与筛选控件。

**Tech Stack:** Go 1.26.x、Gin、MySQL、React、TypeScript、Vitest、Testing Library、OpenAPI YAML。

---

## File Structure

- Modify: `internal/modules/practice/model.go`，补课程维度字段、筛选参数和常量。
- Modify: `internal/modules/practice/service.go`，补课程来源会话创建、课程候选题选择与课程筛选逻辑。
- Modify: `internal/modules/practice/handler.go`，补课程参数读取与校验。
- Modify: `internal/modules/practice/mysql_repository.go`，补课程存在性检查、课程候选题查询、会话列表按课程过滤、状态列表按课程过滤。
- Modify: `internal/modules/practice/handler_test.go`，扩展内存仓库与课程维度后端行为测试。
- Modify: `packages/api-sdk/src/client.ts`，为练题与状态查询补 `course_id` 和 `source_mode=course` 支持。
- Modify: `packages/api-sdk/src/client.test.ts`，增加课程维度 SDK 路径与请求体验证。
- Modify: `apps/user-web/src/practice-panel.tsx`，为练题中心增加“题库 / 课程”来源切换与课程输入。
- Modify: `apps/user-web/src/practice-panel.test.tsx`，覆盖课程来源创建练题会话。
- Modify: `apps/user-web/src/practice-review-pages.tsx`，为结果页、记录页、会话详情和状态列表增加课程显示/筛选。
- Modify: `apps/user-web/src/practice-review-pages.test.tsx`，覆盖课程筛选与课程展示。
- Modify: `apps/user-web/src/app.tsx` and `apps/user-web/src/app.test.tsx`，确保课程来源会话能在现有页面流中工作。
- Modify: `docs/api/openapi.yaml` and `docs/docs/openapi_design_v1.md`，同步阶段 2E API 和字段。
- Create: `docs/docs/25_stage2e_implementation_status.md`，记录阶段 2E 实施状态。
- Modify: `docs/README.md`，加入阶段 2E 文档入口。

## Task 1: 后端课程维度红测

**Files:**
- Modify: `internal/modules/practice/handler_test.go`

- [ ] **Step 1: Add failing tests for course-source session creation**

在 `internal/modules/practice/handler_test.go` 中新增两个测试：

```go
func TestCreatePracticeSessionByCourse(t *testing.T) {
	router := setupPracticeRouter(t, practiceTestScope())
	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeRandom,
		"source_mode":      SourceModeCourse,
		"flow_mode":        FlowModeFixedCount,
		"course_id":        10,
		"exclude_mastered": true,
		"question_count":   2,
	}, "token")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}

	var body practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, rec, &body)
	if body.Data.SourceMode != SourceModeCourse {
		t.Fatalf("source_mode = %q", body.Data.SourceMode)
	}
	if body.Data.CourseID == nil || *body.Data.CourseID != 10 {
		t.Fatalf("course_id = %+v", body.Data.CourseID)
	}
	if len(body.Data.Questions) != 2 {
		t.Fatalf("questions = %d", len(body.Data.Questions))
	}
}

func TestCreatePracticeSessionByCourseNotFound(t *testing.T) {
	router := setupPracticeRouter(t, practiceTestScope())
	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode": PracticeModeRandom,
		"source_mode":   SourceModeCourse,
		"flow_mode":     FlowModeFixedCount,
		"course_id":     999,
	}, "token")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 2: Add failing tests for course filters**

在同一文件新增课程筛选测试：

```go
func TestListPracticeSessionsByCourse(t *testing.T) {
	router := setupPracticeRouter(t, practiceTestScope())
	performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      10,
		"question_count": 1,
	}, "token")
	performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      11,
		"question_count": 1,
	}, "token")

	rec := performPracticeRequest(router, http.MethodGet, "/api/v1/practice/sessions?course_id=10", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}

	var body practiceEnvelope[PageResult[PracticeSessionListItem]]
	decodePracticeBody(t, rec, &body)
	if len(body.Data.Items) != 1 {
		t.Fatalf("items = %d", len(body.Data.Items))
	}
	if body.Data.Items[0].CourseID == nil || *body.Data.Items[0].CourseID != 10 {
		t.Fatalf("course_id = %+v", body.Data.Items[0].CourseID)
	}
}

func TestListUserQuestionStatesByCourse(t *testing.T) {
	router := setupPracticeRouter(t, practiceTestScope())
	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      10,
		"question_count": 1,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)

	performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": created.Data.Questions[0].ID,
		"answer": map[string]any{"selected_keys": []string{"A"}},
	}, "token")

	rec := performPracticeRequest(router, http.MethodGet, "/api/v1/user-question-states?state_type=wrong&course_id=10", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}

	var body practiceEnvelope[PageResult[UserQuestionStateDetail]]
	decodePracticeBody(t, rec, &body)
	if len(body.Data.Items) != 1 {
		t.Fatalf("items = %d", len(body.Data.Items))
	}
}
```

- [ ] **Step 3: Extend memory repository and fixtures for course support**

让测试先能编译，补内存仓库需要的最小字段和帮助方法：

```go
type memoryRepository struct {
	courses           map[int64]courseRecord
	questionCourseIDs map[int64]int64
}

type courseRecord struct {
	ID       int64
	TenantID int64
	Status   string
}
```

并在 `newMemoryRepository()` 中预置：

```go
courses: map[int64]courseRecord{
	10: {ID: 10, TenantID: 1, Status: "active"},
	11: {ID: 11, TenantID: 1, Status: "active"},
},
```

- [ ] **Step 4: Run backend module test and verify red**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./internal/modules/practice
```

Expected: FAIL，因为生产代码尚未支持 `source_mode=course`、`course_id` 过滤和课程存在性校验。

## Task 2: 后端模型、服务和处理器

**Files:**
- Modify: `internal/modules/practice/model.go`
- Modify: `internal/modules/practice/service.go`
- Modify: `internal/modules/practice/handler.go`

- [ ] **Step 1: Add course constants and filter fields**

在 `model.go` 中新增课程来源常量和筛选字段：

```go
const (
	SourceModeCourse = "course"
)

type CandidateFilter struct {
	BankIDs         []int64
	CourseID        *int64
	ExcludeMastered bool
}

type UserQuestionStateFilter struct {
	StateType string
	BankID    *int64
	CourseID  *int64
	Page      int
	PageSize  int
}

type PracticeSessionListFilter struct {
	Status       string
	FlowMode     string
	PracticeMode string
	CourseID     *int64
	Page         int
	PageSize     int
}

type PracticeSessionListItem struct {
	ID            int64      `json:"id"`
	CourseID      *int64     `json:"course_id,omitempty"`
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
```

- [ ] **Step 2: Extend repository interface for course existence check**

在 `Repository` 接口中增加课程存在性检查：

```go
type Repository interface {
	ListCandidates(ctx context.Context, scope Scope, input CandidateFilter) ([]QuestionCandidate, error)
	ListSessions(ctx context.Context, scope Scope, filter PracticeSessionListFilter) (PageResult[PracticeSessionListItem], error)
	GetSession(ctx context.Context, scope Scope, id int64) (PracticeSessionDetail, error)
	GetSessionResults(ctx context.Context, scope Scope, id int64) (PracticeSessionResults, error)
	ListStateDetails(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionStateDetail], error)
	CourseExists(ctx context.Context, tenantID int64, courseID int64) (bool, error)
}
```

- [ ] **Step 3: Add course-aware service flow**

在 `service.go` 中扩展 `CreateSession` 和 `candidates`：

```go
func (service *Service) CreateSession(ctx context.Context, scope Scope, input PracticeSessionInput) (PracticeSessionDetail, error) {
	input = normalizeSessionInput(input)
	if input.SourceMode == SourceModeCourse {
		if input.CourseID == nil || *input.CourseID <= 0 {
			return PracticeSessionDetail{}, ErrInvalidInput
		}
		ok, err := service.repo.CourseExists(ctx, scope.TenantID, *input.CourseID)
		if err != nil {
			return PracticeSessionDetail{}, err
		}
		if !ok {
			return PracticeSessionDetail{}, ErrNotFound
		}
		input.BankIDs = nil
	} else if len(input.BankIDs) == 0 {
		return PracticeSessionDetail{}, ErrInvalidInput
	}

	candidates, err := service.candidates(ctx, scope, input)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	if len(candidates) == 0 {
		return PracticeSessionDetail{}, ErrNoCandidates
	}
	count := input.QuestionCount
	if input.FlowMode == FlowModeContinuous {
		count = 1
	}
	selected := limitCandidates(candidates, count)
	questions := buildSessionQuestions(selected, 1, 1)
	session := PracticeSession{
		TenantID:        scope.TenantID,
		UserID:          scope.UserID,
		PracticeMode:    input.PracticeMode,
		SourceMode:      input.SourceMode,
		FlowMode:        input.FlowMode,
		CourseID:        input.CourseID,
		BankIDs:         append([]int64{}, input.BankIDs...),
		ExcludeMastered: input.ExcludeMastered,
		QuestionCount:   input.QuestionCount,
		RandomSeed:      input.RandomSeed,
		RoundNo:         1,
		Status:          StatusActive,
		BankScope: map[string]any{
			"source_mode":      input.SourceMode,
			"flow_mode":        input.FlowMode,
			"course_id":        input.CourseID,
			"bank_ids":         input.BankIDs,
			"exclude_mastered": input.ExcludeMastered,
			"question_count":   input.QuestionCount,
			"random_seed":      input.RandomSeed,
			"round_no":         1,
		},
	}
	return service.repo.CreateSession(ctx, session, questions)
}

func (service *Service) candidates(ctx context.Context, scope Scope, input PracticeSessionInput) ([]QuestionCandidate, error) {
	candidates, err := service.repo.ListCandidates(ctx, scope, CandidateFilter{
		BankIDs:         input.BankIDs,
		CourseID:        input.CourseID,
		ExcludeMastered: input.ExcludeMastered,
	})
	if err != nil {
		return nil, err
	}
	if input.PracticeMode == PracticeModeRandom {
		seed := input.RandomSeed
		if seed == 0 {
			seed = time.Now().UnixNano()
		}
		rng := rand.New(rand.NewSource(seed))
		rng.Shuffle(len(candidates), func(i int, j int) {
			candidates[i], candidates[j] = candidates[j], candidates[i]
		})
	}
	return candidates, nil
}
```

并让 `sessionCandidates` 继续支持课程来源：

```go
return service.candidates(ctx, scope, PracticeSessionInput{
	PracticeMode:    detail.PracticeMode,
	SourceMode:      detail.SourceMode,
	FlowMode:        detail.FlowMode,
	CourseID:        detail.CourseID,
	BankIDs:         detail.BankIDs,
	ExcludeMastered: detail.ExcludeMastered,
	RandomSeed:      seed,
})
```

- [ ] **Step 4: Persist course fields into session bank scope**

保持 `course_id` 同时落到会话列和 `bank_scope_json`：

```go
session := PracticeSession{
	TenantID:        scope.TenantID,
	UserID:          scope.UserID,
	PracticeMode:    input.PracticeMode,
	SourceMode:      input.SourceMode,
	FlowMode:        input.FlowMode,
	CourseID:        input.CourseID,
	BankIDs:         append([]int64{}, input.BankIDs...),
	ExcludeMastered: input.ExcludeMastered,
	QuestionCount:   input.QuestionCount,
	RandomSeed:      input.RandomSeed,
	RoundNo:         1,
	Status:          StatusActive,
	BankScope: map[string]any{
		"source_mode":      input.SourceMode,
		"flow_mode":        input.FlowMode,
		"course_id":        input.CourseID,
		"bank_ids":         input.BankIDs,
		"exclude_mastered": input.ExcludeMastered,
		"question_count":   input.QuestionCount,
		"random_seed":      input.RandomSeed,
		"round_no":         1,
	},
}
```

- [ ] **Step 5: Read course filters in handlers**

在 `handler.go` 中给列表和状态查询补 `course_id`：

```go
func (handler *Handler) listSessions(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	filter := PracticeSessionListFilter{
		Status:       ctx.Query("status"),
		FlowMode:     ctx.Query("flow_mode"),
		PracticeMode: ctx.Query("practice_mode"),
		CourseID:     int64PtrFromQuery(ctx.Query("course_id")),
		Page:         parseInt(ctx.DefaultQuery("page", "1")),
		PageSize:     parseInt(ctx.DefaultQuery("page_size", "20")),
	}
	result, err := handler.service.ListSessions(ctx.Request.Context(), scope, filter)
	respondPractice(ctx, result, err)
}

func (handler *Handler) listStates(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	filter := UserQuestionStateFilter{
		StateType: ctx.Query("state_type"),
		BankID:    int64PtrFromQuery(ctx.Query("bank_id")),
		CourseID:  int64PtrFromQuery(ctx.Query("course_id")),
		Page:      parseInt(ctx.DefaultQuery("page", "1")),
		PageSize:  parseInt(ctx.DefaultQuery("page_size", "20")),
	}
	result, err := handler.service.ListStateDetails(ctx.Request.Context(), scope, filter)
	respondPractice(ctx, result, err)
}
```

增加帮助函数：

```go
func int64PtrFromQuery(value string) *int64 {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return nil
	}
	return &parsed
}
```

- [ ] **Step 6: Run module test**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./internal/modules/practice
```

Expected: 编译仍可能因 MySQL 仓库未实现 `CourseExists` 与课程过滤而失败；进入 Task 3 后转绿。

## Task 3: MySQL repository

**Files:**
- Modify: `internal/modules/practice/mysql_repository.go`

- [ ] **Step 1: Implement `CourseExists`**

新增仓库方法：

```go
func (repo *MySQLRepository) CourseExists(ctx context.Context, tenantID int64, courseID int64) (bool, error) {
	const query = `
SELECT 1
FROM courses
WHERE id = ? AND tenant_id = ? AND status = 'active' AND deleted_at IS NULL
LIMIT 1`

	var value int
	err := repo.db.QueryRowContext(ctx, query, courseID, tenantID).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
```

- [ ] **Step 2: Extend `ListCandidates` for course source**

在 `ListCandidates` 查询中补课程分支：

```go
func (repo *MySQLRepository) ListCandidates(ctx context.Context, scope Scope, input CandidateFilter) ([]QuestionCandidate, error) {
	query := `
SELECT
  qb.id,
  q.id,
  q.current_version_id,
  q.question_type,
  qv.content_json,
  qv.answer_json,
  qv.analysis_json
FROM questions q
JOIN question_versions qv ON qv.id = q.current_version_id
JOIN question_bank_questions qbq ON qbq.question_id = q.id
JOIN question_banks qb ON qb.id = qbq.question_bank_id AND qb.tenant_id = q.tenant_id
WHERE q.tenant_id = ?
  AND q.status = 'active'
  AND q.deleted_at IS NULL
  AND q.current_version_id IS NOT NULL
  AND qb.deleted_at IS NULL
  AND qb.status = 'active'`
	args := []any{scope.TenantID}

	if input.CourseID != nil {
		query += " AND qb.course_id = ?"
		args = append(args, *input.CourseID)
	} else if len(input.BankIDs) > 0 {
		query += " AND qb.id IN (" + placeholders(len(input.BankIDs)) + ")"
		for _, id := range input.BankIDs {
			args = append(args, id)
		}
	}
	query += " ORDER BY qb.id ASC, q.id ASC"
	if input.ExcludeMastered {
		query += " AND COALESCE(uqs.is_mastered, 0) = 0"
	}
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCandidates(rows)
}
```

- [ ] **Step 3: Filter sessions by `course_id` and scan it**

在 `ListSessions` 中补课程列和筛选：

```go
const listSessionsBase = `
SELECT
  ps.id,
  ps.course_id,
  ps.practice_mode,
  ps.source_mode,
  ps.bank_scope_json,
  ps.started_at,
  ps.ended_at,
  ps.status,
  COUNT(psq.id),
  SUM(CASE WHEN la.id IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN la.is_correct = 1 THEN 1 ELSE 0 END),
  SUM(CASE WHEN la.is_correct = 0 THEN 1 ELSE 0 END)
FROM practice_sessions ps
LEFT JOIN practice_session_questions psq ON psq.session_id = ps.id
LEFT JOIN (
  SELECT pa1.*
  FROM practice_answers pa1
  INNER JOIN (
    SELECT session_question_id, user_id, MAX(id) AS max_id
    FROM practice_answers
    GROUP BY session_question_id, user_id
  ) latest ON latest.max_id = pa1.id
) la ON la.session_question_id = psq.id AND la.user_id = ps.user_id
WHERE ps.tenant_id = ? AND ps.user_id = ?`
```

加过滤：

```go
if filter.CourseID != nil {
	query += " AND ps.course_id = ?"
	args = append(args, *filter.CourseID)
}
```

扫描结构：

```go
func scanSessionListItem(rows *sql.Rows) (PracticeSessionListItem, error) {
	var item PracticeSessionListItem
	var scopeJSON []byte
	if err := rows.Scan(
		&item.ID,
		&item.CourseID,
		&item.PracticeMode,
		&item.SourceMode,
		&scopeJSON,
		&item.StartedAt,
		&item.EndedAt,
		&item.Status,
	&item.TotalCount,
	&item.AnsweredCount,
	&item.CorrectCount,
	&item.WrongCount,
	); err != nil {
		return PracticeSessionListItem{}, err
	}
	if endedAt.Valid {
		value := endedAt.Time
		item.EndedAt = &value
	}
	var scope map[string]any
	if err := unmarshalMap(scopeJSON, &scope); err != nil {
		return PracticeSessionListItem{}, err
	}
	item.FlowMode, _ = scope["flow_mode"].(string)
	item.BankIDs = anyInt64Slice(scope["bank_ids"])
	if item.AnsweredCount > 0 {
		item.Accuracy = float64(item.CorrectCount) / float64(item.AnsweredCount)
	}
	return item, nil
}
```

- [ ] **Step 4: Filter state details by `course_id`**

在 `ListStateDetails` 中补课程过滤：

```go
if filter.CourseID != nil {
	query += `
 AND EXISTS (
   SELECT 1
   FROM question_bank_questions qbq
   JOIN question_banks qb ON qb.id = qbq.question_bank_id AND qb.tenant_id = uqs.tenant_id
   WHERE qbq.question_id = uqs.question_id
     AND qb.course_id = ?
     AND qb.status = 'active'
     AND qb.deleted_at IS NULL
 )`
	args = append(args, *filter.CourseID)
}
```

同时保留 `bank_id` 分支，两个条件并存时都追加，等价于交集。

- [ ] **Step 5: Surface course info in session detail/results**

确保 `GetSession` 和 `GetSessionResults` 读取 `practice_sessions.course_id`。如果当前 `GetSession` 已读取该列但未回填，补齐：

```go
if courseID.Valid {
	value := courseID.Int64
	session.CourseID = &value
}
```

并让结果摘要返回：

```go
summary := PracticeSessionListItem{
	ID:            detail.ID,
	CourseID:      detail.CourseID,
	Status:        detail.Status,
	PracticeMode:  detail.PracticeMode,
	SourceMode:    detail.SourceMode,
	FlowMode:      detail.FlowMode,
	BankIDs:       append([]int64{}, detail.BankIDs...),
	StartedAt:     detail.StartedAt,
	EndedAt:       detail.EndedAt,
	TotalCount:    len(detail.Questions),
	AnsweredCount: answered,
	CorrectCount:  correct,
	WrongCount:    wrong,
	Accuracy:      accuracy,
}
```

- [ ] **Step 6: Run backend tests**

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./internal/modules/practice
```

Expected: PASS。

Run:

```powershell
$env:GOROOT='D:\workspace\envs\go\1.26.2'; $env:GOPATH='D:\workspace\envs\go\gopath'; $env:GOBIN='D:\workspace\envs\go\bin'; $env:GOMODCACHE='D:\workspace\cache\go-mod'; $env:GOCACHE='D:\workspace\cache\go-build'; $env:GOPROXY='https://goproxy.cn,direct'; $env:GOSUMDB='off'; & 'D:\workspace\envs\go\1.26.2\bin\go.exe' test -work ./...
```

Expected: PASS。

## Task 4: SDK

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`

- [ ] **Step 1: Add failing SDK tests for `course_id`**

在 `packages/api-sdk/src/client.test.ts` 中新增两个测试：

```ts
it("creates course practice sessions with course source", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({
      code: 0,
      message: "ok",
      data: {
        id: 501,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "random",
        source_mode: "course",
        flow_mode: "fixed_count",
        course_id: 12,
        bank_scope: { source_mode: "course", course_id: 12 },
        bank_ids: [],
        exclude_mastered: true,
        question_count: 10,
        random_seed: 1,
        round_no: 1,
        status: "active",
        questions: []
      }
    })
  );
  const client = createApiClient({ baseUrl: "http://127.0.0.1:18081/api/v1", fetch: fetchMock });

  await client.createPracticeSession({
    practice_mode: "random",
    source_mode: "course",
    flow_mode: "fixed_count",
    course_id: 12,
    bank_ids: [],
    exclude_mastered: true,
    question_count: 10
  });

  const [, init] = fetchMock.mock.calls[0];
  expect(init?.body).toBe(JSON.stringify({
    practice_mode: "random",
    source_mode: "course",
    flow_mode: "fixed_count",
    course_id: 12,
    bank_ids: [],
    exclude_mastered: true,
    question_count: 10
  }));
});

it("adds course filters to session and state list requests", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ code: 0, message: "ok", data: { items: [], page: 1, page_size: 20, total: 0 } }))
    .mockResolvedValueOnce(jsonResponse({ code: 0, message: "ok", data: { items: [], page: 1, page_size: 20, total: 0 } }));
  const client = createApiClient({ baseUrl: "http://127.0.0.1:18081/api/v1", fetch: fetchMock });

  await client.listPracticeSessions({ course_id: 12, status: "finished" });
  await client.listUserQuestionStates({ state_type: "wrong", course_id: 12 });

  expect(String(fetchMock.mock.calls[0][0])).toContain("/practice/sessions?course_id=12&status=finished");
  expect(String(fetchMock.mock.calls[1][0])).toContain("/user-question-states?state_type=wrong&course_id=12");
});
```

- [ ] **Step 2: Extend SDK types**

在 `client.ts` 中补字段：

```ts
export interface PracticeSessionListQuery {
  status?: string;
  flow_mode?: string;
  practice_mode?: string;
  course_id?: number;
  page?: number;
  page_size?: number;
}

export interface PracticeSessionListItem {
  id: number;
  course_id?: number | null;
  practice_mode: string;
  source_mode: string;
  flow_mode: string;
  bank_ids: number[];
  status: string;
  started_at?: string;
  ended_at?: string | null;
  total_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
}

export interface PracticeSessionDetail {
  id: number;
  tenant_id: number;
  user_id: number;
  practice_mode: string;
  source_mode: string;
  flow_mode: string;
  course_id?: number | null;
  bank_scope: Record<string, unknown>;
  bank_ids: number[];
  exclude_mastered: boolean;
  question_count?: number;
  random_seed: number;
  round_no: number;
  status: string;
  questions: PracticeSessionQuestion[];
}

export interface UserQuestionStateListQuery {
  state_type?: string;
  bank_id?: number;
  course_id?: number;
  page?: number;
  page_size?: number;
}
```

- [ ] **Step 3: Keep request builders unchanged except typed query support**

`createApiClient` 里的请求路径无需新增新方法，但要确保现有 `buildPath` 自动带出新增字段。保持实现：

```ts
listPracticeSessions: (query) =>
  request(fetcher, options, buildPath("/practice/sessions", query), { method: "GET" }),
listUserQuestionStates: (query) =>
  request(fetcher, options, buildPath("/user-question-states", query), { method: "GET" }),
```

这里的实际改动是让 `query` 类型包含 `course_id`，以及 `PracticeSessionDetail` / `PracticeSessionResults.session` / `PracticeSessionListItem` 读得到 `course_id`。

- [ ] **Step 4: Run SDK test**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: PASS。

## Task 5: 学生端课程入口和课程筛选

**Files:**
- Modify: `apps/user-web/src/practice-panel.tsx`
- Modify: `apps/user-web/src/practice-panel.test.tsx`
- Modify: `apps/user-web/src/practice-review-pages.tsx`
- Modify: `apps/user-web/src/practice-review-pages.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Add frontend tests for course source**

在 `practice-panel.test.tsx` 中新增课程来源测试：

```ts
it("creates fixed-count practice from course source with default count 10", async () => {
  const api = createPracticeApi();
  render(<PracticePanel api={api} />);

  fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "course" } });
  fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

  await waitFor(() => {
    expect(api.createPracticeSession).toHaveBeenCalledWith({
      practice_mode: "random",
      source_mode: "course",
      flow_mode: "fixed_count",
      course_id: 12,
      bank_ids: [],
      exclude_mastered: true,
      question_count: 10
    });
  });
});

it("creates continuous practice from course source without question count", async () => {
  const api = createPracticeApi();
  render(<PracticePanel api={api} />);

  fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "course" } });
  fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("练题流"), { target: { value: "continuous" } });
  fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

  await waitFor(() => {
    expect(api.createPracticeSession).toHaveBeenCalledWith({
      practice_mode: "random",
      source_mode: "course",
      flow_mode: "continuous",
      course_id: 12,
      bank_ids: [],
      exclude_mastered: true,
      question_count: undefined
    });
  });
});
```

- [ ] **Step 2: Add frontend tests for course filters and course display**

在 `practice-review-pages.test.tsx` 中新增：

```ts
it("filters session history by course id", async () => {
  const api = createPracticeReviewApi();
  render(<PracticeHistoryPage api={api} />);

  fireEvent.change(screen.getByLabelText("课程ID筛选"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "筛选记录" }));

  await waitFor(() => {
    expect(api.listPracticeSessions).toHaveBeenCalledWith({ course_id: 12, page: 1, page_size: 20 });
  });
});

it("filters wrong states by course id", async () => {
  const api = createPracticeReviewApi();
  render(<PracticeStateListPage api={api} stateType="wrong" />);

  fireEvent.change(screen.getByLabelText("课程ID筛选"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "筛选题目" }));

  await waitFor(() => {
    expect(api.listUserQuestionStates).toHaveBeenCalledWith({ state_type: "wrong", course_id: 12 });
  });
});

it("shows course id on result and detail pages", async () => {
  const api = createPracticeReviewApi();
  render(<PracticeResultPage api={api} sessionId={501} />);

  expect(await screen.findByText("课程ID：12")).toBeTruthy();
});
```

- [ ] **Step 3: Add source selector and course input to `PracticePanel`**

把 `defaultForm` 扩成：

```ts
const defaultForm = {
  sourceMode: "bank",
  bankIds: "",
  courseId: "",
  flowMode: "fixed_count",
  practiceMode: "random",
  questionCount: "10",
  excludeMastered: true
};
```

在表单中增加：

```tsx
<label htmlFor="practice_source_mode">练题来源</label>
<select
  id="practice_source_mode"
  value={form.sourceMode}
  onChange={(event) => setForm((current) => ({ ...current, sourceMode: event.target.value, bankIds: "", courseId: "" }))}
>
  <option value="bank">题库</option>
  <option value="course">课程</option>
</select>

{form.sourceMode === "bank" ? (
  <>
    <label htmlFor="practice_bank_ids">题库ID</label>
    <input id="practice_bank_ids" value={form.bankIds} onChange={(event) => setForm((current) => ({ ...current, bankIds: event.target.value }))} />
  </>
) : (
  <>
    <label htmlFor="practice_course_id">课程ID</label>
    <input id="practice_course_id" inputMode="numeric" value={form.courseId} onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))} />
  </>
)}
```

提交时分支构造请求：

```ts
const bankIDs = parseBankIDs(form.bankIds);
const courseID = parsePositiveNumber(form.courseId);
const created = await api.createPracticeSession({
  practice_mode: form.practiceMode,
  source_mode: form.sourceMode === "course" ? "course" : bankIDs.length > 1 ? "multi_bank" : "single_bank",
  flow_mode: form.flowMode,
  course_id: form.sourceMode === "course" ? courseID : undefined,
  bank_ids: form.sourceMode === "course" ? [] : bankIDs,
  exclude_mastered: form.excludeMastered,
  question_count: form.flowMode === "fixed_count" ? Number(form.questionCount || "10") : undefined
});
```

增加帮助函数：

```ts
function parsePositiveNumber(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
```

- [ ] **Step 4: Add course filters and course display to review pages**

在 `practice-review-pages.tsx` 中：

1. `PracticeHistoryPage` 增加课程筛选状态。
2. `PracticeStateListPage` 增加课程筛选状态。
3. `PracticeResultPage` 和 `PracticeSessionDetailPage` 展示 `course_id`。

使用如下最小结构：

```tsx
const [courseId, setCourseId] = useState("");

async function loadSessions(nextCourseId?: string) {
  const parsed = parsePositiveNumber(nextCourseId ?? courseId);
  const data = await api.listPracticeSessions({
    course_id: parsed,
    page: 1,
    page_size: 20
  });
  setSessions(data.items);
}

<label htmlFor="practice_history_course_id">课程ID筛选</label>
<input
  id="practice_history_course_id"
  inputMode="numeric"
  value={courseId}
  onChange={(event) => setCourseId(event.target.value)}
/>
<button type="button" onClick={() => void loadSessions()}>
  筛选记录
</button>

{summary?.course_id ? <p>课程ID：{summary.course_id}</p> : null}
```

错题/熟题/疑惑题页使用同样模式：

```tsx
await api.listUserQuestionStates({
  state_type: stateType,
  bank_id: bankId,
  course_id: parsedCourseID
});
```

- [ ] **Step 5: Keep app wiring unchanged except state flow compatibility**

`app.tsx` 只需确认新的课程来源会话仍能回到 `/app/practice`，并沿用已有 `pendingPracticeSession`。如测试中需要，补充 stub：

```ts
const createdSession: PracticeSessionDetail = {
  id: 501,
  tenant_id: 1,
  user_id: 7,
  practice_mode: "random",
  source_mode: "course",
  flow_mode: "fixed_count",
  course_id: 12,
  bank_scope: { source_mode: "course", course_id: 12 },
  bank_ids: [],
  exclude_mastered: true,
  question_count: 10,
  random_seed: 1,
  round_no: 1,
  status: "active",
  questions: []
};
```

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
pnpm test -- apps/user-web/src/practice-panel.test.tsx apps/user-web/src/practice-review-pages.test.tsx apps/user-web/src/app.test.tsx
```

Expected: PASS。

## Task 6: OpenAPI and documentation

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Create: `docs/docs/25_stage2e_implementation_status.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Extend practice request and query schemas**

在 `docs/api/openapi.yaml` 中补以下字段：

```yaml
PracticeSessionInput:
  type: object
  properties:
    practice_mode:
      type: string
    source_mode:
      type: string
      enum: [single_bank, multi_bank, question_list, course]
    flow_mode:
      type: string
    course_id:
      type: integer
    bank_ids:
      type: array
      items:
        type: integer
    exclude_mastered:
      type: boolean
    question_count:
      type: integer

PracticeSessionListItem:
  type: object
  required: [id, status, practice_mode, source_mode, flow_mode, bank_ids, total_count, answered_count, correct_count, wrong_count, accuracy]
  properties:
    id:
      type: integer
    course_id:
      type: integer
      nullable: true
```

并给查询参数增加：

```yaml
- in: query
  name: course_id
  schema:
    type: integer
```

分别加入：
- `GET /practice/sessions`
- `GET /user-question-states`

- [ ] **Step 2: Extend result/detail schemas with course**

在会话详情和结果摘要 schema 里补：

```yaml
PracticeSessionDetail:
  properties:
    course_id:
      type: integer
      nullable: true

PracticeSessionResults:
  properties:
    session:
      allOf:
        - $ref: '#/components/schemas/PracticeSessionListItem'
```

目标是让结果页、详情页、SDK 都能从正式 OpenAPI 读到 `course_id`。

- [ ] **Step 3: Update API design markdown**

在 `docs/docs/openapi_design_v1.md` 中新增/更新以下段落：

```md
### 练题按课程创建

`POST /api/v1/practice/sessions`

当 `source_mode=course` 时：
- `course_id` 必填
- `bank_ids` 可为空数组
- 候选题来自当前租户下 `question_banks.course_id = course_id` 的可用题库

### 练题记录课程筛选

`GET /api/v1/practice/sessions?course_id=12`

### 用户题目状态课程筛选

`GET /api/v1/user-question-states?state_type=wrong&course_id=12`
```

- [ ] **Step 4: Create stage status doc**

创建 `docs/docs/25_stage2e_implementation_status.md`，内容至少包含：

```md
# 阶段 2E 实施状态：课程维度练题入口与结果聚合

日期：2026-04-22
状态：已完成实现并通过验证，待提交归档

## 1. 本阶段完成内容
- 课程来源练题
- 练题记录课程筛选
- 错题本/熟题本/疑惑题课程筛选
- 结果页与会话详情展示课程 ID

## 2. 已落实业务口径
1. `source_mode=course`
2. 课程来源只抽取该课程下可用题库题目
3. 课程不存在返回 404

## 3. 当前限制
1. 暂未展示课程名称
2. 暂无老师班级学习页
3. 暂无课程图表聚合

## 4. 已执行验证
```powershell
go test -work ./...
pnpm test
pnpm typecheck
pnpm build
```
```

- [ ] **Step 5: Update docs README**

在 `docs/README.md` 的 AI 阅读顺序和目录说明中追加：

```md
20. `docs/25_stage2e_implementation_status.md`
```

以及：

```md
- `docs/25_stage2e_implementation_status.md`：阶段 2E 课程维度练题入口与结果聚合实施状态
```

- [ ] **Step 6: Parse OpenAPI**

Run:

```powershell
$tempPath = 'D:\workspace\temp\openapi_parse_stage2e_test.go'
@'
package main

import (
  "fmt"
  "os"

  "github.com/goccy/go-yaml"
)

func main() {
  data, err := os.ReadFile("D:/workspace/projects/aios_practice_platform/docs/api/openapi.yaml")
  if err != nil {
    panic(err)
  }
  var doc map[string]any
  if err := yaml.Unmarshal(data, &doc); err != nil {
    panic(err)
  }
  fmt.Println("openapi_parse_ok")
}
'@ | Set-Content -Path $tempPath -Encoding UTF8
go run $tempPath
Remove-Item $tempPath -Force
```

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

Expected: all PASS。

- [ ] **Step 2: Hygiene checks**

Run:

```powershell
rg -n "filecite||1149637211qa" apps cmd docs internal packages .gitignore package.json pnpm-lock.yaml go.mod go.sum
```

Expected: no matches。

Run:

```powershell
git diff --check
```

Expected: no output。

Run UTF-8/BOM/mixed line ending check:

```powershell
$ErrorActionPreference='Stop'
$roots = @('apps','cmd','docs','internal','packages')
$exts = @('.go','.ts','.tsx','.js','.jsx','.json','.md','.yml','.yaml','.toml','.sql','.css','.html')
$bad = @()
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Recurse -File | Where-Object { $exts -contains $_.Extension.ToLowerInvariant() } | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $bad += "BOM $($_.FullName)" }
    $text = [System.Text.UTF8Encoding]::new($false, $true).GetString($bytes)
    if (($text -match "`r`n") -and ($text -match "(?<!`r)`n")) { $bad += "MIXED_EOL $($_.FullName)" }
  }
}
if ($bad.Count -gt 0) { $bad | ForEach-Object { Write-Output $_ }; exit 1 }
Write-Output 'encoding_eol_ok'
```

Expected:

```text
encoding_eol_ok
```

- [ ] **Step 3: Stage and commit**

Run:

```powershell
git add cmd internal apps packages docs
git diff --cached --check
git commit -m "新增：完成阶段2e课程练题入口"
```

Expected: commit succeeds and `git status --short` is clean。
