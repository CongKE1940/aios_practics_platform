# 阶段 2F 老师侧班级学习页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stage 2F teacher class-learning loop: a protected analytics API, SDK method, user-web teacher page, OpenAPI contract, and status docs.

**Architecture:** Add a new backend `internal/modules/analytics` module with model/service/handler/MySQL repository layers, following the existing module style. The API aggregates existing practice tables in real time and enforces teacher assignment scope through `teacher_class_course_assignments`; the frontend consumes the SDK from a focused `ClassLearningPage` component.

**Tech Stack:** Go, Gin, database/sql, MySQL 8, sqlmock, React 18, TypeScript, Vite, Vitest, OpenAPI 3.0 YAML.

---

## File Map

- Create: `internal/modules/analytics/model.go` for analytics models, query structs, repository interface, errors, and pagination helpers.
- Create: `internal/modules/analytics/service.go` for validation, time range normalization, authorization, and orchestration.
- Create: `internal/modules/analytics/handler.go` for JWT parsing, `analytics:view` permission checks, query parsing, and JSON responses.
- Create: `internal/modules/analytics/mysql_repository.go` for MySQL existence, assignment, and aggregation queries.
- Create: `internal/modules/analytics/handler_test.go` for service/handler tests with an in-memory repository.
- Create: `internal/modules/analytics/mysql_repository_test.go` for sqlmock checks around tenant and assignment filters.
- Modify: `cmd/server/main.go` to wire the analytics handler into `/api/v1`.
- Modify: `internal/modules/rbac/menu.go` and `internal/modules/rbac/menu_service_test.go` to add the user-web “班级学习” menu.
- Modify: `packages/api-sdk/src/client.ts` and `packages/api-sdk/src/client.test.ts` to add analytics types and `getClassPracticeSummary`.
- Create: `apps/user-web/src/class-learning-page.tsx` for the teacher class-learning page.
- Create: `apps/user-web/src/class-learning-page.test.tsx` for UI behavior tests.
- Modify: `apps/user-web/src/app.tsx` and `apps/user-web/src/app.test.tsx` to register the page in the user shell.
- Modify: `docs/api/openapi.yaml`, `docs/docs/openapi_design_v1.md`, `docs/README.md`.
- Create: `docs/docs/26_stage2f_implementation_status.md`.

## Shared Backend Types

Use these names consistently across backend, SDK, OpenAPI, and frontend:

```go
type Scope struct {
	TenantID    int64
	UserID      int64
	UserType    string
	Permissions []string
}

type ClassPracticeSummaryQuery struct {
	TenantID int64
	ClassID  int64
	CourseID int64
	StartAt  *time.Time
	EndAt    *time.Time
	Page     int
	PageSize int
}

type ClassPracticeSummary struct {
	ClassID                  int64      `json:"class_id"`
	ClassName                string     `json:"class_name"`
	CourseID                 int64      `json:"course_id"`
	CourseName               string     `json:"course_name"`
	StudentCount             int        `json:"student_count"`
	ParticipatedStudentCount int        `json:"participated_student_count"`
	SessionCount             int        `json:"session_count"`
	AnsweredCount            int        `json:"answered_count"`
	CorrectCount             int        `json:"correct_count"`
	WrongCount               int        `json:"wrong_count"`
	Accuracy                 float64    `json:"accuracy"`
	WrongQuestionCount       int        `json:"wrong_question_count"`
	ConfusedQuestionCount    int        `json:"confused_question_count"`
	LastPracticedAt          *time.Time `json:"last_practiced_at,omitempty"`
}

type ClassPracticeStudentItem struct {
	StudentID             int64      `json:"student_id"`
	StudentName           string     `json:"student_name"`
	StudentNo             *string    `json:"student_no,omitempty"`
	SessionCount          int        `json:"session_count"`
	AnsweredCount         int        `json:"answered_count"`
	CorrectCount          int        `json:"correct_count"`
	WrongCount            int        `json:"wrong_count"`
	Accuracy              float64    `json:"accuracy"`
	WrongQuestionCount    int        `json:"wrong_question_count"`
	ConfusedQuestionCount int        `json:"confused_question_count"`
	LastPracticedAt       *time.Time `json:"last_practiced_at,omitempty"`
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type ClassPracticeSummaryResult struct {
	Summary  ClassPracticeSummary                 `json:"summary"`
	Students PageResult[ClassPracticeStudentItem] `json:"students"`
}
```

