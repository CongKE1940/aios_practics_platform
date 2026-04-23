# 阶段 2F 老师侧班级学习页 实施计划

> **面向代理执行者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步执行本计划。所有步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 构建阶段 2F 老师侧班级学习闭环，包括受保护的 analytics API、SDK 方法、用户端老师页面、OpenAPI 契约与状态文档。

**实现架构：** 按现有模块风格新增后端 `internal/modules/analytics` 模块，包含 model/service/handler/MySQL repository 分层。API 基于现有练题表实时聚合，并通过 `teacher_class_course_assignments` 强制校验老师任课范围；前端通过聚焦的 `ClassLearningPage` 组件消费 SDK。

**技术栈：** Go, Gin, database/sql, MySQL 8, sqlmock, React 18, TypeScript, Vite, Vitest, OpenAPI 3.0 YAML.

---

## 文件清单

- 新建：`internal/modules/analytics/model.go`，用于承载 analytics 模型、查询结构、仓储接口、错误定义与分页辅助函数。
- 新建：`internal/modules/analytics/service.go`，用于处理校验、时间范围归一化、鉴权与编排。
- 新建：`internal/modules/analytics/handler.go`，用于处理 JWT 解析、`analytics:view` 权限校验、查询解析与 JSON 响应。
- 新建：`internal/modules/analytics/mysql_repository.go`，用于处理 MySQL 存在性、任课关系与聚合查询。
- 新建：`internal/modules/analytics/handler_test.go`，用于承载基于内存仓储的 service/handler 测试。
- 新建：`internal/modules/analytics/mysql_repository_test.go`，用于承载围绕租户与任课过滤条件的 sqlmock 检查。
- 修改：`cmd/server/main.go`，将 analytics handler 挂接到 `/api/v1`。
- 修改：`internal/modules/rbac/menu.go` 与 `internal/modules/rbac/menu_service_test.go`，补充用户端“班级学习”菜单。
- 修改：`packages/api-sdk/src/client.ts` 与 `packages/api-sdk/src/client.test.ts`，补充 analytics 类型与 `getClassPracticeSummary`。
- 新建：`apps/user-web/src/class-learning-page.tsx`，用于老师侧班级学习页。
- 新建：`apps/user-web/src/class-learning-page.test.tsx`，用于 UI 行为测试。
- 修改：`apps/user-web/src/app.tsx` 与 `apps/user-web/src/app.test.tsx`，将页面注册到用户端壳层。
- 修改：`docs/api/openapi.yaml`、`docs/docs/openapi_design_v1.md` 与 `docs/README.md`。
- 新建：`docs/docs/26_stage2f_implementation_status.md`.

## 共享后端类型

以下命名需在后端、SDK、OpenAPI 和前端之间保持一致：

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

仓储契约：

```go
type Repository interface {
	ClassCourseExists(ctx context.Context, tenantID int64, classID int64, courseID int64) (bool, error)
	TeacherCanViewClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error)
	GetClassPracticeSummary(ctx context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error)
	ListClassPracticeStudents(ctx context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error)
}
```

错误常量：

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

## 任务 1： 后端统计红测与模型

**涉及文件：**
- 新建：`internal/modules/analytics/model.go`
- 新建：`internal/modules/analytics/service.go`
- 新建：`internal/modules/analytics/handler.go`
- 新建：`internal/modules/analytics/handler_test.go`

- [ ] **步骤 1： 补充模型定义**

创建 `internal/modules/analytics/model.go`，写入上面的共享后端类型。同时补充 `normalizePage`、`normalizePageSize` 与 `pageOf` 辅助函数，风格参考 `internal/modules/practice/model.go`，最大页大小为 100。

- [ ] **步骤 2： 补充 service 骨架**

创建 `internal/modules/analytics/service.go`：

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

- [ ] **步骤 3： 补充 handler 骨架**

创建 `internal/modules/analytics/handler.go`，包含与 practice 保持一致的 `TokenParser` 接口、`NewHandler` 以及路由注册：

```go
func (handler *Handler) RegisterRoutes(router gin.IRouter) {
	router.GET("/analytics/class-practice-summary", handler.getClassPracticeSummary)
}
```

