# 阶段 2F 班级课程级联选择器 实施计划

> **面向代理执行者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步执行本计划。所有步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 为班级学习页构建单个班级课程级联选择器，并补齐具备权限感知能力的 analytics 选项 API，以及对应的 SDK/OpenAPI 更新。

**实现架构：** 在现有 `internal/modules/analytics` 模块中新增 `class-course-options` 端点，基于 `class-practice-summary` 已采用的同一租户与任课范围口径返回按班级分组的课程树。同步为 SDK 增加树形选项类型，并将 `ClassLearningPage` 中手工输入的 `class_id` / `course_id` 替换为单个两级选择器：先加载选项，只有选中课程节点后才查询 analytics。

**技术栈：** Go, Gin, database/sql, MySQL 8, sqlmock, React 18, TypeScript, Vitest, Testing Library, OpenAPI 3.0 YAML.

---

## 文件清单

- 修改：`internal/modules/analytics/model.go`，补充班级课程选项类型与仓储契约。
- 修改：`internal/modules/analytics/service.go`，增加 `ListClassCourseOptions`。
- 修改：`internal/modules/analytics/handler.go`，注册并提供 `GET /analytics/class-course-options`。
- 修改：`internal/modules/analytics/handler_test.go`，为新端点补齐 handler/service 红绿测试覆盖。
- 修改：`internal/modules/analytics/mysql_repository.go`，查询按班级分组的课程树。
- 修改：`internal/modules/analytics/mysql_repository_test.go`，验证租户、老师、分组与去重规则。
- 修改：`packages/api-sdk/src/client.ts`，补充 `CourseOptionItem`、`ClassCourseOption`、`ClassCourseOptionsResult` 与 `listClassCourseOptions`。
- 修改：`packages/api-sdk/src/client.test.ts`，补齐 SDK 请求/响应测试。
- 修改：`apps/user-web/src/class-learning-page.tsx`，将 ID 输入替换为单个级联选择器并补齐选项加载状态。
- 修改：`apps/user-web/src/class-learning-page.test.tsx`，覆盖加载、空态、错误态与课程节点查询行为。
- 修改：`apps/user-web/src/app.test.tsx`，在壳层 mock 结构需要时补充 `listClassCourseOptions`。
- 修改：`docs/api/openapi.yaml`、`docs/docs/openapi_design_v1.md` 与 `docs/docs/26_stage2f_implementation_status.md`，将新选项 API 与选择器行为固化为正式文档。

## 共享命名

以下命名需保持一致：

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

仓储方法：

```go
ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
```

SDK 命名：

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

## 任务 1： 后端选项 API 红绿测试

**涉及文件：**
- 修改：`internal/modules/analytics/model.go`
- 修改：`internal/modules/analytics/service.go`
- 修改：`internal/modules/analytics/handler.go`
- 修改：`internal/modules/analytics/handler_test.go`

- [ ] **步骤 1： 编写失败测试**

将以下测试添加到 `internal/modules/analytics/handler_test.go`:

```go
func TestHandler_ListClassCourseOptionsForTeacher(t *testing.T)
func TestHandler_ListClassCourseOptionsForAdmin(t *testing.T)
func TestHandler_ListClassCourseOptionsRejectsMissingPermission(t *testing.T)
func TestService_ListClassCourseOptionsRejectsUnsupportedUserType(t *testing.T)
```

使用如下结构的内存仓储：

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

成功路径的 handler 断言可写成：

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

- [ ] **步骤 2： 运行测试并确认其失败**

执行：

```powershell
go test ./internal/modules/analytics -run "ListClassCourseOptions" -count=1
```

预期： FAIL because `ListClassCourseOptions` types, service method, or handler route do not exist yet.

- [ ] **步骤 3： 补充最小后端实现**

更新 `internal/modules/analytics/model.go`：

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

扩展仓储接口：

```go
ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
```

向 `internal/modules/analytics/service.go` 中添加：

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

在 `internal/modules/analytics/handler.go` 中注册并实现：

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

- [ ] **步骤 4： 运行测试并确认其通过**

执行：

```powershell
go test ./internal/modules/analytics -run "ListClassCourseOptions" -count=1
```

预期： PASS.

- [ ] **步骤 5： Commit**

```powershell
git add internal/modules/analytics/model.go internal/modules/analytics/service.go internal/modules/analytics/handler.go internal/modules/analytics/handler_test.go
git commit -m "新增：补齐班级课程选项接口骨架"
```

## 任务 2： MySQL 级联选项仓储查询

**涉及文件：**
- 修改：`internal/modules/analytics/mysql_repository.go`
- 修改：`internal/modules/analytics/mysql_repository_test.go`

- [ ] **步骤 1： 编写失败的仓储测试**

新增：

```go
func TestMySQLRepositoryListClassCourseOptionsForTeacherUsesAssignmentScope(t *testing.T)
func TestMySQLRepositoryListClassCourseOptionsForAdminGroupsAndDedupes(t *testing.T)
```

老师查询的预期 SQL：

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

- [ ] **步骤 2： 运行测试并确认其失败**

执行：

```powershell
go test ./internal/modules/analytics -run "MySQLRepositoryListClassCourseOptions" -count=1
```

预期： FAIL because the repository method does not exist yet.

- [ ] **步骤 3： 编写最小仓储实现**

向 `internal/modules/analytics/mysql_repository.go` 中添加：

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

