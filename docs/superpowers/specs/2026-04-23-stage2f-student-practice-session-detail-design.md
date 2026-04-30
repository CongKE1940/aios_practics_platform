# 阶段 2F 设计补充：老师侧单次练题详情页

日期：2026-04-23
状态：已确认设计，待进入实现计划

## 1. 背景

阶段 2F 已完成老师侧班级学习页和学生学习详情页。老师现在可以按班级课程查看学生列表，并继续下钻到某个学生的练题记录、错题和疑惑题。

当前链路已经能回答“这个学生最近练了哪些、错了哪些、疑惑哪些”，但在 `练题记录` 标签页中仍无法继续回答“某一次练习里每道题怎么答、哪些题答错、学生提交了什么答案、正确答案和解析是什么”。为了把老师侧学习分析链路补到一个更完整的只读闭环，本次设计聚焦从学生详情页继续进入单次练题详情。

## 2. 目标

本次补充设计完成后，应满足：

1. 老师可以从学生学习详情页的 `练题记录` 列表点击某一次练习，进入该次练习的只读详情页。
2. 单次练题详情页只展示当前 `class_id + course_id + student_user_id + session_id` 对应的数据。
3. 页面顶部展示学生、班级、课程和本次练习概览。
4. 页面主体按题目顺序展示每道题的题干、学生答案、正确答案、是否正确、解析和作答时间。
5. 后端新增老师侧只读 analytics 接口，不复用学生本人练题接口的权限口径。
6. 前端支持返回学生学习详情页，并保留原有班级、课程、学生和时间筛选上下文。
7. OpenAPI、SDK、后端测试、前端测试和阶段状态文档同步更新。

## 3. 非目标

本次补充设计不包括：

1. 老师修改学生答案、批改主观题、重新判分或添加评语。
2. 继续下钻到完整题目详情页或题目编辑页。
3. 在单次练题详情页内创建讲评、布置作业或导出报告。
4. 展示跨课程、跨班级或跨租户的 session 数据。
5. 改造学生端练题详情和复习详情页面。

## 4. 设计方案对比

### 方案 A：新增 analytics 只读 session detail 接口与页面（推荐）

在 analytics 模块新增老师侧只读接口，并在用户端新增单次练题详情页面。接口继续复用班级学习页和学生详情页的权限口径。

优点：

1. 权限边界清晰，老师视角和学生本人视角不会混在一起。
2. 后续补题目详情弹层、讲评或导出时可以继续沿用同一上下文。
3. 前端路径可刷新恢复，也方便从学生详情页返回。

缺点：

1. 需要新增接口、SDK 类型、OpenAPI 契约和页面测试。

### 方案 B：直接复用 `/practice/sessions/:id/results`

优点：

1. 表面上新增代码最少。

缺点：

1. 现有 practice 接口是学生本人 `practice:use` 口径，通过 `scope.UserID` 限制只能看当前登录用户自己的 session。
2. 老师使用该接口需要改动 practice 模块权限语义，容易引入越权风险。
3. 老师侧还需要校验任课班级、课程和学生当前归属，practice 模块不是这个边界的合适承载点。

### 方案 C：在学生详情页内展开 session 行

优点：

1. 页面跳转少。

缺点：

1. 单次练习题目内容较多，直接展开会让学生详情页过重。
2. 多个展开状态、分页和返回行为会让页面状态复杂。
3. 刷新恢复和分享定位能力弱。

结论：采用方案 A。

## 5. 页面路径与上下文

新增用户端路径：

- `/app/class-learning/student/session`

路径采用查询参数传递上下文：

- `class_id`：必填
- `course_id`：必填
- `student_user_id`：必填
- `session_id`：必填
- `start_at`：可选，来自学生详情页筛选窗口
- `end_at`：可选，来自学生详情页筛选窗口

从学生详情页返回时，回到：

- `/app/class-learning/student?class_id=...&course_id=...&student_user_id=...&tab=sessions&start_at=...&end_at=...`

设计原因：

1. 刷新页面后可以恢复当前单次练题上下文。
2. 返回学生详情页时可以保留原时间筛选和当前学生。
3. 延续当前用户端 `selectedPath` 字符串路由方式，不引入额外路由库。

## 6. 数据范围与权限口径

本次接口固定为老师侧 analytics 只读视角。

所有请求必须满足：

1. access token 具备 `analytics:view`。
2. `class_id`、`course_id`、`student_user_id`、`session_id` 都是正整数。
3. `class_id + course_id` 在当前租户内存在且有效。
4. `student_user_id` 当前属于该 `class_id`，且归属状态为 current/active。
5. `session_id` 属于该 `student_user_id`。
6. `session_id` 属于该 `course_id`。
7. `session_id` 属于当前租户。

老师范围：

