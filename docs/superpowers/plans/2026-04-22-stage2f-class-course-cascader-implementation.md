# 阶段 2F 班级课程级联选择器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single cascaded class-course selector for the class-learning page, backed by a permission-aware analytics options API and matching SDK/OpenAPI updates.

**Architecture:** Extend the existing `internal/modules/analytics` module with a new `class-course-options` endpoint that returns a class-grouped course tree based on the same tenant and assignment scope already used by `class-practice-summary`. Update the SDK with tree-shaped option types, then replace the manual `class_id` / `course_id` inputs in `ClassLearningPage` with a single two-level selector that loads options first and only queries analytics after a course node is chosen.

**Tech Stack:** Go, Gin, database/sql, MySQL 8, sqlmock, React 18, TypeScript, Vitest, Testing Library, OpenAPI 3.0 YAML.

---

## File Map

- Modify: `internal/modules/analytics/model.go` to add class-course option types and repository contract.
- Modify: `internal/modules/analytics/service.go` to add `ListClassCourseOptions`.
- Modify: `internal/modules/analytics/handler.go` to register and serve `GET /analytics/class-course-options`.
- Modify: `internal/modules/analytics/handler_test.go` to add handler/service red-green coverage for the new endpoint.
- Modify: `internal/modules/analytics/mysql_repository.go` to query grouped class-course trees.
- Modify: `internal/modules/analytics/mysql_repository_test.go` to verify tenant, teacher, grouping, and dedupe rules.
- Modify: `packages/api-sdk/src/client.ts` to add `CourseOptionItem`, `ClassCourseOption`, `ClassCourseOptionsResult`, and `listClassCourseOptions`.
- Modify: `packages/api-sdk/src/client.test.ts` to add SDK request/response tests.
- Modify: `apps/user-web/src/class-learning-page.tsx` to replace ID inputs with a single cascaded selector and option-loading state.
- Modify: `apps/user-web/src/class-learning-page.test.tsx` to cover loading, empty, error, and course-node query behavior.
- Modify: `apps/user-web/src/app.test.tsx` if the shell-level mock shape must include `listClassCourseOptions`.
- Modify: `docs/api/openapi.yaml`, `docs/docs/openapi_design_v1.md`, `docs/docs/26_stage2f_implementation_status.md` to formalize the new options API and selector behavior.

## Shared Names

Use these names consistently:

```go
type CourseOptionItem struct {
	CourseID   int64  `json:"course_id"`
	CourseName string `json:"course_name"`
}

type ClassCourseOption struct {
	ClassID   int64              `json:"class_id"`
	ClassName string             `json:"class_name"`
	Courses   []CourseOptionItem `json:"courses"`
}
```

Repository method:

```go
ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
```

SDK names:

```ts
export interface CourseOptionItem {
  course_id: number;
  course_name: string;
}

export interface ClassCourseOption {
  class_id: number;
  class_name: string;
  courses: CourseOptionItem[];
}

export interface ClassCourseOptionsResult {
  items: ClassCourseOption[];
}
```

## Task 1: Backend Options API Red-Green

**Files:**
- Modify: `internal/modules/analytics/model.go`
- Modify: `internal/modules/analytics/service.go`
- Modify: `internal/modules/analytics/handler.go`
- Modify: `internal/modules/analytics/handler_test.go`

- [ ] **Step 1: Write the failing tests**

Add these tests to `internal/modules/analytics/handler_test.go`:

```go
func TestHandler_ListClassCourseOptionsForTeacher(t *testing.T)
func TestHandler_ListClassCourseOptionsForAdmin(t *testing.T)
func TestHandler_ListClassCourseOptionsRejectsMissingPermission(t *testing.T)
func TestService_ListClassCourseOptionsRejectsUnsupportedUserType(t *testing.T)
```

Use a memory repository shaped like:

```go
type memoryRepository struct {
	classCourseExists bool
	teacherAllowed    bool
	summary           ClassPracticeSummary
	students          []ClassPracticeStudentItem
	options           []ClassCourseOption
	lastQuery         ClassPracticeSummaryQuery
	lastScope         Scope
}
```

The happy-path handler assertion should look like:

```go
rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-course-options", nil, "token")
if rec.Code != http.StatusOK {
	t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
}
var body envelope[struct{ Items []ClassCourseOption `json:"items"` }]
decodeAnalyticsBody(t, rec, &body)
if len(body.Data.Items) != 1 || len(body.Data.Items[0].Courses) != 2 {
	t.Fatalf("items = %+v", body.Data.Items)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
go test ./internal/modules/analytics -run "ListClassCourseOptions" -count=1
```

Expected: FAIL because `ListClassCourseOptions` types, service method, or handler route do not exist yet.

