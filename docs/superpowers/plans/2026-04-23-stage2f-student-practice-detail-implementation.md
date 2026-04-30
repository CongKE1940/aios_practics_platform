# 阶段 2F 老师侧学生学习详情页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为老师侧班级学习页补齐学生学习详情下钻能力，让老师可以在当前班级课程范围内查看单个学生的概览、练题记录、错题和疑惑题。

**Architecture:** 延续现有 `internal/modules/analytics` 模块，在后端新增 `student-practice-detail` 正式接口，并复用当前班级学习页的权限和时间范围口径。前端在 `apps/user-web` 中新增学生详情页组件与路径分发，从班级学习页把 `class_id / course_id / student_user_id / tab` 作为上下文带入，实现标签页切换、返回班级学习页和空态/错误态处理。

**Tech Stack:** Go, Gin, database/sql, MySQL 8, sqlmock, React 18, TypeScript, Vite, Vitest, Testing Library, OpenAPI 3.0 YAML.

---

## 文件清单

- 修改：`internal/modules/analytics/model.go`，新增学生详情查询、汇总和分页结果类型。
- 修改：`internal/modules/analytics/service.go`，新增老师侧学生详情服务方法，复用时间范围与权限校验。
- 修改：`internal/modules/analytics/handler.go`，注册并实现 `GET /analytics/student-practice-detail`。
- 修改：`internal/modules/analytics/handler_test.go`，补齐接口成功、越权、学生不在班级和标签切换测试。
- 修改：`internal/modules/analytics/mysql_repository.go`，新增学生班级归属、学生概览、练题记录、错题和疑惑题查询。
- 修改：`internal/modules/analytics/mysql_repository_test.go`，补齐 sqlmock 测试，覆盖老师权限口径、分页和三种标签页查询。
- 修改：`packages/api-sdk/src/client.ts`，新增学生详情查询方法与类型定义。
- 修改：`packages/api-sdk/src/client.test.ts`，补齐 SDK 请求路径、查询参数和响应解析测试。
- 修改：`apps/user-web/src/class-learning-page.tsx`，增加学生详情跳转入口。
- 新增：`apps/user-web/src/student-learning-detail-page.tsx`，实现学生详情页、标签页和返回操作。
- 新增：`apps/user-web/src/student-learning-detail-page.test.tsx`，覆盖详情页加载、标签切换、错误态和返回行为。
- 修改：`apps/user-web/src/app.tsx`，注册新页面路径并解析查询参数。
- 修改：`apps/user-web/src/app.test.tsx`，补齐壳层路由切换与详情页入口集成测试。
- 修改：`docs/api/openapi.yaml`，新增 `GET /analytics/student-practice-detail` 正式契约。
- 修改：`docs/docs/openapi_design_v1.md`，补充老师侧学生学习详情接口说明。
- 修改：`docs/docs/26_stage2f_implementation_status.md`，记录学生详情页已落地能力与当前限制。

## 共享命名

后端核心命名：

```go
type StudentPracticeDetailQuery struct {
	TenantID      int64
	ClassID       int64
	CourseID      int64
	StudentUserID int64
	Tab           string
	StartAt       *time.Time
	EndAt         *time.Time
	Page          int
	PageSize      int
}

type StudentPracticeSummary struct {
	StudentUserID         int64      `json:"student_user_id"`
	StudentName           string     `json:"student_name"`
	StudentNo             *string    `json:"student_no,omitempty"`
	ClassID               int64      `json:"class_id"`
	ClassName             string     `json:"class_name"`
	CourseID              int64      `json:"course_id"`
	CourseName            string     `json:"course_name"`
	SessionCount          int        `json:"session_count"`
	AnsweredCount         int        `json:"answered_count"`
	CorrectCount          int        `json:"correct_count"`
	WrongCount            int        `json:"wrong_count"`
	Accuracy              float64    `json:"accuracy"`
	WrongQuestionCount    int        `json:"wrong_question_count"`
	ConfusedQuestionCount int        `json:"confused_question_count"`
	LastPracticedAt       *time.Time `json:"last_practiced_at,omitempty"`
}

type StudentPracticeSessionItem struct {
	SessionID     int64      `json:"session_id"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
	Status        string     `json:"status"`
	TotalCount    int        `json:"total_count"`
	AnsweredCount int        `json:"answered_count"`
	CorrectCount  int        `json:"correct_count"`
	WrongCount    int        `json:"wrong_count"`
	Accuracy      float64    `json:"accuracy"`
}