- [ ] **步骤 4： 运行测试并确认其通过**

执行：

```powershell
go test ./internal/modules/analytics -run "MySQLRepositoryListClassCourseOptions" -count=1
```

预期： PASS.

- [ ] **步骤 5： Commit**

```powershell
git add internal/modules/analytics/mysql_repository.go internal/modules/analytics/mysql_repository_test.go
git commit -m "新增：支持班级课程级联选项查询"
```

## 任务 3： SDK 契约红绿测试

**涉及文件：**
- 修改：`packages/api-sdk/src/client.ts`
- 修改：`packages/api-sdk/src/client.test.ts`

- [ ] **步骤 1： 编写失败的 SDK 测试**

新增：

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

- [ ] **步骤 2： 运行测试并确认其失败**

执行：

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

预期： FAIL because `listClassCourseOptions` is not defined.

- [ ] **步骤 3： 编写最小 SDK 实现**

在 `packages/api-sdk/src/client.ts` 中添加：

```ts
listClassCourseOptions(): Promise<ClassCourseOptionsResult>;
```

类型：

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

客户端方法：

```ts
listClassCourseOptions: () =>
  request(fetcher, options, "/analytics/class-course-options", { method: "GET" }),
```

- [ ] **步骤 4： 运行测试并确认其通过**

执行：

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts
```

预期： PASS.

- [ ] **步骤 5： Commit**

```powershell
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts
git commit -m "新增：补齐班级课程选项SDK契约"
```

## 任务 4： 用户端级联选择器红绿测试

**涉及文件：**
- 修改：`apps/user-web/src/class-learning-page.tsx`
- 修改：`apps/user-web/src/class-learning-page.test.tsx`
- 修改：`apps/user-web/src/app.test.tsx`

- [ ] **步骤 1： 编写失败的 UI 测试**

将原有 ID 输入断言替换为类似如下的测试：

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

另外新增：

```tsx
it("shows empty state when no class course options exist", async () => {})
it("shows error state when class course options fail to load", async () => {})
it("rejects querying before selecting a course node", async () => {})
```

- [ ] **步骤 2： 运行测试并确认其失败**

执行：

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
```

预期： FAIL because `ClassLearningPage` still renders `班级ID` and `课程ID` inputs and has no option loader.

- [ ] **步骤 3： 编写最小 UI 实现**

扩展页面 API：

```ts
export interface ClassLearningApi {
  listClassCourseOptions(): Promise<ClassCourseOptionsResult>;
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
}
```

将本地表单状态替换为：

```ts
const defaultSelection = {
  classId: undefined as number | undefined,
  courseId: undefined as number | undefined,
  className: "",
  courseName: ""
};
```

在挂载时加载选项：

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

使用单个两级菜单：

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

查询前：

```ts
if (!selection.classId || !selection.courseId) {
  setMessage("请选择班级和课程。");
  setResult(null);
  return;
}
```

- [ ] **步骤 4： 运行测试并确认其通过**

执行：

```powershell
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
```

预期： PASS.

- [ ] **步骤 5： Commit**

```powershell
git add apps/user-web/src/class-learning-page.tsx apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：升级班级学习级联选择器"
```

## 任务 5： OpenAPI、状态文档与最终验证

**涉及文件：**
- 修改：`docs/api/openapi.yaml`
- 修改：`docs/docs/openapi_design_v1.md`
- 修改：`docs/docs/26_stage2f_implementation_status.md`

- [ ] **步骤 1： 更新 OpenAPI**

新增：

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

- [ ] **步骤 2： 更新 Markdown 文档**

在 `docs/docs/openapi_design_v1.md` 中的 analytics 小节下新增一段：

```md
### GET `/api/v1/analytics/class-course-options`

- 作用：返回当前用户可查看的班级课程树，用于班级学习页级联选择器。
- teacher：仅返回自己当前任课组合。
- sys_admin / school_admin：返回当前租户有效任课关系组合。
```

在 `docs/docs/26_stage2f_implementation_status.md` 中，将“班级 ID、课程 ID 输入”替换为“单个级联班级课程选择器”，并把新接口加入已完成项列表。

- [ ] **步骤 3： 运行针对性文档验证**

执行：

```powershell
go run -work D:\workspace\temp\openapi_parse_stage2f.go
git diff --check
```

预期： `openapi_parse_ok` and no diff-check output.

- [ ] **步骤 4： 运行全量验证**

执行：

```powershell
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
```

预期：
- `pnpm test`：所有测试文件通过
- `pnpm typecheck`：通过
- `pnpm build`：通过
- `go test -work ./...`：通过

- [ ] **步骤 5： Commit**

```powershell
git add docs/api/openapi.yaml docs/docs/openapi_design_v1.md docs/docs/26_stage2f_implementation_status.md
git commit -m "文档：同步班级课程级联选择器契约"
```

## 自检

- 规格覆盖： covers the new options API, permission-aware data source, SDK contract, single cascaded selector UI, empty/error/loading states, and doc updates from `docs/superpowers/specs/2026-04-22-stage2f-class-course-cascader-design.md`.
- Placeholder scan: no `TBD`, `TODO`, or “similar to above” shortcuts remain.
- 类型一致性： `ClassCourseOption`, `CourseOptionItem`, `listClassCourseOptions`, and `ClassCourseOptionsResult` are used consistently across backend, SDK, and frontend tasks.