- [ ] **Step 3: Add minimal backend implementation**

Update `internal/modules/analytics/model.go`:

```go
type CourseOptionItem struct {
	CourseID   int64  `json:"course_id"`
	CourseName string `json:"course_name"`
}

type ClassCourseOption struct {
	ClassID   int64              `json:"class_id"`
	ClassName string             `json:"class_name"`
	Courses   []CourseOptionItem `json:"courses"`
}
```

Extend the repository interface:

```go
ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
```

Add to `internal/modules/analytics/service.go`:

```go
func (service *Service) ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return nil, ErrForbidden
	}
	switch scope.UserType {
	case "teacher", "sys_admin", "school_admin":
		return service.repo.ListClassCourseOptions(ctx, scope)
	default:
		return nil, ErrForbidden
	}
}
```

Register and implement in `internal/modules/analytics/handler.go`:

```go
func (handler *Handler) RegisterRoutes(router gin.IRouter) {
	router.GET("/analytics/class-course-options", handler.listClassCourseOptions)
	router.GET("/analytics/class-practice-summary", handler.getClassPracticeSummary)
}

func (handler *Handler) listClassCourseOptions(ctx *gin.Context) {
	scope, ok := handler.authorize(ctx)
	if !ok {
		return
	}
	items, err := handler.service.ListClassCourseOptions(ctx.Request.Context(), scope)
	if err != nil {
		writeAnalyticsError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, response.Success(gin.H{"items": items}, requestID(ctx)))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
go test ./internal/modules/analytics -run "ListClassCourseOptions" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/modules/analytics/model.go internal/modules/analytics/service.go internal/modules/analytics/handler.go internal/modules/analytics/handler_test.go
git commit -m "新增：补齐班级课程选项接口骨架"
```

## Task 2: MySQL Repository Query For Cascaded Options

**Files:**
- Modify: `internal/modules/analytics/mysql_repository.go`
- Modify: `internal/modules/analytics/mysql_repository_test.go`

- [ ] **Step 1: Write the failing repository tests**

Add:

```go
func TestMySQLRepositoryListClassCourseOptionsForTeacherUsesAssignmentScope(t *testing.T)
func TestMySQLRepositoryListClassCourseOptionsForAdminGroupsAndDedupes(t *testing.T)
```

Teacher query expectation:

```go
mock.ExpectQuery(regexp.QuoteMeta(`
SELECT DISTINCT
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name
FROM teacher_class_course_assignments tcca
JOIN classes c ON c.id = tcca.class_id
JOIN courses co ON co.id = tcca.course_id
WHERE tcca.tenant_id = ? AND tcca.teacher_id = ? AND tcca.is_current = 1 AND tcca.status = 'active'
  AND c.tenant_id = tcca.tenant_id AND c.status = 'active' AND c.deleted_at IS NULL
  AND co.tenant_id = tcca.tenant_id AND co.status = 'active' AND co.deleted_at IS NULL
ORDER BY c.name ASC, co.name ASC
`)).
  WithArgs(int64(1), int64(7)).
  WillReturnRows(sqlmock.NewRows([]string{"class_id", "class_name", "course_id", "course_name"}).
    AddRow(301, "七年级一班", 10, "数学").
    AddRow(301, "七年级一班", 11, "英语"))
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
go test ./internal/modules/analytics -run "MySQLRepositoryListClassCourseOptions" -count=1
```

Expected: FAIL because the repository method does not exist yet.

- [ ] **Step 3: Write the minimal repository implementation**

Add to `internal/modules/analytics/mysql_repository.go`:

```go
func (repo *MySQLRepository) ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if scope.UserType == "teacher" {
		rows, err = repo.db.QueryContext(ctx, `
SELECT DISTINCT
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name
FROM teacher_class_course_assignments tcca
JOIN classes c ON c.id = tcca.class_id
JOIN courses co ON co.id = tcca.course_id
WHERE tcca.tenant_id = ? AND tcca.teacher_id = ? AND tcca.is_current = 1 AND tcca.status = 'active'
  AND c.tenant_id = tcca.tenant_id AND c.status = 'active' AND c.deleted_at IS NULL
  AND co.tenant_id = tcca.tenant_id AND co.status = 'active' AND co.deleted_at IS NULL
ORDER BY c.name ASC, co.name ASC
`, scope.TenantID, scope.UserID)
	} else {
		rows, err = repo.db.QueryContext(ctx, `
SELECT DISTINCT
  c.id AS class_id,
  c.name AS class_name,
  co.id AS course_id,
  co.name AS course_name