Repository contract:

```go
type Repository interface {
	ClassCourseExists(ctx context.Context, tenantID int64, classID int64, courseID int64) (bool, error)
	TeacherCanViewClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error)
	GetClassPracticeSummary(ctx context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error)
	ListClassPracticeStudents(ctx context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error)
}
```

Error constants:

```go
const (
	CodeInvalidInput = 40000
	CodeForbidden    = 40300
	CodeNotFound     = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
	ErrNotFound     = errors.New("resource not found")
)
```

## Task 1: Backend Analytics Red Tests And Models

**Files:**
- Create: `internal/modules/analytics/model.go`
- Create: `internal/modules/analytics/service.go`
- Create: `internal/modules/analytics/handler.go`
- Create: `internal/modules/analytics/handler_test.go`

- [ ] **Step 1: Add model definitions**

Create `internal/modules/analytics/model.go` with the shared backend types above. Also include `normalizePage`, `normalizePageSize`, and `pageOf` helpers copied in style from `internal/modules/practice/model.go`, with max page size 100.

- [ ] **Step 2: Add service skeleton**

Create `internal/modules/analytics/service.go`:

```go
package analytics

import (
	"context"
	"time"
)

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (service *Service) GetClassPracticeSummary(ctx context.Context, scope Scope, query ClassPracticeSummaryQuery) (ClassPracticeSummaryResult, error) {
	return ClassPracticeSummaryResult{}, ErrInvalidInput
}
```

- [ ] **Step 3: Add handler skeleton**

Create `internal/modules/analytics/handler.go` with a `TokenParser` interface matching practice, `NewHandler`, and route registration:

```go
func (handler *Handler) RegisterRoutes(router gin.IRouter) {
	router.GET("/analytics/class-practice-summary", handler.getClassPracticeSummary)
}
```

For this red-test step, `getClassPracticeSummary` may return `501` with `response.Failure(50000, "服务异常", requestID)` after authorization helpers are stubbed.

- [ ] **Step 4: Write failing handler/service tests**

Create `internal/modules/analytics/handler_test.go` with these tests:

```go
func TestHandler_TeacherClassPracticeSummaryReturnsOverviewAndStudents(t *testing.T)
func TestHandler_TeacherCannotViewUnassignedClassCourse(t *testing.T)
func TestHandler_AdminCanViewTenantClassCourse(t *testing.T)
func TestHandler_RejectsMissingAnalyticsPermission(t *testing.T)
func TestHandler_RejectsMissingClassOrCourseID(t *testing.T)
func TestService_RejectsTimeRangeLongerThan366Days(t *testing.T)
func TestService_ReturnsZeroAccuracyWhenNoAnswers(t *testing.T)
```

Use an in-memory repository with fields:

```go
type memoryRepository struct {
	classCourseExists bool
	teacherAllowed    bool
	summary           ClassPracticeSummary
	students          []ClassPracticeStudentItem
	lastQuery         ClassPracticeSummaryQuery
}
```

Expected happy-path assertions:

```go
rec := performAnalyticsRequest(
	router,
	http.MethodGet,
	"/api/v1/analytics/class-practice-summary?class_id=101&course_id=12&page=1&page_size=20",
	nil,
	"token",
)
if rec.Code != http.StatusOK {
	t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
}
var body envelope[ClassPracticeSummaryResult]
decodeAnalyticsBody(t, rec, &body)
if body.Data.Summary.ClassName != "一班" || body.Data.Summary.Accuracy != 0.8 {
	t.Fatalf("summary = %+v", body.Data.Summary)
}
if len(body.Data.Students.Items) != 2 {
	t.Fatalf("student count = %d", len(body.Data.Students.Items))
}
```

- [ ] **Step 5: Run red tests**

Run:

```powershell
go test ./internal/modules/analytics -run TestHandler_TeacherClassPracticeSummaryReturnsOverviewAndStudents -count=1
```

Expected: FAIL because service and handler skeletons do not yet implement the behavior.

## Task 2: Backend Analytics Implementation

**Files:**
- Modify: `internal/modules/analytics/service.go`
- Modify: `internal/modules/analytics/handler.go`
- Modify: `internal/modules/analytics/handler_test.go`

- [ ] **Step 1: Implement time range normalization**

In `service.go`, add:

```go
const maxRangeDays = 366

func normalizeTimeRange(now time.Time, startAt *time.Time, endAt *time.Time) (time.Time, time.Time, error) {
	end := now
	if endAt != nil {
		end = *endAt
	}
	start := end.AddDate(0, 0, -30)
	if startAt != nil {
		start = *startAt
	}
	if start.After(end) {
		return time.Time{}, time.Time{}, ErrInvalidInput
	}
	if end.Sub(start) > maxRangeDays*24*time.Hour {
		return time.Time{}, time.Time{}, ErrInvalidInput
	}
	return start, end, nil
}
```

- [ ] **Step 2: Implement service validation and authorization**

Implement `GetClassPracticeSummary`:

```go
func (service *Service) GetClassPracticeSummary(ctx context.Context, scope Scope, query ClassPracticeSummaryQuery) (ClassPracticeSummaryResult, error) {
	if query.ClassID <= 0 || query.CourseID <= 0 {
		return ClassPracticeSummaryResult{}, ErrInvalidInput
	}
	start, end, err := normalizeTimeRange(service.now(), query.StartAt, query.EndAt)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	query.TenantID = scope.TenantID
	query.StartAt = &start
	query.EndAt = &end
	query.Page = normalizePage(query.Page)
	query.PageSize = normalizePageSize(query.PageSize)

	exists, err := service.repo.ClassCourseExists(ctx, scope.TenantID, query.ClassID, query.CourseID)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	if !exists {
		return ClassPracticeSummaryResult{}, ErrNotFound
	}
	if !canViewAllTenantAnalytics(scope) {
		if scope.UserType != "teacher" {
			return ClassPracticeSummaryResult{}, ErrForbidden
		}
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, scope.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return ClassPracticeSummaryResult{}, err
		}
		if !allowed {
			return ClassPracticeSummaryResult{}, ErrForbidden
		}
	}
	summary, err := service.repo.GetClassPracticeSummary(ctx, query)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	students, err := service.repo.ListClassPracticeStudents(ctx, query)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	return ClassPracticeSummaryResult{Summary: summary, Students: students}, nil
}

func canViewAllTenantAnalytics(scope Scope) bool {
	return scope.UserType == "sys_admin" || scope.UserType == "school_admin"
}
```

`TenantID` is carried in `ClassPracticeSummaryQuery` so repository methods can keep tenant filtering explicit.

- [ ] **Step 3: Implement handler authorization and parsing**

In `handler.go`, implement:

```go
func (handler *Handler) getClassPracticeSummary(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	query, ok := parseClassPracticeSummaryQuery(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
		return
	}
	result, err := handler.service.GetClassPracticeSummary(ctx.Request.Context(), scope, query)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(result, ctx.GetHeader("X-Request-Id")))
}
```

Parsing rules:

```go
func parseClassPracticeSummaryQuery(ctx *gin.Context) (ClassPracticeSummaryQuery, bool) {
	classID, ok := parseRequiredInt64(ctx.Query("class_id"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	courseID, ok := parseRequiredInt64(ctx.Query("course_id"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	startAt, ok := parseOptionalTime(ctx.Query("start_at"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	endAt, ok := parseOptionalTime(ctx.Query("end_at"))
	if !ok {
		return ClassPracticeSummaryQuery{}, false
	}
	return ClassPracticeSummaryQuery{
		ClassID: classID, CourseID: courseID, StartAt: startAt, EndAt: endAt,
		Page: parseInt(ctx.Query("page")), PageSize: parseInt(ctx.Query("page_size")),
	}, true
}
```

Use `time.Parse(time.RFC3339, value)` in `parseOptionalTime`.

- [ ] **Step 4: Implement handler error mapping**

Use:

```go
func writeAnalyticsError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		ctx.JSON(http.StatusBadRequest, response.Failure(CodeInvalidInput, "请求参数错误", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrForbidden):
		ctx.JSON(http.StatusForbidden, response.Failure(CodeForbidden, "无权限访问", ctx.GetHeader("X-Request-Id")))
	case errors.Is(err, ErrNotFound):
		ctx.JSON(http.StatusNotFound, response.Failure(CodeNotFound, "资源不存在", ctx.GetHeader("X-Request-Id")))
	default:
		ctx.JSON(http.StatusInternalServerError, response.Failure(50000, "服务异常", ctx.GetHeader("X-Request-Id")))
	}
}
```

- [ ] **Step 5: Run analytics tests**

Run:

```powershell
go test ./internal/modules/analytics -count=1
```