type StudentPracticeQuestionItem struct {
	QuestionID         int64      `json:"question_id"`
	QuestionVersionID  int64      `json:"question_version_id"`
	QuestionType       string     `json:"question_type"`
	Stem               string     `json:"stem"`
	PracticeWrongCount int        `json:"practice_wrong_count"`
	LastWrongAt        *time.Time `json:"last_wrong_at,omitempty"`
	IsConfused         bool       `json:"is_confused"`
	ConfusedAt         *time.Time `json:"confused_at,omitempty"`
	LastResult         string     `json:"last_result"`
}

type StudentPracticeDetailResult struct {
	StudentSummary    StudentPracticeSummary                  `json:"student_summary"`
	ActiveTab         string                                  `json:"active_tab"`
	Sessions          PageResult[StudentPracticeSessionItem]  `json:"sessions"`
	WrongQuestions    PageResult[StudentPracticeQuestionItem] `json:"wrong_questions"`
	ConfusedQuestions PageResult[StudentPracticeQuestionItem] `json:"confused_questions"`
}
```

允许的标签页常量：

```go
const (
	StudentDetailTabSessions = "sessions"
	StudentDetailTabWrong    = "wrong"
	StudentDetailTabConfused = "confused"
)
```

前端 SDK 命名：

```ts
export type StudentPracticeDetailTab = "sessions" | "wrong" | "confused";