在这一步红测中，完成鉴权辅助函数桩后，`getClassPracticeSummary` 可以先返回 `501`，并使用 `response.Failure(50000, "服务异常", requestID)`。

- [ ] **步骤 4： 编写失败的 handler/service 测试**

创建 `internal/modules/analytics/handler_test.go`，加入以下测试：

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

成功路径的预期断言：

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

- [ ] **步骤 5： 运行红测**

执行：

```powershell
go test ./internal/modules/analytics -run TestHandler_TeacherClassPracticeSummaryReturnsOverviewAndStudents -count=1
```

预期： FAIL because service and handler skeletons do not yet implement the behavior.

## 任务 2： 后端统计实现

**涉及文件：**
- 修改：`internal/modules/analytics/service.go`
- 修改：`internal/modules/analytics/handler.go`
- 修改：`internal/modules/analytics/handler_test.go`

- [ ] **步骤 1： 实现时间范围归一化**

在 `service.go` 中添加：

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

- [ ] **步骤 2： 实现 service 校验与鉴权**

实现 `GetClassPracticeSummary`：

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

`TenantID` 放在 `ClassPracticeSummaryQuery` 中，以便仓储方法始终显式保留租户过滤条件。

- [ ] **步骤 3： 实现 handler 鉴权与解析**

在 `handler.go` 中实现：

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

解析规则：

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

在 `parseOptionalTime` 中使用 `time.Parse(time.RFC3339, value)`。

- [ ] **步骤 4： 实现 handler 错误映射**

使用：

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

- [ ] **步骤 5： 运行 analytics 测试**

执行：

```powershell
go test ./internal/modules/analytics -count=1
```

预期： PASS for handler/service tests using the memory repository.

## 任务 3： MySQL 统计仓储

**涉及文件：**
- 新建：`internal/modules/analytics/mysql_repository.go`
- 新建：`internal/modules/analytics/mysql_repository_test.go`

- [ ] **步骤 1： 编写 sqlmock 测试**

创建 `mysql_repository_test.go`，加入：

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

- [ ] **步骤 2： 实现仓储骨架与存在性方法**

创建 `mysql_repository.go`：

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

按步骤 1 中的查询实现 `TeacherCanViewClassCourse`，并将 `sql.ErrNoRows` 映射为 `false, nil`。

- [ ] **步骤 3： 实现汇总聚合**

使用三个聚焦查询来实现 `GetClassPracticeSummary`：

1. Class/course names and student count.
2. Session and answer aggregates from `practice_sessions`, `practice_session_questions`, and `practice_answers`.
3. Wrong/confused question counts from `user_question_states` filtered by active question banks for the course.

练题会话与答题查询必须限制为：

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

扫描后计算：

```go
summary.Accuracy = ratio(summary.CorrectCount, summary.AnsweredCount)
```

实现：

```go
func ratio(part int, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(part) / float64(total)
}
```

- [ ] **步骤 4： 实现学生分页与指标**

分两步实现 `ListClassPracticeStudents`：

1. Count all current active class students.
2. Query page rows ordered by `u.display_name ASC, scm.student_id ASC`.

行查询必须从 `student_class_memberships` 出发，并使用 `LEFT JOIN` 聚合，以保证没有练题记录的学生仍然可见。

必须查询出的字段：

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

对于 `wrong_question_count` 和 `confused_question_count`，可以使用相关子查询或第二个分页范围查询；无论采用哪种方式，都必须继续按 `course_id` 过滤有效题库。

- [ ] **步骤 5： 运行仓储测试**

执行：

```powershell
go test ./internal/modules/analytics -run MySQL -count=1
```

预期： PASS.

## 任务 7： OpenAPI 与文档

**涉及文件：**
- 修改：`docs/api/openapi.yaml`
- 修改：`docs/docs/openapi_design_v1.md`
- 修改：`docs/README.md`
- 新建：`docs/docs/26_stage2f_implementation_status.md`

- [ ] **步骤 1： 更新 OpenAPI path**