Expected: PASS for handler/service tests using the memory repository.

## Task 3: MySQL Analytics Repository

**Files:**
- Create: `internal/modules/analytics/mysql_repository.go`
- Create: `internal/modules/analytics/mysql_repository_test.go`

- [ ] **Step 1: Write sqlmock tests**

Create `mysql_repository_test.go` with:

```go
func TestMySQLRepositoryTeacherCanViewClassCourseUsesTenantAndCurrentAssignment(t *testing.T)
func TestMySQLRepositoryClassCourseExistsUsesTenantClassAndCourse(t *testing.T)
func TestMySQLRepositoryListClassPracticeStudentsIncludesStudentsWithoutPractice(t *testing.T)
```

For assignment test, expect this query shape:

```sql
SELECT id
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ?
  AND is_current = 1 AND status = 'active'
LIMIT 1
```

- [ ] **Step 2: Implement repository skeleton and existence methods**

Create `mysql_repository.go`:

```go
package analytics

import (
	"context"
	"database/sql"
	"errors"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}
```

Implement `ClassCourseExists`:

```sql
SELECT c.id
FROM classes c
JOIN courses co ON co.tenant_id = c.tenant_id
WHERE c.tenant_id = ? AND c.id = ? AND co.id = ?
  AND c.status = 'active' AND co.status = 'active'
  AND c.deleted_at IS NULL AND co.deleted_at IS NULL
LIMIT 1
```

Implement `TeacherCanViewClassCourse` with the query from Step 1. Map `sql.ErrNoRows` to `false, nil`.

- [ ] **Step 3: Implement summary aggregation**

Implement `GetClassPracticeSummary` with three focused queries:

1. Class/course names and student count.
2. Session and answer aggregates from `practice_sessions`, `practice_session_questions`, and `practice_answers`.
3. Wrong/confused question counts from `user_question_states` filtered by active question banks for the course.

The session and answer query must restrict:

```sql
ps.tenant_id = scm.tenant_id
AND ps.user_id = scm.student_id
AND ps.course_id = ?
AND ps.started_at BETWEEN ? AND ?
pa.answered_at BETWEEN ? AND ?
scm.tenant_id = ?
scm.class_id = ?
scm.is_current = 1
scm.status = 'active'
```

After scanning, compute:

```go
summary.Accuracy = ratio(summary.CorrectCount, summary.AnsweredCount)
```

Implement:

```go
func ratio(part int, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(part) / float64(total)
}
```

- [ ] **Step 4: Implement student pagination and metrics**

Implement `ListClassPracticeStudents` in two steps:

1. Count all current active class students.
2. Query page rows ordered by `u.display_name ASC, scm.student_id ASC`.

The row query must start from `student_class_memberships` and use `LEFT JOIN` aggregates so students without practice remain visible.

Required selected fields:

```sql
scm.student_id,
u.display_name,
sp.student_no,
COUNT(DISTINCT ps.id) AS session_count,
COUNT(pa.id) AS answered_count,
SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
MAX(COALESCE(pa.answered_at, ps.started_at)) AS last_practiced_at
```

Use correlated subqueries or a second page-scoped query for `wrong_question_count` and `confused_question_count`; whichever is clearer must still filter active question banks by `course_id`.

- [ ] **Step 5: Run repository tests**

Run:

```powershell
go test ./internal/modules/analytics -run MySQL -count=1
```

Expected: PASS.

## Task 7: OpenAPI And Documentation

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Modify: `docs/README.md`
- Create: `docs/docs/26_stage2f_implementation_status.md`

- [ ] **Step 1: Update OpenAPI path**

Add the new analytics path next to existing analytics paths:

```yaml
  /analytics/class-practice-summary:
    get:
      tags: [Analytics]
      summary: 班级练题学习概览
      parameters:
        - in: query
          name: class_id
          required: true
          schema: { type: integer, format: int64 }
        - in: query
          name: course_id
          required: true
          schema: { type: integer, format: int64 }
        - in: query
          name: start_at
          required: false
          schema: { type: string, format: date-time }
        - in: query
          name: end_at
          required: false
          schema: { type: string, format: date-time }
        - in: query
          name: page
          required: false
          schema: { type: integer, default: 1 }
        - in: query
          name: page_size
          required: false
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        '200': { $ref: '#/components/responses/ClassPracticeSummaryOk' }
```

Add response:

```yaml
    ClassPracticeSummaryOk:
      description: 班级练题学习概览
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ClassPracticeSummaryResponse'
```

Add schemas for `ClassPracticeSummary`, `ClassPracticeStudentItem`, `ClassPracticeStudentPage`, `ClassPracticeSummaryResult`, and `ClassPracticeSummaryResponse`.

- [ ] **Step 2: Update OpenAPI design doc**

In `docs/docs/openapi_design_v1.md`, add a section for:

```text
GET /api/v1/analytics/class-practice-summary
```

Include:

1. Required `class_id` and `course_id`.
2. Default time range is recent 30 days.
3. Teacher scope comes from `teacher_class_course_assignments`.
4. Admin scope is current tenant.
5. Response example matching the stage 2F design document.

- [ ] **Step 3: Add stage status doc**

Create `docs/docs/26_stage2f_implementation_status.md`:

```markdown
# 阶段 2F 实施状态：老师侧班级学习页

日期：2026-04-22
状态：计划已完成，进入实现准备

## 1. 本阶段目标

阶段 2F 建设老师侧班级学习页最小闭环，覆盖班级课程练题概览、学生明细、老师任课范围校验、SDK、用户端页面和 OpenAPI。

## 2. 设计口径

1. 老师只能查看当前任课的 `class_id + course_id`。
2. 管理员可以查看当前租户范围内班级课程数据。
3. 默认统计最近 30 天，最大时间范围 366 天。
4. 阶段 2F 不新增统计表，直接基于现有练题明细表实时聚合。

## 3. 当前限制

1. 班级和课程选择先使用 ID 输入。
2. 不包含趋势图、导出、知识点分析和考试数据。
3. 不新增数据库 migration。

## 4. 验证要求

1. `go test -work ./...`
2. `pnpm test`
3. `pnpm typecheck`
4. `pnpm build`
5. OpenAPI YAML 解析检查
6. 编码、BOM、混合换行、异常引用标记和敏感明文扫描
```

- [ ] **Step 4: Update docs README**

Add `docs/docs/26_stage2f_implementation_status.md` to the reading order and catalog.

- [ ] **Step 5: Parse OpenAPI**

Use a non-`*_test.go` temp filename:

```powershell
$tempPath = 'D:\workspace\temp\openapi_parse_stage2f.go'
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
'@ | Set-Content -LiteralPath $tempPath -Encoding UTF8
go run -work $tempPath
Remove-Item -LiteralPath $tempPath -Force
```

Expected output:

```text
openapi_parse_ok
```

## Task 8: Full Verification And Commit

**Files:**
- All changed files

- [ ] **Step 1: Run backend tests**

Run:

```powershell
go test -work ./...
```

Expected: all packages PASS. If normal `go test ./...` fails only during Go temp cleanup with Windows `Access is denied`, rerun with `-work` and record the cleanup limitation in the final status.

- [ ] **Step 2: Run frontend checks**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected:

```text
Test files pass
Typecheck exits 0
Build exits 0
```

- [ ] **Step 3: Run formatting and safety checks**

Run:

```powershell
git diff --check
git diff --cached --check
rg -n "<initial-password>|<abnormal-citation-marker>" apps internal packages docs
```

Expected:

1. `git diff --check` exits 0.
2. `git diff --cached --check` exits 0 after staging.
3. `rg` finds no matches.

Run changed-file BOM and mixed-EOL check:

```powershell
$changed = git diff --name-only
$changed += git ls-files --others --exclude-standard
$changed = $changed | Where-Object { $_ -match '\.(go|ts|tsx|md|yaml|yml|json)$' }
$bom = @()
$mixed = @()
foreach ($path in $changed) {
  $full = Join-Path (Get-Location) $path
  if (Test-Path -LiteralPath $full) {
    $bytes = [System.IO.File]::ReadAllBytes($full)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $bom += $path }
    $text = [System.IO.File]::ReadAllText($full)
    if ($text.Contains("`r`n") -and ($text -replace "`r`n", '').Contains("`n")) { $mixed += $path }
  }
}
if ($bom.Count -gt 0) { $bom | ForEach-Object { Write-Output "bom: $_" } }
if ($mixed.Count -gt 0) { $mixed | ForEach-Object { Write-Output "mixed_eol: $_" } }
if ($bom.Count -gt 0 -or $mixed.Count -gt 0) { exit 1 }
Write-Output 'encoding_eol_ok_for_changed_files'
```

Expected:

```text
encoding_eol_ok_for_changed_files
```

- [ ] **Step 4: Stage and commit**

Run:

```powershell
git add cmd internal apps packages docs
git diff --cached --check
git commit -m "新增：完成阶段2f班级学习页"
```

Expected commit message:

```text
新增：完成阶段2f班级学习页
```

## Self-Review Checklist

- Spec coverage: backend API, authorization, time range, aggregation, SDK, frontend page, docs, OpenAPI, and verification are covered.
- Type consistency: `ClassPracticeSummaryQuery`, `ClassPracticeSummaryResult`, `ClassPracticeSummary`, and `ClassPracticeStudentItem` names are consistent across tasks.
- Scope control: no trend charts, no export, no knowledge point analytics, no exam analytics, no new statistics table.
- Safety: plan uses D workspace paths, Chinese commit message, UTF-8 text files, and explicit sensitive-string checks.

## Task 4: Server Wiring And RBAC Menu

**Files:**
- Modify: `cmd/server/main.go`
- Modify: `internal/modules/rbac/menu.go`
- Modify: `internal/modules/rbac/menu_service_test.go`

- [ ] **Step 1: Wire analytics handler**

In `cmd/server/main.go`, add import:

```go
"aios_practice_platform/internal/modules/analytics"
```

Create handler near other handlers:

```go
analyticsHandler := analytics.NewHandler(
	analytics.NewService(analytics.NewMySQLRepository(db)),
	issuer,
)
```

Register with API v1 routes:

```go
bootstrap.WithAPIV1Routes(analyticsHandler.RegisterRoutes),
```

- [ ] **Step 2: Add user menu item**

In `internal/modules/rbac/menu.go`, add to `userMenus` children:

```go
{id: 27, name: "班级学习", path: "/app/class-learning", requiredPermissions: []string{"analytics:view"}},
```

- [ ] **Step 3: Update menu tests**

In `internal/modules/rbac/menu_service_test.go`, assert:

```go
menus := BuildMenus("user", []string{"practice:use", "analytics:view"})
wantPaths := []string{
	"/app/courses",
	"/app/practice",
	"/app/practice/history",
	"/app/practice/wrong",
	"/app/practice/mastered",
	"/app/practice/confused",
	"/app/class-learning",
}
```

Add a test confirming “班级学习” is hidden without `analytics:view`.

- [ ] **Step 4: Run backend route/menu tests**

Run:

```powershell
go test ./cmd/server ./internal/modules/rbac ./internal/modules/analytics -count=1
```

Expected: PASS.

## Task 5: SDK Contract

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`

- [ ] **Step 1: Add SDK types and method**

Add to `client.ts`:

```ts
export interface ClassPracticeSummaryQuery {
  class_id: number;
  course_id: number;
  start_at?: string;
  end_at?: string;
  page?: number;
  page_size?: number;
}

export interface ClassPracticeSummary {
  class_id: number;
  class_name: string;
  course_id: number;
  course_name: string;
  student_count: number;
  participated_student_count: number;
  session_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
  wrong_question_count: number;
  confused_question_count: number;
  last_practiced_at?: string | null;
}

export interface ClassPracticeStudentItem {
  student_id: number;
  student_name: string;
  student_no?: string | null;
  session_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
  wrong_question_count: number;
  confused_question_count: number;
  last_practiced_at?: string | null;
}

export interface ClassPracticeSummaryResult {
  summary: ClassPracticeSummary;
  students: PageResult<ClassPracticeStudentItem>;
}
```

Add to `ApiClient`:

```ts
getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
```

Add implementation:

```ts
getClassPracticeSummary: (query) =>
  request(fetcher, options, buildPath("/analytics/class-practice-summary", query), { method: "GET" }),
```

- [ ] **Step 2: Add SDK test**

In `client.test.ts`, add a test named `queries class practice summary`. It should mock a response with `summary` and `students`, call:

```ts
await client.getClassPracticeSummary({
  class_id: 101,
  course_id: 12,
  start_at: "2026-04-01T00:00:00+08:00",
  end_at: "2026-04-22T23:59:59+08:00",
  page: 1,
  page_size: 20
});
```

Assert:

```ts
expect(result.summary.class_name).toBe("一班");
expect(result.students.items[0].student_name).toBe("张三");
expect(String(fetchMock.mock.calls[0][0])).toContain("/analytics/class-practice-summary?class_id=101&course_id=12");
expect(String(fetchMock.mock.calls[0][0])).toContain("start_at=2026-04-01T00%3A00%3A00%2B08%3A00");
```

