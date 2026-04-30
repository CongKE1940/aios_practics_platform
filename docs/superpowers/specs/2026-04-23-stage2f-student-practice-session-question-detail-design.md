# 阶段 2F 设计补充：老师侧单题完整详情页

日期：2026-04-23
状态：已确认设计，待进入实现计划

## 1. 背景

阶段 2F 已完成老师侧班级学习页、学生学习详情页、单次练题详情页。老师已经可以看到某次练习里的题目列表与作答结果，但仍无法继续回答“这道题的完整展示内容是什么、学生具体提交了什么、标准答案与解析细节是什么”。

为了补齐老师侧学习分析闭环，本次设计聚焦从单次练题详情页继续下钻到“单题完整详情页”，并保持老师侧只读权限边界。

## 2. 目标

本次补充设计完成后，应满足：

1. 老师可在单次练题详情页点击某道题进入完整题目详情页。
2. 题目详情页只展示当前 `class_id + course_id + student_user_id + session_id + session_question_id` 对应数据。
3. 页面展示该题完整信息：题干/选项内容、学生答案、正确答案、解析、作答时间、对错状态。
4. 后端新增老师侧 analytics 只读接口，不复用学生本人练题详情权限口径。
5. 前端支持返回单次练题详情页，并保留原上下文参数。
6. OpenAPI、SDK、后端测试、前端测试和阶段状态文档同步更新。

## 3. 非目标

本次补充设计不包括：

1. 老师讲评、批注、重新判分或修订学生答案。
2. 题目历史作答轨迹、状态变更日志。
3. 从错题/疑惑题列表直接进入完整题目详情。
4. 题目导出或报告导出。
5. 跨班级、跨课程、跨租户读取题目详情。

## 4. 设计方案对比

### 方案 A：新增 analytics 单题详情接口与页面（推荐）

在 analytics 模块新增老师侧只读单题详情接口，并在用户端新增题目详情页面。

优点：

1. 权限边界清晰，老师视角与学生本人视角不会混用。
2. 单次练题详情页和单题详情页解耦，响应体更稳定。
3. 后续增加讲评或扩展字段时演进成本更低。

缺点：

1. 需要新增接口、SDK 类型、OpenAPI 契约和测试。

### 方案 B：复用单次练题详情接口并返回完整单题结构

优点：

1. 接口数量看起来更少。

缺点：

1. 单次详情接口会变重，列表场景与详情场景耦合。
2. 前端分页与缓存策略更复杂，后续维护成本高。

### 方案 C：复用学生端 `practice` 题目结果接口

优点：

1. 表面新增代码较少。

缺点：

1. 学生端接口是 `practice:use` 本人权限语义，不适合老师视角。
2. 容易引入越权风险，且任课校验边界不在 practice 模块内。

结论：采用方案 A。

## 5. 页面路径与上下文

新增用户端路径：

- `/app/class-learning/student/session/question`

路径采用查询参数传递上下文：

- `class_id`：必填
- `course_id`：必填
- `student_user_id`：必填
- `session_id`：必填
- `session_question_id`：必填
- `start_at`：可选，用于返回链路恢复
- `end_at`：可选，用于返回链路恢复

返回路径：

- 返回单次练题详情页：
  `/app/class-learning/student/session?class_id=...&course_id=...&student_user_id=...&session_id=...&start_at=...&end_at=...`

## 6. 数据范围与权限口径

本次接口固定为老师侧 analytics 只读视角。请求必须满足：

1. access token 具备 `analytics:view`。
2. `class_id`、`course_id`、`student_user_id`、`session_id`、`session_question_id` 都是正整数。
3. `class_id + course_id` 在当前租户内存在且有效。
4. `student_user_id` 当前属于该 `class_id` 且归属为 current/active。
5. `session_id` 属于该 `student_user_id`、`course_id` 和当前租户。
6. `session_question_id` 属于该 `session_id`。

老师范围：

1. `teacher` 仅能查看自己当前任课的 `class_id + course_id`。
2. `sys_admin` 和 `school_admin` 按当前 token 租户范围查看。

错误口径：

1. 无 token 或 token 无效返回 `401`。
2. 无 `analytics:view` 或老师未任课返回 `403`。
3. 班级课程不存在、学生不在班级、session 归属不匹配或 session_question 不属于该 session 返回 `404`。
4. 参数格式错误返回 `400`。

## 7. 后端接口设计

新增正式接口：

- `GET /api/v1/analytics/student-practice-session-question-detail`

请求参数：