1. `teacher` 仅能查看自己当前任课的 `class_id + course_id`。
2. `sys_admin` 和 `school_admin` 按当前 token 租户范围查看。
3. 不支持老师通过该接口查看非任课班级课程下的 session。

错误口径：

1. 无 token 或 token 无效返回 `401`。
2. 无 `analytics:view` 或老师未任课返回 `403`。
3. 班级课程不存在、学生不属于班级、session 不属于学生或课程时返回 `404`。
4. 参数格式错误返回 `400`。

## 7. 后端接口设计

新增正式接口：

- `GET /api/v1/analytics/student-practice-session-detail`

请求参数：

- `class_id`：必填，正整数
- `course_id`：必填，正整数
- `student_user_id`：必填，正整数
- `session_id`：必填，正整数

`start_at` 与 `end_at` 不参与该接口的数据过滤。它们只用于前端返回学生详情页时恢复上下文。单次练题详情由 `session_id` 精确定位。

返回结构：

```json
{
  "student_summary": {
    "student_user_id": 201,
    "student_name": "张三",
    "student_no": "S2026001",
    "class_id": 301,
    "class_name": "七年级一班",
    "course_id": 10,
    "course_name": "数学"
  },
  "session": {
    "session_id": 9001,
    "started_at": "2026-04-23T10:00:00+08:00",
    "finished_at": "2026-04-23T10:30:00+08:00",
    "status": "finished",
    "practice_mode": "random",
    "source_mode": "course",
    "flow_mode": "fixed_count",
    "total_count": 10,
    "answered_count": 10,
    "correct_count": 7,
    "wrong_count": 3,
    "accuracy": 0.7
  },
  "questions": [
    {
      "session_question_id": 70001,
      "question_id": 1001,
      "question_version_id": 3001,
      "display_order": 1,
      "question_type": "single_choice",
      "content": {
        "stem": {
          "type": "text",
          "text": "1+1 等于几？"
        }
      },
      "student_answer": {
        "selected_options": ["B"]
      },
      "correct_answer": {
        "selected_options": ["B"]
      },
      "is_answered": true,
      "is_correct": true,
      "answered_at": "2026-04-23T10:02:00+08:00",
      "analysis": {
        "text": "基础加法。"
      }
    }
  ]
}
```

### 7.1 后端模型命名

建议新增类型：

```go
type StudentPracticeSessionDetailQuery struct {
    TenantID       int64
    ClassID        int64
    CourseID       int64
    StudentUserID  int64
    SessionID      int64
}

type StudentPracticeSessionStudentSummary struct {
    StudentUserID int64   `json:"student_user_id"`
    StudentName   string  `json:"student_name"`
    StudentNo     *string `json:"student_no,omitempty"`
    ClassID       int64   `json:"class_id"`
    ClassName     string  `json:"class_name"`
    CourseID      int64   `json:"course_id"`
    CourseName    string  `json:"course_name"`
}

type StudentPracticeSessionSummary struct {
    SessionID     int64      `json:"session_id"`
    StartedAt     *time.Time `json:"started_at,omitempty"`
    FinishedAt    *time.Time `json:"finished_at,omitempty"`
    Status        string     `json:"status"`
    PracticeMode  string     `json:"practice_mode"`
    SourceMode    string     `json:"source_mode"`
    FlowMode      string     `json:"flow_mode"`
    TotalCount    int        `json:"total_count"`
    AnsweredCount int        `json:"answered_count"`
    CorrectCount  int        `json:"correct_count"`
    WrongCount    int        `json:"wrong_count"`
    Accuracy      float64    `json:"accuracy"`
}

type StudentPracticeSessionQuestionItem struct {
    SessionQuestionID int64          `json:"session_question_id"`
    QuestionID        int64          `json:"question_id"`
    QuestionVersionID int64          `json:"question_version_id"`
    DisplayOrder      int            `json:"display_order"`
    QuestionType      string         `json:"question_type"`
    Content           map[string]any `json:"content"`
    StudentAnswer     map[string]any `json:"student_answer,omitempty"`
    CorrectAnswer     map[string]any `json:"correct_answer,omitempty"`
    IsAnswered        bool           `json:"is_answered"`
    IsCorrect         *bool          `json:"is_correct,omitempty"`
    AnsweredAt        *time.Time     `json:"answered_at,omitempty"`
    Analysis          map[string]any `json:"analysis,omitempty"`
}

type StudentPracticeSessionDetailResult struct {
    StudentSummary StudentPracticeSessionStudentSummary `json:"student_summary"`
    Session        StudentPracticeSessionSummary        `json:"session"`
    Questions      []StudentPracticeSessionQuestionItem `json:"questions"`
}
```

## 8. 数据查询口径

### 8.1 session 校验

查询必须确保：

```sql
practice_sessions.tenant_id = :tenant_id
AND practice_sessions.id = :session_id
AND practice_sessions.user_id = :student_user_id
AND practice_sessions.course_id = :course_id
```