在现有 analytics 路径旁新增以下接口：

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

新增响应定义：

```yaml
    ClassPracticeSummaryOk:
      description: 班级练题学习概览
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ClassPracticeSummaryResponse'
```

补充 `ClassPracticeSummary`、`ClassPracticeStudentItem`、`ClassPracticeStudentPage`、`ClassPracticeSummaryResult` 与 `ClassPracticeSummaryResponse` 的 schema。

- [ ] **步骤 2： 更新 OpenAPI design doc**

在 `docs/docs/openapi_design_v1.md` 中新增如下小节：

```text
GET /api/v1/analytics/class-practice-summary
```

内容包括：

1. Required `class_id` and `course_id`.
2. Default time range is recent 30 days.
3. Teacher scope comes from `teacher_class_course_assignments`.
4. Admin scope is current tenant.
5. Response example matching the stage 2F design document.

- [ ] **步骤 3： 新增阶段状态文档**

创建 `docs/docs/26_stage2f_implementation_status.md`：

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

- [ ] **步骤 4： 更新 docs README**

将 `docs/docs/26_stage2f_implementation_status.md` 加入阅读顺序与目录说明。

- [ ] **步骤 5： 解析 OpenAPI**

使用一个非 `*_test.go` 的临时文件名：

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

预期输出：

```text
openapi_parse_ok
```

## 任务 8： 全量验证与提交

**涉及文件：**
- 所有已变更文件

- [ ] **步骤 1： 运行后端测试**

执行：

```powershell
go test -work ./...
```

预期： all packages PASS. If normal `go test ./...` fails only during Go temp cleanup with Windows `Access is denied`, rerun with `-work` and record the cleanup limitation in the final status.

- [ ] **步骤 2： 运行前端检查**

执行：

```powershell
pnpm test
pnpm typecheck
pnpm build
```

预期：

```text
Test files pass
Typecheck exits 0
Build exits 0
```

- [ ] **步骤 3： 运行格式与安全检查**

执行：

```powershell
git diff --check
git diff --cached --check
rg -n "<initial-password>|<abnormal-citation-marker>" apps internal packages docs
```

预期：

1. `git diff --check` 退出码为 0。
2. `git diff --cached --check` 在暂存后退出码为 0。
3. `rg` 不应匹配到任何结果。

对变更文件运行 BOM 与混合换行检查：

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

预期：

```text
encoding_eol_ok_for_changed_files
```

- [ ] **步骤 4： 暂存并提交**

执行：

```powershell
git add cmd internal apps packages docs
git diff --cached --check
git commit -m "新增：完成阶段2f班级学习页"
```

预期提交信息：

```text
新增：完成阶段2f班级学习页
```

## 自检清单

- 规格覆盖： backend API, authorization, time range, aggregation, SDK, frontend page, docs, OpenAPI, and verification are covered.
- 类型一致性： `ClassPracticeSummaryQuery`, `ClassPracticeSummaryResult`, `ClassPracticeSummary`, and `ClassPracticeStudentItem` names are consistent across tasks.
- 范围控制： no trend charts, no export, no knowledge point analytics, no exam analytics, no new statistics table.
- 安全性： plan uses D workspace paths, Chinese commit message, UTF-8 text files, and explicit sensitive-string checks.

## 任务 4： 服务接线与 RBAC 菜单

**涉及文件：**
- 修改：`cmd/server/main.go`
- 修改：`internal/modules/rbac/menu.go`
- 修改：`internal/modules/rbac/menu_service_test.go`

- [ ] **步骤 1： 挂接 analytics handler**

在 `cmd/server/main.go` 中新增 import：

```go
"aios_practice_platform/internal/modules/analytics"
```

在其他 handler 附近创建：

```go
analyticsHandler := analytics.NewHandler(
	analytics.NewService(analytics.NewMySQLRepository(db)),
	issuer,
)
```

注册到 API v1 路由：

```go
bootstrap.WithAPIV1Routes(analyticsHandler.RegisterRoutes),
```

- [ ] **步骤 2： 新增用户菜单项**