- `class_id`：必填，正整数
- `course_id`：必填，正整数
- `student_user_id`：必填，正整数
- `session_id`：必填，正整数
- `session_question_id`：必填，正整数

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
    "finished_at": "2026-04-23T10:20:00+08:00",
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
  "question_detail": {
    "session_question_id": 70001,
    "question_id": 1001,
    "question_version_id": 3001,
    "display_order": 1,
    "question_type": "single_choice",
    "content": {
      "stem": {
        "type": "text",
        "text": "1+1 等于几？"
      },
      "options": [
        { "key": "A", "text": "1" },
        { "key": "B", "text": "2" }
      ]
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
}
```

## 8. 数据查询口径

### 8.1 session 归属校验

```sql
practice_sessions.tenant_id = :tenant_id
AND practice_sessions.id = :session_id
AND practice_sessions.user_id = :student_user_id
AND practice_sessions.course_id = :course_id
```

### 8.2 session_question 归属校验

```sql
practice_session_questions.id = :session_question_id
AND practice_session_questions.session_id = :session_id
```

### 8.3 内容、答案与解析

1. 题目内容、正确答案、解析优先使用 `practice_session_questions.presented_options_json` 快照。
2. 若快照字段缺失，再回退 `question_versions` 对应字段。
3. 学生答案按 `session_question_id + user_id` 取 `MAX(id)` 对应最新答案。

## 9. 前端页面设计

新增组件：

- `apps/user-web/src/student-practice-session-question-detail-page.tsx`

组件 props：

```ts
export interface StudentPracticeSessionQuestionDetailApi {
  getStudentPracticeSessionQuestionDetail(
    query: StudentPracticeSessionQuestionDetailQuery
  ): Promise<StudentPracticeSessionQuestionDetailResult>;
}

interface StudentPracticeSessionQuestionDetailPageProps {
  api: StudentPracticeSessionQuestionDetailApi;
  path: string;
  onNavigate(path: string): void;
}
```

页面结构：

1. 返回按钮：返回单次练题详情页。
2. 标题区：学生姓名 + 第 N 题。
3. 概览区：班级、课程、session 状态、作答结果、作答时间。
4. 内容区：题干/选项、学生答案、正确答案、解析。
5. 错误态：参数无效显示“题目详情参数无效。”；接口失败显示“题目详情加载失败，请稍后重试。”

入口改造：

1. 在 `student-practice-session-detail-page` 每道题增加“查看题目详情”按钮。
2. 按钮跳转到 `/app/class-learning/student/session/question?...` 并携带上下文参数。

## 10. SDK 与 OpenAPI

SDK 新增：

```ts
export interface StudentPracticeSessionQuestionDetailQuery {
  class_id: number;
  course_id: number;
  student_user_id: number;
  session_id: number;
  session_question_id: number;
}

getStudentPracticeSessionQuestionDetail(
  query: StudentPracticeSessionQuestionDetailQuery
): Promise<StudentPracticeSessionQuestionDetailResult>;
```

OpenAPI 新增：

1. `GET /analytics/student-practice-session-question-detail`
2. `operationId: getStudentPracticeSessionQuestionDetail`
3. `StudentPracticeSessionQuestionDetailResponse`
4. `StudentPracticeSessionQuestionDetailResult`
5. `StudentPracticeSessionQuestionDetailItem`

## 11. 测试策略

### 11.1 后端测试

需要覆盖：

1. 老师查看自己任课班级课程下单题详情成功。
2. 老师未任课返回 `403`。
3. 学生不属于班级返回 `404`。
4. session 归属不匹配返回 `404`。
5. session_question 不属于 session 返回 `404`。
6. 参数非法返回 `400`。
7. 仓储按最新作答口径返回学生答案。

### 11.2 SDK 与 OpenAPI 测试

需要覆盖：

1. SDK 请求路径和查询参数正确。
2. SDK 能解析 `question_detail` 字段。
3. OpenAPI YAML 可解析，新增引用完整。

### 11.3 前端测试

需要覆盖：

1. 从单次练题详情页点击“查看题目详情”进入新页面。
2. 页面加载后展示题干、学生答案、正确答案、解析与结果。
3. 点击返回后回到单次练题详情页并保留上下文。
4. 参数无效时不调用 API。
5. 接口失败时显示错误态。

## 12. 验收标准

本次补充完成后，应满足：

1. 老师可从单次练题详情页进入单题完整详情页。
2. 接口不会允许老师查看非任课班级课程或不属于目标 session 的题目。
3. 页面展示题目完整只读信息，且优先反映练题时快照内容。
4. 返回链路能恢复单次练题详情页上下文。
5. OpenAPI、SDK、前后端测试与阶段状态文档全部同步。

## 13. 后续延伸

本次完成后可继续补：

1. 从错题/疑惑题列表直接进入完整题目详情。
2. 题目详情中的老师讲评和批注能力。
3. 单题作答历史轨迹和状态变更时间线。
