# 阶段 2F 设计补充：老师讲评（单题详情页）

日期：2026-04-23
状态：已确认设计，进入实现

## 1. 背景

当前老师侧已支持从班级学习页下钻到学生单题详情页，但该页仍是只读。老师无法在当前题目上沉淀讲评内容，导致反馈闭环不完整。

## 2. 目标

本次补齐最小可用讲评能力：

1. 老师可在单题详情页输入并保存讲评内容。
2. 同一老师对同一道 `session_question` 仅保留一条讲评记录，支持反复更新。
3. 讲评数据遵循老师侧 analytics 范围校验，不允许跨班级、跨课程、跨会话写入。
4. 单题详情接口返回当前登录老师在该题上的讲评内容。

## 3. 非目标

本次不包含：

1. 多老师线程式讨论与回复。
2. 讲评历史版本与审计时间线。
3. 讲评对学生端展示与通知推送。
4. 讲评附件上传与富文本格式。

## 4. 数据设计

新增表：`practice_session_question_reviews`

核心字段：

- `tenant_id`
- `class_id`
- `course_id`
- `student_user_id`
- `session_id`
- `session_question_id`
- `teacher_user_id`
- `review_comment`
- `status`
- `created_at`
- `updated_at`

唯一键：

- `(tenant_id, session_question_id, teacher_user_id)`

说明：以“老师 + 会话题目”为唯一维度，覆盖更新。

## 5. 接口设计

### 5.1 查询单题详情（扩展）

`GET /api/v1/analytics/student-practice-session-question-detail`

新增返回字段：

- `teacher_review`（可选）：
  - `review_id`
  - `reviewer_user_id`
  - `review_comment`
  - `updated_at`

### 5.2 保存讲评

`PUT /api/v1/analytics/student-practice-session-question-review`

请求体：

- `class_id`
- `course_id`
- `student_user_id`
- `session_id`
- `session_question_id`
- `review_comment`

返回：

- 当前保存后的讲评对象。

## 6. 权限与口径

1. 需登录且具备 `analytics:view`。
2. `teacher`：仅可写入自己当前任课的班级课程。
3. `sys_admin`、`school_admin`：按租户边界可写。
4. 必须满足：学生归属班级、会话归属学生课程、题目归属会话。
5. `review_comment` 必填，去首尾空白后不能为空。

## 7. 前端交互

在 `StudentPracticeSessionQuestionDetailPage` 新增：

1. “老师讲评”文本输入区域。
2. “保存讲评”按钮。
3. 保存成功提示与失败提示。
4. 页面加载时回填已有讲评（若存在）。

## 8. 验收标准

1. 老师在单题详情页可保存讲评，并可再次编辑覆盖。
2. 刷新后可读取刚保存的讲评内容。
3. 非授权范围写入返回 `403` 或 `404`，不会写入非法数据。
4. OpenAPI、SDK、前后端测试同步通过。
