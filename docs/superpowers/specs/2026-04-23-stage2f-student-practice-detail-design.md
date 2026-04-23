# 阶段 2F 设计补充：老师侧学生学习详情页

日期：2026-04-23
状态：已确认设计，待进入实现计划

## 1. 背景

阶段 2F 已完成老师侧班级学习页，老师可以在当前任课范围内选择班级和课程，查看班级汇总与学生明细。这条链路已经能回答“这个班整体练得怎么样”，但还无法继续回答“某个学生具体错在哪里、最近练了哪些记录、哪些题仍处于疑惑状态”。

当前限制已经在阶段状态文档中明确：班级学习页暂不支持学生详情跳转。为了把老师侧学习分析链路继续补完整，本次补充设计聚焦一个最小但正式可用的学生详情页，让老师能够从班级学习页继续下钻到单个学生的学习详情。

## 2. 目标

本次补充设计完成后，应满足：

1. 老师可以从班级学习页点击某个学生，进入该学生的学习详情页。
2. 详情页只展示“当前已选班级 + 当前已选课程”下的数据。
3. 详情页顶部展示学生概览信息，包括练题次数、答题数、正确率、错题数、疑惑题数和最近练题时间。
4. 详情页主体使用标签页切换三类内容：`练题记录`、`错题`、`疑惑题`。
5. 后端新增正式接口，统一提供老师视角的学生详情数据，并继续复用当前 analytics 权限口径。
6. 前端支持返回班级学习页，并尽量保留原有班级课程和时间筛选上下文。
7. OpenAPI、SDK、后端测试、前端测试和阶段状态文档同步更新。

## 3. 非目标

本次补充设计不包括：

1. 趋势图、导出、知识点分析、题型分析或考试分析。
2. 跨课程或跨班级查看学生数据。
3. 老师直接修改学生题目状态。
4. 题目评论、质疑、讲评与批注。
5. 继续下钻到完整题目详情页之外的更复杂教师工作台。

## 4. 设计方案对比

### 方案 A：新增老师侧学生学习详情专用接口与页面（推荐）

从班级学习页进入新的详情路径，后端新增老师侧学生详情接口，统一返回学生概览和当前标签页数据。

优点：

1. 权限边界清晰，天然复用班级学习页的老师任课校验。
2. 前端路径、刷新恢复、返回逻辑都更稳定。
3. 后续继续扩展趋势、题目详情或更多标签页时不需要推倒重来。

缺点：

1. 需要新增 analytics 接口与 SDK 契约。
2. 用户端页面映射要新增一个正式路径。

### 方案 B：复用现有练题记录/错题本/疑惑题接口，由前端拼接老师视角

优点：

1. 后端表面上改动较少。

缺点：

1. 当前练题记录和状态接口是“当前登录用户本人”口径，不适合老师查看学生。
2. 权限语义混乱，容易产生越权或错误复用。
3. 后续维护成本高。

### 方案 C：在班级学习页内用抽屉或弹层承载学生详情

优点：

1. 页面跳转最少。

缺点：

1. 内容一多就拥挤，状态管理和刷新恢复都不稳定。
2. 未来继续加筛选、分页、返回和分享都更别扭。

结论：采用方案 A。

## 5. 核心设计

### 5.1 页面路径与上下文

新增用户端路径：

- `/app/class-learning/student`

路径采用查询参数传递上下文：

- `class_id`
- `course_id`
- `student_user_id`
- `start_at` 可选
- `end_at` 可选
- `tab` 可选，取值为 `sessions` / `wrong` / `confused`

设计原因：

1. 刷新页面后可以恢复当前学生详情上下文。
2. 返回班级学习页时可以继续带回原筛选条件。
3. 不强依赖额外路由库，延续当前 `selectedPath` 风格也能实现。

### 5.2 数据范围与权限口径

本次数据范围固定为：

1. 只看当前 `class_id + course_id` 下的学生学习数据。
2. 不扩展到该学生其他课程。
3. 不扩展到该学生其他班级或全租户数据。

权限口径沿用班级学习页：