- [ ] **Step 3: Run SDK tests**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: PASS.

## Task 6: User-Web Class Learning Page

**Files:**
- Create: `apps/user-web/src/class-learning-page.tsx`
- Create: `apps/user-web/src/class-learning-page.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Create page component and API interface**

Create `class-learning-page.tsx` with:

```tsx
import { useState } from "react";

import type { ClassPracticeSummaryQuery, ClassPracticeSummaryResult } from "@aios/api-sdk";

export interface ClassLearningApi {
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
}
```

Component state:

```tsx
const [classId, setClassId] = useState("");
const [courseId, setCourseId] = useState("");
const [startAt, setStartAt] = useState("");
const [endAt, setEndAt] = useState("");
const [result, setResult] = useState<ClassPracticeSummaryResult | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
```

Submit handler:

```tsx
async function handleSearch() {
  const classID = parsePositiveNumber(classId);
  const courseID = parsePositiveNumber(courseId);
  if (!classID || !courseID) {
    setError("请填写有效的班级ID和课程ID。");
    return;
  }
  setLoading(true);
  setError("");
  try {
    const data = await api.getClassPracticeSummary({
      class_id: classID,
      course_id: courseID,
      start_at: startAt || undefined,
      end_at: endAt || undefined,
      page: 1,
      page_size: 20
    });
    setResult(data);
  } catch (err) {
    setError(errorMessage(err));
  } finally {
    setLoading(false);
  }
}
```

Render labels exactly:

- `班级ID`
- `课程ID`
- `开始时间`
- `结束时间`
- `查询班级学习`
- `班级概览`
- `学生明细`

- [ ] **Step 2: Add page tests**

Create `class-learning-page.test.tsx` with tests:

```tsx
it("queries and renders class learning summary", async () => {
  const api = {
    getClassPracticeSummary: vi.fn().mockResolvedValue({
      summary: {
        class_id: 101,
        class_name: "一班",
        course_id: 12,
        course_name: "数学",
        student_count: 2,
        participated_student_count: 1,
        session_count: 2,
        answered_count: 5,
        correct_count: 4,
        wrong_count: 1,
        accuracy: 0.8,
        wrong_question_count: 1,
        confused_question_count: 1,
        last_practiced_at: "2026-04-22T19:30:00+08:00"
      },
      students: {
        items: [
          {
            student_id: 7001,
            student_name: "张三",
            student_no: "S001",
            session_count: 2,
            answered_count: 5,
            correct_count: 4,
            wrong_count: 1,
            accuracy: 0.8,
            wrong_question_count: 1,
            confused_question_count: 1
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }
    })
  };
  render(<ClassLearningPage api={api} />);
  fireEvent.change(screen.getByLabelText("班级ID"), { target: { value: "101" } });
  fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));
  await waitFor(() => expect(api.getClassPracticeSummary).toHaveBeenCalled());
  expect(screen.getByText("一班 / 数学")).toBeTruthy();
  expect(screen.getByText("张三")).toBeTruthy();
});
```

Also add tests named:

```tsx
it("shows an empty state when there are no students")
it("shows permission error when api returns 403")
it("validates class and course ids before querying")
```

- [ ] **Step 3: Wire page into app**

Modify `apps/user-web/src/app.tsx`:

1. Import `ClassLearningPage` and `ClassLearningApi`.
2. Update `UserAppProps` so `practiceApi` can also satisfy `ClassLearningApi`.
3. Add nav button:

```tsx
<button type="button" onClick={() => setSelectedPath("/app/class-learning")}>
  班级学习
</button>
```

4. Add route:

```tsx
{selectedPath === "/app/class-learning" && currentPracticeApi ? (
  <ClassLearningPage api={currentPracticeApi} />
) : null}
```

- [ ] **Step 4: Update app tests**

In `app.test.tsx`, add a mocked `getClassPracticeSummary` to objects passed as `practiceApi`.

Add test:

```tsx
it("opens class learning page from the learner shell", async () => {
  render(<UserApp practiceApi={createPracticeApiForTest()} />);
  fireEvent.click(screen.getByRole("button", { name: "班级学习" }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "班级学习" })).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run user-web tests**

Run:

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
```

Expected: PASS.