export interface StudentPracticeDetailQuery {
  class_id: number;
  course_id: number;
  student_user_id: number;
  tab?: StudentPracticeDetailTab;
  start_at?: string;
  end_at?: string;
  page?: number;
  page_size?: number;
}
```

## 任务 1： 后端学生详情接口红绿测试

**Files:**
- Modify: `internal/modules/analytics/model.go`
- Modify: `internal/modules/analytics/service.go`
- Modify: `internal/modules/analytics/handler.go`
- Modify: `internal/modules/analytics/handler_test.go`

- [ ] **Step 1: Write the failing tests**

向 `internal/modules/analytics/handler_test.go` 新增以下测试：

```go
func TestHandler_GetStudentPracticeDetailSessions(t *testing.T)
func TestHandler_GetStudentPracticeDetailWrongTab(t *testing.T)
func TestHandler_GetStudentPracticeDetailConfusedTab(t *testing.T)
func TestHandler_GetStudentPracticeDetailRejectsTeacherWithoutAssignment(t *testing.T)
func TestHandler_GetStudentPracticeDetailRejectsStudentOutsideClass(t *testing.T)
func TestHandler_GetStudentPracticeDetailRejectsInvalidTab(t *testing.T)
```

成功路径测试中的请求可写成：

```go
rec := performAnalyticsRequest(
	router,
	http.MethodGet,
	"/api/v1/analytics/student-practice-detail?class_id=301&course_id=10&student_user_id=501&tab=sessions&page=1&page_size=20",
	nil,
	"token",
)
if rec.Code != http.StatusOK {
	t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
}
var body analyticsEnvelope[StudentPracticeDetailResult]
decodeAnalyticsBody(t, rec, &body)
if body.Data.ActiveTab != StudentDetailTabSessions {
	t.Fatalf("active_tab = %s", body.Data.ActiveTab)
}
if body.Data.StudentSummary.StudentUserID != 501 {
	t.Fatalf("student_user_id = %d", body.Data.StudentSummary.StudentUserID)
}
```

服务测试中的内存仓储需要至少具备如下字段：

```go
type memoryRepository struct {
	classCourseExists bool
	teacherAllowed    bool
	studentInClass    bool
	detailSummary     StudentPracticeSummary
	detailSessions    PageResult[StudentPracticeSessionItem]
	detailWrong       PageResult[StudentPracticeQuestionItem]
	detailConfused    PageResult[StudentPracticeQuestionItem]
	lastDetailQuery   StudentPracticeDetailQuery
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
go test ./internal/modules/analytics -run "StudentPracticeDetail" -count=1
```

Expected: FAIL，提示缺少 `StudentPracticeDetailQuery`、接口路由或服务方法。

- [ ] **Step 3: Write minimal implementation**

在 `internal/modules/analytics/model.go` 中新增学生详情相关类型，并扩展仓储接口：

```go
type Repository interface {
	ClassCourseExists(ctx context.Context, tenantID int64, classID int64, courseID int64) (bool, error)
	TeacherCanViewClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error)
	StudentBelongsToClass(ctx context.Context, tenantID int64, classID int64, studentUserID int64) (bool, error)
	GetClassPracticeSummary(ctx context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error)
	ListClassPracticeStudents(ctx context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error)
	ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
	GetStudentPracticeSummary(ctx context.Context, query StudentPracticeDetailQuery) (StudentPracticeSummary, error)
	ListStudentPracticeSessions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeSessionItem], error)
	ListStudentWrongQuestions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error)
	ListStudentConfusedQuestions(ctx context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error)
}
```

在 `internal/modules/analytics/service.go` 中新增：

```go
func (service *Service) GetStudentPracticeDetail(ctx context.Context, scope Scope, query StudentPracticeDetailQuery) (StudentPracticeDetailResult, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return StudentPracticeDetailResult{}, ErrForbidden
	}
	if query.ClassID <= 0 || query.CourseID <= 0 || query.StudentUserID <= 0 {
		return StudentPracticeDetailResult{}, ErrInvalidInput
	}
	if query.Tab == "" {
		query.Tab = StudentDetailTabSessions
	}
	switch query.Tab {
	case StudentDetailTabSessions, StudentDetailTabWrong, StudentDetailTabConfused:
	default:
		return StudentPracticeDetailResult{}, ErrInvalidInput
	}
	query.TenantID = scope.TenantID
	query.Page = normalizePage(query.Page)
	query.PageSize = normalizePageSize(query.PageSize)

	now := service.now
	if now == nil {
		now = time.Now
	}
	startAt, endAt, err := normalizeTimeRange(now(), query.StartAt, query.EndAt)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}
	query.StartAt = &startAt
	query.EndAt = &endAt

	exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}
	if !exists {
		return StudentPracticeDetailResult{}, ErrNotFound
	}

	switch scope.UserType {
	case "sys_admin", "school_admin":
	case "teacher":
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, query.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeDetailResult{}, err
		}
		if !allowed {
			return StudentPracticeDetailResult{}, ErrForbidden
		}
	default:
		return StudentPracticeDetailResult{}, ErrForbidden
	}

	inClass, err := service.repo.StudentBelongsToClass(ctx, query.TenantID, query.ClassID, query.StudentUserID)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}
	if !inClass {
		return StudentPracticeDetailResult{}, ErrNotFound
	}

	summary, err := service.repo.GetStudentPracticeSummary(ctx, query)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}

	result := StudentPracticeDetailResult{
		StudentSummary:    summary,
		ActiveTab:         query.Tab,
		Sessions:          PageResult[StudentPracticeSessionItem]{Items: []StudentPracticeSessionItem{}, Page: query.Page, PageSize: query.PageSize, Total: 0},
		WrongQuestions:    PageResult[StudentPracticeQuestionItem]{Items: []StudentPracticeQuestionItem{}, Page: query.Page, PageSize: query.PageSize, Total: 0},
		ConfusedQuestions: PageResult[StudentPracticeQuestionItem]{Items: []StudentPracticeQuestionItem{}, Page: query.Page, PageSize: query.PageSize, Total: 0},
	}

	switch query.Tab {
	case StudentDetailTabSessions:
		result.Sessions, err = service.repo.ListStudentPracticeSessions(ctx, query)
	case StudentDetailTabWrong:
		result.WrongQuestions, err = service.repo.ListStudentWrongQuestions(ctx, query)
	case StudentDetailTabConfused:
		result.ConfusedQuestions, err = service.repo.ListStudentConfusedQuestions(ctx, query)
	}
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}
	return result, nil
}
```

在 `internal/modules/analytics/handler.go` 中注册路由并实现：

```go
router.GET("/analytics/student-practice-detail", handler.getStudentPracticeDetail)
```

```go
func (handler *Handler) getStudentPracticeDetail(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}

	classID, ok := parsePositiveInt64(ctx.Query("class_id"))
	if !ok {
		writeAnalyticsError(ctx, ErrInvalidInput)
		return
	}
	courseID, ok := parsePositiveInt64(ctx.Query("course_id"))
	if !ok {
		writeAnalyticsError(ctx, ErrInvalidInput)
		return
	}
	studentUserID, ok := parsePositiveInt64(ctx.Query("student_user_id"))
	if !ok {
		writeAnalyticsError(ctx, ErrInvalidInput)
		return
	}

	result, err := handler.service.GetStudentPracticeDetail(ctx.Request.Context(), scope, StudentPracticeDetailQuery{
		ClassID:       classID,
		CourseID:      courseID,
		StudentUserID: studentUserID,
		Tab:           ctx.Query("tab"),
		StartAt:       parseOptionalTime(ctx.Query("start_at")),
		EndAt:         parseOptionalTime(ctx.Query("end_at")),
		Page:          parsePage(ctx.Query("page")),
		PageSize:      parsePageSize(ctx.Query("page_size")),
	})
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}

	ctx.JSON(http.StatusOK, response.Success(result, requestID(ctx)))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