1. 所有接口继续要求 `analytics:view`。
2. `teacher` 仅能查看自己当前任课的 `class_id + course_id`。
3. `sys_admin` 与 `school_admin` 按当前租户范围查看。
4. 还要额外校验 `student_user_id` 当前属于该 `class_id` 的 `current` 班级归属。

如果任一校验失败：

1. 无权限返回 `403`。
2. 班级课程不存在或学生不属于当前班级返回 `404`。

### 5.3 后端接口设计

新增正式接口：

- `GET /api/v1/analytics/student-practice-detail`

请求参数：

- `class_id`：必填，正整数
- `course_id`：必填，正整数
- `student_user_id`：必填，正整数
- `tab`：可选，默认 `sessions`
- `page`：可选，默认 `1`
- `page_size`：可选，默认 `20`
- `start_at`：可选，RFC3339
- `end_at`：可选，RFC3339

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
    "course_name": "数学",
    "session_count": 6,
    "answered_count": 48,
    "correct_count": 36,
    "wrong_count": 12,
    "accuracy": 0.75,
    "wrong_question_count": 4,
    "confused_question_count": 2,
    "last_practiced_at": "2026-04-23T10:30:00+08:00"
  },
  "active_tab": "sessions",
  "sessions": {
    "items": [],
    "page": 1,
    "page_size": 20,
    "total": 0
  },
  "wrong_questions": {
    "items": [],
    "page": 1,
    "page_size": 20,
    "total": 0
  },
  "confused_questions": {
    "items": [],
    "page": 1,
    "page_size": 20,
    "total": 0
  }
}
```

返回规则：

1. `student_summary` 始终返回。
2. `active_tab` 返回后端最终识别的当前标签页。
3. 只有当前标签页对应的分页结果填充真实数据；其余两个列表返回空分页结构，避免前端为 `undefined` 写额外兼容。

### 5.4 详情页三个标签页的数据口径

#### 5.4.1 `sessions`

展示该学生在当前班级课程下的练题记录列表，按最近练题时间倒序。

建议字段：

- `session_id`
- `started_at`
- `finished_at`
- `status`
- `total_count`
- `answered_count`
- `correct_count`
- `wrong_count`
- `accuracy`

#### 5.4.2 `wrong`

展示该学生在当前班级课程下的错题列表，按最近错题时间倒序。

建议字段：

- `question_id`
- `question_version_id`
- `question_type`
- `stem`
- `practice_wrong_count`
- `last_wrong_at`
- `last_result`
- `is_confused`

这里延续现有 `user_question_states` 语义，只是查询对象从“当前用户本人”切换为老师视角下的指定学生。

#### 5.4.3 `confused`

展示该学生在当前班级课程下的疑惑题列表，按最近疑惑时间倒序。

建议字段：

- `question_id`
- `question_version_id`
- `question_type`
- `stem`
- `practice_wrong_count`
- `is_confused`
- `confused_at`
- `last_result`

### 5.5 仓储与服务层设计

在 `internal/modules/analytics` 内新增以下模型与查询能力：

1. `StudentPracticeDetailQuery`
2. `StudentPracticeSummary`
3. `StudentPracticeSessionItem`
4. `StudentPracticeQuestionItem`
5. `StudentPracticeDetailResult`

仓储接口建议新增：

1. `StudentBelongsToClass(ctx, tenantID, classID, studentUserID) (bool, error)`
2. `GetStudentPracticeSummary(ctx, query) (StudentPracticeSummary, error)`
3. `ListStudentPracticeSessions(ctx, query) (PageResult[StudentPracticeSessionItem], error)`
4. `ListStudentWrongQuestions(ctx, query) (PageResult[StudentPracticeQuestionItem], error)`
5. `ListStudentConfusedQuestions(ctx, query) (PageResult[StudentPracticeQuestionItem], error)`

服务层处理顺序：

1. 校验 `analytics:view` 权限与 `tab` 合法性。
2. 复用时间范围标准化逻辑。
3. 校验班级课程存在。
4. 按用户类型执行老师任课或租户范围校验。
5. 校验学生当前属于该班级。
6. 查询 `student_summary`。
7. 只查询当前标签页的分页数据。

### 5.6 前端页面设计

新增页面组件，例如：

- `StudentLearningDetailPage`

页面结构：

1. 返回区：返回“班级学习”
2. 标题区：学生姓名、学号、班级、课程
3. 概览区：练题次数、答题数、正确率、错题数、疑惑题数、最近练题时间
4. 标签区：
   - `练题记录`
   - `错题`
   - `疑惑题`
5. 内容区：根据标签页展示对应列表

交互规则：

1. 从班级学习页点击学生姓名或“查看详情”按钮进入。
2. 进入详情页时携带当前 `class_id`、`course_id`、`student_user_id` 与日期范围。
3. 标签切换时更新路径中的 `tab`，并重新请求详情接口。
4. 返回班级学习页时尽量恢复原筛选。
5. 若参数缺失或非法，前端直接展示错误提示，不发起无意义请求。

### 5.7 与现有班级学习页的衔接

`ClassLearningPage` 中学生列表需要补一条详情入口：

1. 点击学生姓名进入详情页；或
2. 增加明确的“查看详情”按钮。

本次推荐两个入口都支持，但至少保证“查看详情”按钮存在，避免纯文本姓名不够明确。

构建跳转参数时应带上：

- `class_id`
- `course_id`
- `student_user_id`
- `start_at`
- `end_at`
- 默认 `tab=sessions`

### 5.8 错误态与空态

后端错误口径：

1. 参数非法：`400`
2. 无权限：`403`
3. 班级课程不存在或学生不在当前班级：`404`

前端页面状态：

1. 加载中：显示“正在加载学生学习详情...”
2. 无记录：对应标签页显示空态文案
3. 无权限：显示“暂无权限查看该学生详情”
4. 请求失败：显示“学生学习详情加载失败，请稍后重试”

### 5.9 OpenAPI 与 SDK

本次需要同步更新：

1. `docs/api/openapi.yaml`
2. `docs/docs/openapi_design_v1.md`
3. `packages/api-sdk`

SDK 至少新增：

1. `getStudentPracticeDetail(query)`
2. 对应类型：
   - `StudentPracticeDetailQuery`
   - `StudentPracticeDetailResult`
   - `StudentPracticeSummary`
   - `StudentPracticeSessionItem`
   - `StudentPracticeQuestionItem`

## 6. 测试设计

### 6.1 后端测试

需要覆盖：

1. 老师查看自己任课班级课程下学生详情成功。
2. 老师查看非自己任课班级课程时返回 `403`。
3. 学生不属于当前班级时返回 `404`。
4. `tab=sessions` 返回练题记录列表。
5. `tab=wrong` 返回错题列表。
6. `tab=confused` 返回疑惑题列表。
7. 非法 `tab`、非法 ID、非法时间范围返回 `400`。

### 6.2 前端测试

需要覆盖：

1. 从班级学习页点击学生后跳到详情页。
2. 详情页加载默认 `sessions` 标签页。
3. 点击切换到 `错题`、`疑惑题` 时会重新请求对应 `tab`。
4. 返回按钮能回到班级学习页。
5. 空态、错误态、无权限态显示正常。

## 7. 验收标准

本次补充设计完成时必须满足：

1. 老师可以从班级学习页进入学生详情页。
2. 详情页只显示当前班级课程范围下的数据。
3. 顶部概览、练题记录、错题、疑惑题三类信息可查看。
4. 权限、班级归属、参数和时间范围校验完整。
5. OpenAPI、SDK、后端测试、前端测试和阶段状态文档同步更新。

## 8. 风险与后续演进

当前风险：

1. 错题与疑惑题列表如果直接携带完整题干，后续数据量上来后可能需要补更细的分页或摘要字段控制。
2. 页面路径仍采用当前无正式路由库的模式，后续页面继续增多时，建议再评估更完整的路由治理。

后续可继续演进：

1. 从学生详情页继续下钻到单次练题详情。
2. 对错题和疑惑题增加题目详情弹层或正式详情页。
3. 增加学习趋势、薄弱题型和导出能力。