如果 session 不满足上述条件，返回 `404`。

### 8.2 题目与答案

题目列表来自 `practice_session_questions`，按 `display_order ASC` 排序。

题目内容、正确答案和解析优先使用 `practice_session_questions.presented_options_json` 中保存的快照，原因是学生练习时看到的是当时呈现的版本，不能因题库后续版本更新而改变历史练习详情。

学生答案来自 `practice_answers`。如果同一 `session_question_id + user_id` 存在多次答案，应取 `MAX(id)` 对应的最新答案，和当前练题结果页口径保持一致。

统计口径：

1. `total_count`：该 session 下 `practice_session_questions` 数量。
2. `answered_count`：窗口不限，按每个 `session_question_id + user_id` 最新答案计数。
3. `correct_count`：最新答案中 `is_correct = 1` 的数量。
4. `wrong_count`：最新答案中 `is_correct = 0` 的数量。
5. `accuracy`：`correct_count / answered_count`，当 `answered_count = 0` 时为 `0`。

## 9. 前端页面设计

新增组件：

- `apps/user-web/src/student-practice-session-detail-page.tsx`

组件 props：

```ts
export interface StudentPracticeSessionDetailApi {
  getStudentPracticeSessionDetail(query: StudentPracticeSessionDetailQuery): Promise<StudentPracticeSessionDetailResult>;
}

interface StudentPracticeSessionDetailPageProps {
  api: StudentPracticeSessionDetailApi;
  path: string;
  onNavigate(path: string): void;
}
```

页面结构：

1. 顶部返回按钮：返回学生学习详情页。
2. 标题：学生姓名 + 本次练习。
3. 概览区：班级、课程、状态、开始/结束时间、总题数、已答数、正确数、错误数、正确率。
4. 题目列表：按展示顺序列出题干、学生答案、正确答案、对错状态、解析。
5. 空态：如果 session 下没有题目，显示“本次练习暂无题目。”
6. 错误态：参数无效显示“练习详情参数无效。”；接口失败显示“练习详情加载失败，请稍后重试。”

从学生详情页跳转：

1. `sessions` 列表中的每个 session 行增加 `查看本次练习` 按钮。
2. 按钮路径为 `/app/class-learning/student/session?class_id=...&course_id=...&student_user_id=...&session_id=...&start_at=...&end_at=...`。
3. 仅 `sessions` 标签页展示该按钮，错题和疑惑题暂不进入题目详情页。

## 10. SDK 与 OpenAPI

SDK 新增：

```ts
export interface StudentPracticeSessionDetailQuery {
  class_id: number;
  course_id: number;
  student_user_id: number;
  session_id: number;
}

getStudentPracticeSessionDetail(query: StudentPracticeSessionDetailQuery): Promise<StudentPracticeSessionDetailResult>;
```

OpenAPI 新增：

- `GET /analytics/student-practice-session-detail`
- `operationId: getStudentPracticeSessionDetail`
- `StudentPracticeSessionDetailResponse`
- `StudentPracticeSessionDetailResult`
- `StudentPracticeSessionSummary`
- `StudentPracticeSessionQuestionItem`

## 11. 测试策略

### 11.1 后端测试

需要覆盖：

1. 老师查看自己任课班级课程下学生 session 详情成功。
2. 老师未任课返回 `403`。
3. 学生不属于班级返回 `404`。
4. session 不属于该学生或课程返回 `404`。
5. 参数非法返回 `400`。
6. MySQL 仓储按 `session_question_id + user_id` 最新答案去重。
7. 题目顺序按 `display_order ASC`。

### 11.2 SDK 与 OpenAPI 测试

需要覆盖：

1. SDK 请求路径和查询参数正确。
2. SDK 能解析 session 摘要和题目列表。
3. OpenAPI YAML 可解析，新增引用完整。

### 11.3 前端测试

需要覆盖：

1. 从学生详情页的练题记录进入单次练题详情。
2. 单次练题详情加载后展示学生姓名、session 概览和题目内容。
3. 点击返回后回到学生详情页，并保留 `class_id`、`course_id`、`student_user_id`、`start_at`、`end_at`。
4. 参数无效时不调用 API。
5. 接口失败时显示错误态。

## 12. 验收标准

本次补充完成后，应满足：

1. 老师可以从学生详情页进入某次练习详情。
2. 接口不会允许老师查看非任课班级课程、非当前班级学生或不属于该学生课程的 session。
3. 练习详情展示历史题目快照、学生最新答案、正确答案、对错和解析。
4. 前端返回路径能恢复学生详情页上下文。
5. OpenAPI、SDK、前后端测试和阶段状态文档全部同步。

## 13. 后续延伸

本次完成后，下一步可以继续补：

1. 从错题和疑惑题进入完整题目详情。
2. 老师讲评、批注或班级共性错题分析。
3. 单次练习详情导出。