go test ./internal/modules/analytics -run "StudentPracticeDetail" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/modules/analytics/model.go internal/modules/analytics/service.go internal/modules/analytics/handler.go internal/modules/analytics/handler_test.go
git commit -m "新增：补齐老师侧学生学习详情接口骨架"
```

## 任务 2： MySQL 仓储查询与分页测试

**Files:**
- Modify: `internal/modules/analytics/mysql_repository.go`
- Modify: `internal/modules/analytics/mysql_repository_test.go`

- [ ] **Step 1: Write the failing repository tests**

向 `internal/modules/analytics/mysql_repository_test.go` 新增：

```go
func TestMySQLRepositoryStudentBelongsToClassUsesCurrentMembership(t *testing.T)
func TestMySQLRepositoryGetStudentPracticeSummary(t *testing.T)
func TestMySQLRepositoryListStudentPracticeSessions(t *testing.T)
func TestMySQLRepositoryListStudentWrongQuestions(t *testing.T)
func TestMySQLRepositoryListStudentConfusedQuestions(t *testing.T)
```

学生班级归属查询期望 SQL：

```go
mock.ExpectQuery(`(?s)SELECT\s+1\s+FROM student_class_memberships`).
	WithArgs(int64(1), int64(301), int64(501)).
	WillReturnRows(sqlmock.NewRows([]string{"1"}).AddRow(1))
