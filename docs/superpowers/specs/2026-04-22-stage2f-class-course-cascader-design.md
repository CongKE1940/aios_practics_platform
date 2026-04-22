# 阶段 2F 设计补充：班级学习页级联班级课程选择器

日期：2026-04-22
状态：待审阅
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 2F 已完成老师侧班级学习页最小闭环，但当前筛选区仍使用 `class_id`、`course_id` 两个手工输入框。这个入口适合快速打通链路，不适合老师日常使用，也容易出现输入错误、先后关系不清和可选范围不透明的问题。

本次补充设计的目标，是把班级学习页的手工输入升级为单个“班级-课程级联组合”下拉框。用户在同一个下拉框里先选择班级，再展开该班级下的课程，最终选中一个 `class_id + course_id` 组合，然后再查询班级学习数据。

## 2. 目标

本次改造完成后，应满足：

1. 班级学习页不再要求用户手工输入 `class_id` 和 `course_id`。
2. 页面提供单个级联下拉框，先选班级，再选该班级下的课程。
3. 老师只会看到自己当前有权限查看的班级和课程组合。
4. 系统管理员和学校管理员会看到当前租户内可查看的班级和课程组合。
5. 选择器和 `GET /api/v1/analytics/class-practice-summary` 使用同一套权限口径，避免出现“可选但不可查”的情况。
6. SDK、OpenAPI、前端测试和后端测试同步更新。

## 3. 范围

### 3.1 包含范围

1. 新增班级学习页选择器专用接口：
   - `GET /api/v1/analytics/class-course-options`
2. 后端 `analytics` 模块补充“可选班级课程树”查询能力。
3. SDK 补充树形班级课程选项方法与类型。
4. 用户端 `ClassLearningPage` 用单个级联下拉框替换两个 ID 输入框。
5. 班级学习查询仍复用现有：
   - `GET /api/v1/analytics/class-practice-summary`
6. OpenAPI 与设计说明同步更新。

### 3.2 不包含范围

1. 组织树选择器。
2. 年级、学校、学段多级联动。
3. 我的课程卡片化入口。
4. 趋势图、导出、学生详情跳转。
5. 对 `class-practice-summary` 的统计口径修改。

## 4. 核心设计

### 4.1 接口形态

新增正式接口：

```text
GET /api/v1/analytics/class-course-options
```

接口无需额外查询参数，直接返回当前登录用户在当前租户内可见的班级课程树。

### 4.2 响应结构

响应建议为树形结构：

```json
{
  "items": [
    {
      "class_id": 301,
      "class_name": "七年级一班",
      "courses": [
        {
          "course_id": 10,
          "course_name": "数学"
        },
        {
          "course_id": 11,
          "course_name": "英语"
        }
      ]
    }
  ]
}
```

字段定义：

1. `class_id`：班级 ID。
2. `class_name`：班级名称。
3. `courses`：当前班级下可见的课程数组。
4. `course_id`：课程 ID。
5. `course_name`：课程名称。

返回结构不额外包装 `label`，前端统一按 `class_name / course_name` 组合展示，减少后端展示层语义。

### 4.3 权限口径

接口要求 access token 具有 `analytics:view` 权限。

授权规则：

1. `user_type=teacher`：
   - 只返回当前老师在 `teacher_class_course_assignments` 中 `is_current=1`、`status='active'` 的班级课程组合。
2. `user_type=sys_admin` 或 `user_type=school_admin`：
   - 返回当前租户内可用的班级课程组合。
3. 其他用户类型：
   - 返回 403。

老师口径与现有 `class-practice-summary` 完全一致。

管理员口径建议仍以当前有效任课关系为基础构建可选项，而不是笛卡尔积生成“所有班级 x 所有课程”，原因如下：

1. 当前系统里“班级与课程是否实际关联”的正式业务依据就是 `teacher_class_course_assignments`。
2. 避免给管理员展示大量未开课、未任教、无实际使用意义的组合。
3. 与老师视角共享同一数据边界，减少后续维护分叉。

### 4.4 数据来源

建议数据来源如下：

1. `teacher_class_course_assignments`
2. `classes`
3. `courses`

查询规则：

1. 限定 `tenant_id = token.tenant_id`。
2. 限定任课关系 `is_current = 1 AND status = 'active'`。
3. 班级和课程都要求 `status = 'active'` 且未删除。
4. 老师模式再追加 `teacher_id = token.user_id`。
5. 结果按 `class_name`、`course_name` 排序。
6. 先按 `(class_id, course_id)` 去重，再按班级分组。