在 `internal/modules/rbac/menu.go` 中，向 `userMenus` 的 children 追加：

```go
{id: 27, name: "班级学习", path: "/app/class-learning", requiredPermissions: []string{"analytics:view"}},
```

- [ ] **步骤 3： 更新菜单测试**

在 `internal/modules/rbac/menu_service_test.go` 中断言：

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

再补一个测试，确认缺少 `analytics:view` 时“班级学习”菜单会被隐藏。

- [ ] **步骤 4： 运行后端路由与菜单测试**

执行：

```powershell
go test ./cmd/server ./internal/modules/rbac ./internal/modules/analytics -count=1
```

预期： PASS.

## 任务 5： SDK Contract

**涉及文件：**
- 修改：`packages/api-sdk/src/client.ts`
- 修改：`packages/api-sdk/src/client.test.ts`

- [ ] **步骤 1： 新增 SDK 类型与方法**

向 `client.ts` 中添加：

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

- [ ] **步骤 2： 新增 SDK 测试**

在 `client.test.ts` 中新增一个名为 `queries class practice summary` 的测试。它应 mock 一个带 `summary` 和 `students` 的响应，并调用：

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

断言：

```ts
expect(result.summary.class_name).toBe("一班");
expect(result.students.items[0].student_name).toBe("张三");
expect(String(fetchMock.mock.calls[0][0])).toContain("/analytics/class-practice-summary?class_id=101&course_id=12");
expect(String(fetchMock.mock.calls[0][0])).toContain("start_at=2026-04-01T00%3A00%3A00%2B08%3A00");
```

- [ ] **步骤 3： 运行 SDK 测试**

执行：

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

预期： PASS.

## 任务 6： 用户端班级学习页

**涉及文件：**
- 新建：`apps/user-web/src/class-learning-page.tsx`
- 新建：`apps/user-web/src/class-learning-page.test.tsx`
- 修改：`apps/user-web/src/app.tsx`
- 修改：`apps/user-web/src/app.test.tsx`

- [ ] **步骤 1： 创建页面组件与 API 接口**

创建 `class-learning-page.tsx`，内容如下：

```tsx
import { useState } from "react";

import type { ClassPracticeSummaryQuery, ClassPracticeSummaryResult } from "@aios/api-sdk";

export interface ClassLearningApi {
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
}
```

组件状态：

```tsx
const [classId, setClassId] = useState("");
const [courseId, setCourseId] = useState("");
const [startAt, setStartAt] = useState("");
const [endAt, setEndAt] = useState("");
const [result, setResult] = useState<ClassPracticeSummaryResult | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
```

提交处理函数：

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

渲染时标签名称必须完全一致：

- `班级ID`
- `课程ID`
- `开始时间`
- `结束时间`
- `查询班级学习`
- `班级概览`
- `学生明细`

- [ ] **步骤 2： 新增页面测试**

创建 `class-learning-page.test.tsx`，加入以下测试：

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

- [ ] **步骤 3： 将页面接入应用**

修改 `apps/user-web/src/app.tsx`：

1. 引入 `ClassLearningPage` 与 `ClassLearningApi`。
2. 更新 `UserAppProps`，使 `practiceApi` 也能满足 `ClassLearningApi`。
3. 新增导航按钮：

```tsx
<button type="button" onClick={() => setSelectedPath("/app/class-learning")}>
  班级学习
</button>
```

4. 新增路由：

```tsx
{selectedPath === "/app/class-learning" && currentPracticeApi ? (
  <ClassLearningPage api={currentPracticeApi} />
) : null}
```

- [ ] **步骤 4： 更新应用测试**

在 `app.test.tsx` 中，为传入的 `practiceApi` 对象补充一个 mock 的 `getClassPracticeSummary`。

新增测试：

```tsx
it("opens class learning page from the learner shell", async () => {
  render(<UserApp practiceApi={createPracticeApiForTest()} />);
  fireEvent.click(screen.getByRole("button", { name: "班级学习" }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "班级学习" })).toBeTruthy();
  });
});
```

- [ ] **步骤 5： 运行 user-web 测试**

执行：

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
```

预期： PASS.