```

练题记录列表断言可写成：

```go
result, err := repo.ListStudentPracticeSessions(context.Background(), StudentPracticeDetailQuery{
	TenantID:      1,
	ClassID:       301,
	CourseID:      10,
	StudentUserID: 501,
	Tab:           StudentDetailTabSessions,
	Page:          1,
	PageSize:      20,
})
if err != nil {
	t.Fatalf("ListStudentPracticeSessions error = %v", err)
}
if len(result.Items) != 1 || result.Items[0].SessionID != 9001 {
	t.Fatalf("items = %+v", result.Items)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
go test ./internal/modules/analytics -run "StudentBelongsToClass|StudentPracticeSummary|StudentPracticeSessions|StudentPracticeWrong|StudentPracticeConfused" -count=1
```

Expected: FAIL，仓储方法尚未存在。

- [ ] **Step 3: Write minimal repository implementation**

在 `internal/modules/analytics/mysql_repository.go` 中新增班级归属判断：

```go
func (repo *MySQLRepository) StudentBelongsToClass(ctx context.Context, tenantID int64, classID int64, studentUserID int64) (bool, error) {
	row := repo.db.QueryRowContext(ctx, `
SELECT 1
FROM student_class_memberships scm
WHERE scm.tenant_id = ?
  AND scm.class_id = ?
  AND scm.student_user_id = ?
  AND scm.membership_status = 'current'
LIMIT 1
`, tenantID, classID, studentUserID)
	var exists int
	if err := row.Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
```

学生概览查询保持与班级汇总一致的口径，示例骨架：

```go
func (repo *MySQLRepository) GetStudentPracticeSummary(ctx context.Context, query StudentPracticeDetailQuery) (StudentPracticeSummary, error) {
	row := repo.db.QueryRowContext(ctx, `
SELECT
  u.id AS student_user_id,
  u.display_name AS student_name,
  u.user_no AS student_no,
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name,
  COUNT(DISTINCT ps.id) AS session_count,
  COALESCE(SUM(pa.answered_count), 0) AS answered_count,
  COALESCE(SUM(pa.correct_count), 0) AS correct_count,
  COALESCE(SUM(pa.wrong_count), 0) AS wrong_count,
  COUNT(DISTINCT CASE WHEN uqs.practice_wrong_count > 0 THEN uqs.question_id END) AS wrong_question_count,
  COUNT(DISTINCT CASE WHEN uqs.is_confused = 1 THEN uqs.question_id END) AS confused_question_count,
  MAX(ps.started_at) AS last_practiced_at
FROM users u
JOIN classes c ON c.id = ?
JOIN courses co ON co.id = ?
LEFT JOIN practice_sessions ps ON ps.tenant_id = ? AND ps.user_id = u.id AND ps.class_id = c.id AND ps.course_id = co.id AND ps.started_at BETWEEN ? AND ?
LEFT JOIN (
  SELECT session_id,
         COUNT(*) AS answered_count,
         SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
         SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count
  FROM practice_answers
  WHERE answered_at BETWEEN ? AND ?
  GROUP BY session_id
) pa ON pa.session_id = ps.id
LEFT JOIN user_question_states uqs ON uqs.tenant_id = ? AND uqs.user_id = u.id
WHERE u.tenant_id = ? AND u.id = ?
GROUP BY u.id, u.display_name, u.user_no, c.id, c.name, co.id, co.name
`, query.ClassID, query.CourseID, query.TenantID, *query.StartAt, *query.EndAt, *query.StartAt, *query.EndAt, query.TenantID, query.TenantID, query.StudentUserID)
```

列表查询遵循“只查当前标签页”的设计，练题记录、错题和疑惑题分别实现，注意：

1. 都要带 `tenant_id + class_id + course_id + student_user_id` 过滤。
2. 错题列表只取 `practice_wrong_count > 0`。
3. 疑惑题列表只取 `is_confused = 1`。
4. `stem` 直接取题目版本快照里的摘要字段或现有题目内容字段，按当前仓储已有模式实现。
5. 分页返回需要补 `COUNT(*)` 总数查询，保持 `PageResult` 一致。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
go test ./internal/modules/analytics -run "StudentBelongsToClass|StudentPracticeSummary|StudentPracticeSessions|StudentPracticeWrong|StudentPracticeConfused" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/modules/analytics/mysql_repository.go internal/modules/analytics/mysql_repository_test.go
git commit -m "新增：支持老师侧学生学习详情仓储查询"
```

## 任务 3： SDK 与 OpenAPI 契约红绿测试

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`

- [ ] **Step 1: Write the failing SDK test**

向 `packages/api-sdk/src/client.test.ts` 新增：

```ts
it("queries student practice detail analytics", async () => {
  const fetchMock = vi.fn<FetchLike>(async () =>
    new Response(
      JSON.stringify({
        code: 0,
        message: "ok",
        data: {
          student_summary: {
            student_user_id: 501,
            student_name: "张三",
            class_id: 301,
            class_name: "七年级一班",
            course_id: 10,
            course_name: "数学",
            session_count: 3,
            answered_count: 18,
            correct_count: 12,
            wrong_count: 6,
            accuracy: 0.67,
            wrong_question_count: 2,
            confused_question_count: 1
          },
          active_tab: "wrong",
          sessions: { items: [], page: 1, page_size: 20, total: 0 },
          wrong_questions: {
            items: [
              {
                question_id: 1001,
                question_version_id: 3001,
                question_type: "single_choice",
                stem: "题干摘要",
                practice_wrong_count: 2,
                is_confused: false,
                last_result: "wrong"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          },
          confused_questions: { items: [], page: 1, page_size: 20, total: 0 }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const client = createApiClient({ baseUrl: "http://localhost:8080/api/v1", fetch: fetchMock });
  const result = await client.getStudentPracticeDetail({
    class_id: 301,
    course_id: 10,
    student_user_id: 501,
    tab: "wrong",
    page: 1,
    page_size: 20
  });

  expect(result.active_tab).toBe("wrong");
  expect(result.wrong_questions.items[0].question_id).toBe(1001);
  expect(String(fetchMock.mock.calls[0][0])).toContain(
    "/analytics/student-practice-detail?class_id=301&course_id=10&student_user_id=501&tab=wrong&page=1&page_size=20"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: FAIL，提示 `getStudentPracticeDetail` 未定义或类型不存在。

- [ ] **Step 3: Write minimal SDK and OpenAPI implementation**

在 `packages/api-sdk/src/client.ts` 中新增类型：

```ts
export type StudentPracticeDetailTab = "sessions" | "wrong" | "confused";

export interface StudentPracticeSummary {
  student_user_id: number;
  student_name: string;
  student_no?: string;
  class_id: number;
  class_name: string;
  course_id: number;
  course_name: string;
  session_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
  wrong_question_count: number;
  confused_question_count: number;
  last_practiced_at?: string;
}

export interface StudentPracticeSessionItem {
  session_id: number;
  started_at?: string;
  finished_at?: string;
  status: string;
  total_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
}

export interface StudentPracticeQuestionItem {
  question_id: number;
  question_version_id: number;
  question_type: string;
  stem: string;
  practice_wrong_count: number;
  last_wrong_at?: string;
  is_confused: boolean;
  confused_at?: string;
  last_result: string;
}

export interface StudentPracticeDetailResult {
  student_summary: StudentPracticeSummary;
  active_tab: StudentPracticeDetailTab;
  sessions: PageResult<StudentPracticeSessionItem>;
  wrong_questions: PageResult<StudentPracticeQuestionItem>;
  confused_questions: PageResult<StudentPracticeQuestionItem>;
}
```

客户端方法：

```ts
getStudentPracticeDetail(query: StudentPracticeDetailQuery): Promise<StudentPracticeDetailResult>;
```

```ts
getStudentPracticeDetail: (query) =>
  request(
    fetcher,
    options,
    withQuery("/analytics/student-practice-detail", {
      class_id: query.class_id,
      course_id: query.course_id,
      student_user_id: query.student_user_id,
      tab: query.tab,
      start_at: query.start_at,
      end_at: query.end_at,
      page: query.page,
      page_size: query.page_size
    }),
    { method: "GET" }
  ),
```

在 `docs/api/openapi.yaml` 中新增：

```yaml
  /analytics/student-practice-detail:
    get:
      tags: [Analytics]
      summary: 老师侧学生学习详情
      operationId: getStudentPracticeDetail
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
          name: student_user_id
          required: true
          schema: { type: integer, format: int64 }
        - in: query
          name: tab
          schema:
            type: string
            enum: [sessions, wrong, confused]
      responses:
        '200':
          $ref: '#/components/responses/StudentPracticeDetailOk'
```

在 `docs/docs/openapi_design_v1.md` 的 analytics 小节补一段说明：

```md
### GET `/api/v1/analytics/student-practice-detail`

- 作用：老师在班级学习页中查看某个学生在当前班级课程下的学习详情。
- 范围：仅限当前 `class_id + course_id`。
- `tab=sessions` 返回练题记录，`tab=wrong` 返回错题，`tab=confused` 返回疑惑题。
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
go run -work D:\workspace\temp\openapi_parse_stage2f.go
```

Expected:

```text
packages/api-sdk/src/client.test.ts passes
openapi_parse_ok
```

- [ ] **Step 5: Commit**

```powershell
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts docs/api/openapi.yaml docs/docs/openapi_design_v1.md
git commit -m "新增：补齐老师侧学生学习详情契约"
```

## 任务 4： 前端学生详情页与班级学习页跳转红绿测试

**Files:**
- Modify: `apps/user-web/src/class-learning-page.tsx`
- Create: `apps/user-web/src/student-learning-detail-page.tsx`
- Create: `apps/user-web/src/student-learning-detail-page.test.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

新建 `apps/user-web/src/student-learning-detail-page.test.tsx`，至少覆盖：

```tsx
it("loads student detail with default sessions tab", async () => {
  const api = {
    getStudentPracticeDetail: vi.fn(async () => ({
      student_summary: {
        student_user_id: 501,
        student_name: "张三",
        class_id: 301,
        class_name: "七年级一班",
        course_id: 10,
        course_name: "数学",
        session_count: 3,
        answered_count: 18,
        correct_count: 12,
        wrong_count: 6,
        accuracy: 0.67,
        wrong_question_count: 2,
        confused_question_count: 1
      },
      active_tab: "sessions",
      sessions: {
        items: [
          {
            session_id: 9001,
            status: "finished",
            total_count: 10,
            answered_count: 10,
            correct_count: 7,
            wrong_count: 3,
            accuracy: 0.7
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      },
      wrong_questions: { items: [], page: 1, page_size: 20, total: 0 },
      confused_questions: { items: [], page: 1, page_size: 20, total: 0 }
    }))
  };

  render(
    <StudentLearningDetailPage
      api={api}
      path="/app/class-learning/student?class_id=301&course_id=10&student_user_id=501"
      onNavigate={vi.fn()}
    />
  );

  expect(await screen.findByRole("heading", { name: "张三" })).toBeTruthy();
  expect(screen.getByText("练习次数：3")).toBeTruthy();
  expect(api.getStudentPracticeDetail).toHaveBeenCalledWith(
    expect.objectContaining({ class_id: 301, course_id: 10, student_user_id: 501, tab: "sessions" })
  );
});

it("switches tab and refetches wrong questions", async () => {
  // 第一次返回 sessions，第二次返回 wrong
});

it("shows error when path query is invalid", async () => {
  render(<StudentLearningDetailPage api={api} path="/app/class-learning/student?class_id=0" onNavigate={vi.fn()} />);
  expect(screen.getByText("学生学习详情参数无效。")).toBeTruthy();
});
```

在 `apps/user-web/src/app.test.tsx` 中新增一条集成测试：

```tsx
it("navigates from class learning page to student detail page", async () => {
  // 先完成登录和班级学习查询，再点击“查看详情”
  // 断言进入学生详情页，并展示学生姓名
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm test -- apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/app.test.tsx
```

Expected: FAIL，详情页组件和壳层路径分发尚不存在。

- [ ] **Step 3: Write minimal UI implementation**

新建 `apps/user-web/src/student-learning-detail-page.tsx`，定义最小 API：

```ts
import { useEffect, useState } from "react";
import type { StudentPracticeDetailQuery, StudentPracticeDetailResult } from "@aios/api-sdk";

export interface StudentLearningDetailApi {
  getStudentPracticeDetail(query: StudentPracticeDetailQuery): Promise<StudentPracticeDetailResult>;
}
```

解析路径参数：

```ts
function parseStudentDetailPath(path: string): StudentPracticeDetailQuery | null {
  const [, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  const classId = Number(params.get("class_id"));
  const courseId = Number(params.get("course_id"));
  const studentUserId = Number(params.get("student_user_id"));
  const tab = (params.get("tab") ?? "sessions") as StudentPracticeDetailQuery["tab"];
  if (!Number.isInteger(classId) || classId <= 0 || !Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(studentUserId) || studentUserId <= 0) {
    return null;
  }
  return {
    class_id: classId,
    course_id: courseId,
    student_user_id: studentUserId,
    tab,
    start_at: params.get("start_at") ?? undefined,
    end_at: params.get("end_at") ?? undefined,
    page: 1,
    page_size: 20
  };
}
```

页面主体结构保持最小闭环：

```tsx
return (
  <section aria-label="学生学习详情页">
    <button type="button" onClick={() => onNavigate(buildBackPath(query))}>
      返回班级学习
    </button>
    {message ? <p>{message}</p> : null}
    {result ? (
      <>
        <h2>{result.student_summary.student_name}</h2>
        <p>学号：{result.student_summary.student_no ?? "-"}</p>
        <p>
          {result.student_summary.class_name} / {result.student_summary.course_name}
        </p>
        <p>练习次数：{result.student_summary.session_count}</p>
        <p>答题数：{result.student_summary.answered_count}</p>
        <p>正确率：{Math.round(result.student_summary.accuracy * 100)}%</p>
        <div>
          <button type="button" aria-pressed={activeTab === "sessions"} onClick={() => switchTab("sessions")}>练题记录</button>
          <button type="button" aria-pressed={activeTab === "wrong"} onClick={() => switchTab("wrong")}>错题</button>
          <button type="button" aria-pressed={activeTab === "confused"} onClick={() => switchTab("confused")}>疑惑题</button>
        </div>
        {activeTab === "sessions" ? <SessionList items={result.sessions.items} /> : null}
        {activeTab === "wrong" ? <QuestionList title="错题列表" items={result.wrong_questions.items} /> : null}
        {activeTab === "confused" ? <QuestionList title="疑惑题列表" items={result.confused_questions.items} /> : null}
      </>
    ) : null}
  </section>
);
```

在 `apps/user-web/src/class-learning-page.tsx` 中扩展 props：

```ts
interface ClassLearningPageProps {
  api: ClassLearningApi;
  onNavigate?(path: string): void;
}
```

学生列表里加入明确按钮：

```tsx
<button
  type="button"
  onClick={() =>
    onNavigate?.(
      buildStudentDetailPath({
        class_id: summary.class_id,
        course_id: summary.course_id,
        student_user_id: student.student_id,
        start_at: toStartAt(form.startDate),
        end_at: toEndAt(form.endDate),
        tab: "sessions"
      })
    )
  }
>
  查看详情
</button>
```

在 `apps/user-web/src/app.tsx` 中注册新页面：

```tsx
import { StudentLearningDetailPage, type StudentLearningDetailApi } from "./student-learning-detail-page";
```

```tsx
{selectedPath.startsWith("/app/class-learning/student") && currentPracticeApi && isStudentLearningDetailApi(currentPracticeApi) ? (
  <StudentLearningDetailPage api={currentPracticeApi} path={selectedPath} onNavigate={setSelectedPath} />
) : null}
```

并把班级学习页改成：

```tsx
<ClassLearningPage api={currentPracticeApi} onNavigate={setSelectedPath} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm test -- apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/app.test.tsx apps/user-web/src/class-learning-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/user-web/src/class-learning-page.tsx apps/user-web/src/student-learning-detail-page.tsx apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：补齐老师侧学生学习详情页"
```

## 任务 5： 阶段状态文档与最终验证

**Files:**
- Modify: `docs/docs/26_stage2f_implementation_status.md`

- [ ] **Step 1: Update stage status document**

在 `docs/docs/26_stage2f_implementation_status.md` 的“本阶段完成内容”中追加：

```md
- `internal/modules/analytics`：新增 `GET /analytics/student-practice-detail`，支持老师查看当前班级课程下单个学生的练题记录、错题和疑惑题。
- `apps/user-web`：新增 `StudentLearningDetailPage`，支持从班级学习页继续下钻到学生详情，并通过标签页切换三类数据。
```

在“当前限制”中明确：

```md
5. 学生详情页当前仍为最小可用形态，暂未继续下钻到单次练题详情或完整题目详情页。
```

- [ ] **Step 2: Run targeted verification**

Run:

```powershell
git diff --check
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/student-learning-detail-page.test.tsx apps/user-web/src/app.test.tsx
go test ./internal/modules/analytics
```

Expected:

```text
no diff-check output
targeted frontend tests pass
analytics package tests pass
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
```

Expected:

```text
all vitest suites pass
typecheck pass
build pass
go test all packages pass
```

- [ ] **Step 4: Commit**

```powershell
git add docs/docs/26_stage2f_implementation_status.md
git commit -m "文档：同步老师侧学生学习详情状态"
```

## 自检

### 1. Spec coverage

本计划已覆盖 spec 中的关键要求：

1. 新页面路径和查询参数：任务 4。
2. 只看当前班级课程范围数据：任务 1、任务 2。
3. 顶部学生概览：任务 1、任务 4。
4. 标签页 `练题记录 / 错题 / 疑惑题`：任务 1、任务 2、任务 4。
5. 老师任课与学生当前班级归属校验：任务 1、任务 2。
6. OpenAPI、SDK、前后端测试和阶段状态文档：任务 3、任务 5。

未发现遗漏项。

### 2. Placeholder scan

本计划未保留任何占位式描述；每个任务都给出了目标文件、最小实现骨架、执行命令和预期结果。

### 3. Type consistency

命名已统一为：

1. `StudentPracticeDetailQuery`
2. `StudentPracticeSummary`
3. `StudentPracticeSessionItem`
4. `StudentPracticeQuestionItem`
5. `StudentPracticeDetailResult`
6. `StudentDetailTabSessions / Wrong / Confused`
7. `getStudentPracticeDetail`
8. `StudentLearningDetailPage`

后端 `student_user_id` 与前端 `student_user_id` 字段保持一致，未混用 `student_id` 或 `user_id` 作为对外契约字段。