### 4.5 前端交互

用户端 `ClassLearningPage` 的筛选区改为：

1. 单个级联下拉框：`班级课程`
2. `开始日期`
3. `结束日期`
4. `查询班级学习` 按钮

交互规则：

1. 页面初始化时，请求 `class-course-options`。
2. 下拉框第一层显示班级，展开后显示该班级下的课程。
3. 用户只能选到课程节点，不能只停留在班级节点。
4. 选中课程节点后，页面内部保存：
   - `class_id`
   - `course_id`
5. 点击查询按钮时，继续调用 `getClassPracticeSummary`。
6. 如果只有一个可选课程节点，可以自动默认选中该节点。
7. 如果没有任何可选节点，页面展示：
   - “暂无可查看的班级课程”
   - 不发起统计查询

### 4.6 组件形态

前端不拆成两个独立下拉框，而是在一个组件里完成两级选择。实现可以是：

1. 自定义简化级联选择器；
2. 或在当前技术栈允许范围内，用原生 `details/button/list` 风格拼装一个两级菜单；
3. 测试和实现都以“单个控件、两级选择”作为验收标准，而不是具体 UI 库名称。

本次优先保证行为正确，不引入新的重量级 UI 依赖。

## 5. 错误与状态

后端错误口径：

1. 缺少 `analytics:view`：403。
2. 用户类型不支持：403。
3. 数据库查询失败：500。

前端状态口径：

1. 选项加载中：显示“正在加载班级课程...”。
2. 选项为空：显示“暂无可查看的班级课程”。
3. 选项加载失败：显示“班级课程加载失败，请稍后重试。”。
4. 未选择课程节点就点击查询：显示“请选择班级和课程。”。

## 6. 契约变化

### 6.1 Backend

`internal/modules/analytics` 新增以下类型：

```go
type ClassCourseOption struct {
	ClassID   int64              `json:"class_id"`
	ClassName string             `json:"class_name"`
	Courses   []CourseOptionItem `json:"courses"`
}

type CourseOptionItem struct {
	CourseID   int64  `json:"course_id"`
	CourseName string `json:"course_name"`
}
```

Repository 新增：

```go
ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
```

Service 新增：

```go
ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error)
```

Handler 新增：

```go
GET /analytics/class-course-options
```

### 6.2 SDK

SDK 新增：

```ts
interface CourseOptionItem {
  course_id: number;
  course_name: string;
}

interface ClassCourseOption {
  class_id: number;
  class_name: string;
  courses: CourseOptionItem[];
}

listClassCourseOptions(): Promise<{ items: ClassCourseOption[] }>;
```

### 6.3 Frontend

`ClassLearningApi` 扩充为：

1. `listClassCourseOptions`
2. `getClassPracticeSummary`

页面不再暴露 `班级ID`、`课程ID` 两个输入框。

## 7. 测试策略

### 7.1 后端测试

新增或补充：

1. 老师仅返回自己当前任课的班级课程树。
2. 管理员返回当前租户有效任课关系对应的班级课程树。
3. 缺少 `analytics:view` 返回 403。
4. 班级课程树按班级分组、按课程去重。

### 7.2 SDK 测试

新增：

1. `listClassCourseOptions` 会请求 `/analytics/class-course-options`。
2. 能正确解包 `items` 树形结构。

### 7.3 前端测试

新增或修改：

1. 页面初始化会请求班级课程树。
2. 只有选到课程节点后才允许查询。
3. 选择器能展示班级和课程两级结构。
4. 查询时传给 `getClassPracticeSummary` 的仍是 `class_id + course_id + 日期范围`。
5. 无可选项时显示空态。
6. 选项加载失败时显示错误态。

## 8. 验收标准

1. 班级学习页不再出现手工 `class_id` / `course_id` 输入框。
2. 页面存在单个级联选择器，且可完成“先班级、后课程”的两级选择。
3. 老师账号只会看到自己当前可查看的班级课程组合。
4. 管理员账号会看到当前租户内有效班级课程组合。
5. 选中课程后，班级学习统计查询成功。
6. 空态、错误态、未选择态均有明确反馈。
7. SDK、OpenAPI、后端测试、前端测试同步更新。