FROM teacher_class_course_assignments tcca
JOIN classes c ON c.id = tcca.class_id
JOIN courses co ON co.id = tcca.course_id
WHERE tcca.tenant_id = ? AND tcca.is_current = 1 AND tcca.status = 'active'
  AND c.tenant_id = tcca.tenant_id AND c.status = 'active' AND c.deleted_at IS NULL
  AND co.tenant_id = tcca.tenant_id AND co.status = 'active' AND co.deleted_at IS NULL
ORDER BY c.name ASC, co.name ASC
`, scope.TenantID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	options := make([]ClassCourseOption, 0)
	indexByClassID := map[int64]int{}
	for rows.Next() {
		var classID, courseID int64
		var className, courseName string
		if err := rows.Scan(&classID, &className, &courseID, &courseName); err != nil {
			return nil, err
		}
		index, ok := indexByClassID[classID]
		if !ok {
			options = append(options, ClassCourseOption{ClassID: classID, ClassName: className, Courses: []CourseOptionItem{}})
			index = len(options) - 1
			indexByClassID[classID] = index
		}
		options[index].Courses = append(options[index].Courses, CourseOptionItem{CourseID: courseID, CourseName: courseName})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return options, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
go test ./internal/modules/analytics -run "MySQLRepositoryListClassCourseOptions" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/modules/analytics/mysql_repository.go internal/modules/analytics/mysql_repository_test.go
git commit -m "新增：支持班级课程级联选项查询"
```

