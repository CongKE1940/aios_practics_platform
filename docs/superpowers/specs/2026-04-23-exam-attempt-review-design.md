# 老师侧考试答卷明细设计

## 目标

在老师考试管理页中，支持从成绩列表进入单个学生的考试答卷，查看本场考试的答卷摘要与按题详情。

## 范围

- 新增老师侧答卷明细查询接口。
- 在老师考试管理页增加“查看答卷”入口。
- 支持按题切换查看题干、学生答案、正确答案、判题结果与得分。

不包含：

- 主观题人工批阅
- 成绩导出
- 更复杂的筛选与排序

## 方案

### 后端

在 `internal/modules/analytics` 中新增老师侧答卷明细接口：

- `GET /api/v1/analytics/exam-attempt-review?attempt_id=...`

权限允许：

- `analytics:view`
- `exam:publish`

返回结构：

- `summary`：学生、考试与 attempt 摘要
- `questions`：按题列表，包含题干、标准答案、学生答案、判题结果与得分

### 前端

在老师考试管理页的成绩列表中：

- 对存在 `attempt_id` 的学生显示“查看答卷”
- 点击后加载单个学生答卷
- 若题目多于一题，显示题号导航
- 默认展示当前题的详情

## 数据来源

- `exam_attempts`
- `exam_paper_questions`
- `exam_attempt_answers`
- `question_versions`
- `users`
- `student_profiles`
- `student_class_memberships`
- `classes`

## 测试策略

- `analytics` handler 内存仓储测试
- `analytics` MySQL sqlmock 仓储测试
- API SDK 请求测试
- 老师考试页交互测试

## 风险与取舍

- 目前老师可查看租户范围内考试答卷，未再细分任课范围，这与现有老师考试管理权限口径一致。
- 答案展示先按现有客观题结构做轻量渲染，复杂题型后续再增强。