## Task 3: SDK Contract Red-Green

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`

- [ ] **Step 1: Write the failing SDK test**

Add:

```ts
it("queries class course options analytics", async () => {
  const fetchMock = vi.fn<FetchLike>(async () =>
    new Response(
      JSON.stringify({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              class_id: 301,
              class_name: "七年级一班",
              courses: [
                { course_id: 10, course_name: "数学" },
                { course_id: 11, course_name: "英语" }
              ]
            }
          ]
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
  const client = createApiClient({ baseUrl: "http://localhost:8080/api/v1", fetch: fetchMock });
  const result = await client.listClassCourseOptions();
  expect(result.items[0].courses[0].course_name).toBe("数学");
  expect(String(fetchMock.mock.calls[0][0])).toContain("/analytics/class-course-options");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: FAIL because `listClassCourseOptions` is not defined.

- [ ] **Step 3: Write the minimal SDK implementation**

In `packages/api-sdk/src/client.ts`, add:

```ts
listClassCourseOptions(): Promise<ClassCourseOptionsResult>;
```

Types:

```ts
export interface CourseOptionItem {
  course_id: number;
  course_name: string;
}

export interface ClassCourseOption {
  class_id: number;
  class_name: string;
  courses: CourseOptionItem[];
}

export interface ClassCourseOptionsResult {
  items: ClassCourseOption[];
}
```

Client method:

```ts
listClassCourseOptions: () =>
  request(fetcher, options, "/analytics/class-course-options", { method: "GET" }),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts
git commit -m "新增：补齐班级课程选项SDK契约"
```

## Task 4: User-Web Cascaded Selector Red-Green

**Files:**
- Modify: `apps/user-web/src/class-learning-page.tsx`
- Modify: `apps/user-web/src/class-learning-page.test.tsx`
- Modify: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Replace the ID-input assertions with tests like:

```tsx
it("loads class course options and queries after selecting a course node", async () => {
  const api = {
    listClassCourseOptions: vi.fn(async () => ({
      items: [
        {
          class_id: 301,
          class_name: "七年级一班",
          courses: [{ course_id: 10, course_name: "数学" }]
        }
      ]
    })),
    getClassPracticeSummary: vi.fn(async () => ({
      summary: {
        class_id: 301,
        class_name: "七年级一班",
        course_id: 10,
        course_name: "数学",
        student_count: 1,
        participated_student_count: 1,
        session_count: 1,
        answered_count: 5,
        correct_count: 4,
        wrong_count: 1,
        accuracy: 0.8,
        wrong_question_count: 1,
        confused_question_count: 0
      },
      students: { items: [], page: 1, page_size: 20, total: 0 }
    }))
  };
  render(<ClassLearningPage api={api} />);
  await screen.findByText("七年级一班");
  fireEvent.click(screen.getByRole("button", { name: "班级课程" }));
  fireEvent.click(screen.getByRole("button", { name: "七年级一班" }));
  fireEvent.click(screen.getByRole("button", { name: "数学" }));
  fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));
  await waitFor(() => expect(api.getClassPracticeSummary).toHaveBeenCalledWith(expect.objectContaining({ class_id: 301, course_id: 10 })));
});
```

Also add:

```tsx
it("shows empty state when no class course options exist", async () => {})
it("shows error state when class course options fail to load", async () => {})
it("rejects querying before selecting a course node", async () => {})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
```

Expected: FAIL because `ClassLearningPage` still renders `班级ID` and `课程ID` inputs and has no option loader.

- [ ] **Step 3: Write the minimal UI implementation**

Extend the page API:

```ts
export interface ClassLearningApi {
  listClassCourseOptions(): Promise<ClassCourseOptionsResult>;
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
}
```

Replace the local form with:

```ts
const defaultSelection = {
  classId: undefined as number | undefined,
  courseId: undefined as number | undefined,
  className: "",
  courseName: ""
};
```

Load options on mount:

```ts
useEffect(() => {
  let active = true;
  setOptionsMessage("正在加载班级课程...");
  api.listClassCourseOptions()
    .then((data) => {
      if (!active) return;
      setOptions(data.items);
      if (countCourses(data.items) === 0) {
        setOptionsMessage("暂无可查看的班级课程");
        return;
      }
      const first = firstCourseNode(data.items);
      if (first) {
        setSelection(first);
        setOptionsMessage("");
      }
    })
    .catch(() => {
      if (active) setOptionsMessage("班级课程加载失败，请稍后重试。");
    });
  return () => { active = false; };
}, [api]);
```

Use a single two-level menu:

```tsx
<div>
  <span>班级课程</span>
  <details>
    <summary>{selection.courseId ? `${selection.className} / ${selection.courseName}` : "请选择班级和课程"}</summary>
    <ul>
      {options.map((item) => (
        <li key={item.class_id}>
          <button type="button">{item.class_name}</button>
          <ul>
            {item.courses.map((course) => (
              <li key={course.course_id}>
                <button
                  type="button"
                  onClick={() => setSelection({
                    classId: item.class_id,
                    courseId: course.course_id,
                    className: item.class_name,
                    courseName: course.course_name
                  })}
                >
                  {course.course_name}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </details>
</div>
```

Before querying:

```ts
if (!selection.classId || !selection.courseId) {
  setMessage("请选择班级和课程。");
  setResult(null);
  return;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/user-web/src/class-learning-page.tsx apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：升级班级学习级联选择器"
```

## Task 5: OpenAPI, Status Docs, And Final Verification

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/docs/openapi_design_v1.md`
- Modify: `docs/docs/26_stage2f_implementation_status.md`

- [ ] **Step 1: Update OpenAPI**

Add:

```yaml
  /analytics/class-course-options:
    get:
      tags: [Analytics]
      summary: 班级课程级联选项
      operationId: listClassCourseOptions
      responses:
        '200': { $ref: '#/components/responses/ClassCourseOptionsOk' }
```

Add schemas:

```yaml
    CourseOptionItem:
      type: object
      required: [course_id, course_name]
      properties:
        course_id: { type: integer, format: int64 }
        course_name: { type: string }
    ClassCourseOption:
      type: object
      required: [class_id, class_name, courses]
      properties:
        class_id: { type: integer, format: int64 }
        class_name: { type: string }
        courses:
          type: array
          items:
            $ref: '#/components/schemas/CourseOptionItem'
```

- [ ] **Step 2: Update Markdown docs**

In `docs/docs/openapi_design_v1.md`, add a new subsection under analytics:

```md
### GET `/api/v1/analytics/class-course-options`

- 作用：返回当前用户可查看的班级课程树，用于班级学习页级联选择器。
- teacher：仅返回自己当前任课组合。
- sys_admin / school_admin：返回当前租户有效任课关系组合。
```

In `docs/docs/26_stage2f_implementation_status.md`, replace “班级 ID、课程 ID 输入” with “单个级联班级课程选择器” and add the new endpoint to the completed items list.

- [ ] **Step 3: Run targeted docs verification**

Run:

```powershell
go run -work D:\workspace\temp\openapi_parse_stage2f.go
git diff --check
```

Expected: `openapi_parse_ok` and no diff-check output.

- [ ] **Step 4: Run full verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
```

Expected:
- `pnpm test`: all test files pass
- `pnpm typecheck`: passes
- `pnpm build`: passes
- `go test -work ./...`: passes

- [ ] **Step 5: Commit**

```powershell
git add docs/api/openapi.yaml docs/docs/openapi_design_v1.md docs/docs/26_stage2f_implementation_status.md
git commit -m "文档：同步班级课程级联选择器契约"
```

## Self-Review

- Spec coverage: covers the new options API, permission-aware data source, SDK contract, single cascaded selector UI, empty/error/loading states, and doc updates from `docs/superpowers/specs/2026-04-22-stage2f-class-course-cascader-design.md`.
- Placeholder scan: no `TBD`, `TODO`, or “similar to above” shortcuts remain.
- Type consistency: `ClassCourseOption`, `CourseOptionItem`, `listClassCourseOptions`, and `ClassCourseOptionsResult` are used consistently across backend, SDK, and frontend tasks.
