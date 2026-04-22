# 阶段 2E 设计：课程维度练题入口与结果聚合

日期：2026-04-22
状态：已确认方向，待进入实现计划
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 2A 已完成题库与题目管理，阶段 2B 已完成模板导入，阶段 2C 已完成练题核心链路，阶段 2D 已完成练题记录、结果页、错题本、熟题本和疑惑题复习闭环。

当前学生已经可以通过题库 ID 创建练题会话，也可以从错题、熟题、疑惑题列表继续练习。但真实使用场景中，学生更自然的入口通常是“按课程练习”：例如先选择数学，再练习该课程下的可用题库。老师侧后续班级学习页、课程结果聚合和学习数据看板，也需要课程维度作为基础过滤条件。

阶段 2E 的目标是在不引入复杂统计看板的前提下，把课程维度贯穿到练题入口、练题记录和题目状态列表中，为后续老师侧学习分析打底。

## 2. 目标

阶段 2E 完成后，应满足：

1. 学生可以按课程创建练题会话。
2. 按课程练题时，候选题来自该课程下当前租户可用题库中的可用题目。
3. 练题记录列表可按课程筛选，并返回会话关联课程。
4. 练题结果与会话详情保留课程信息，前端可展示来源课程。
5. 错题本、熟题本、疑惑题可按课程筛选。
6. SDK、OpenAPI、前端测试、后端测试与阶段状态文档同步更新。

## 3. 范围

### 3.1 包含范围

1. 后端练题创建增强：
   - `POST /api/v1/practice/sessions` 支持 `course_id`。
   - `source_mode` 新增 `course`。
   - 定量练习和连续刷题都支持课程来源。
2. 后端查询增强：
   - `GET /api/v1/practice/sessions` 支持 `course_id` 查询参数。
   - `GET /api/v1/practice/sessions/{id}` 返回 `course_id`。
   - `GET /api/v1/practice/sessions/{id}/results` 返回会话 `course_id`。
   - `GET /api/v1/user-question-states` 支持 `course_id` 查询参数。
3. SDK 类型和方法增强：
   - 创建练题会话请求体增加 `course_id`。
   - 练题会话详情、列表项、结果摘要增加 `course_id`。
   - 状态列表查询参数增加 `course_id`。
4. 学生端页面增强：
   - 练题中心支持课程来源。
   - 练题记录支持课程筛选。
   - 错题本、熟题本、疑惑题支持课程筛选。
   - 结果页和会话详情展示课程来源。
5. RBAC 菜单不新增一级入口，继续复用现有练题相关菜单。
6. OpenAPI 与说明文档更新。
7. 新增阶段 2E 实施状态文档。

### 3.2 不包含范围

1. 老师班级学习页。
2. 老师查看学生练题详情。
3. 课程卡片式首页和完整“我的课程”页面。
4. 课程维度趋势图、排行榜、班级对比。
5. 知识点掌握度算法。
6. 智能推荐抽题。
7. 考试错题与练题错题联动。
8. 完整题库下发可见范围继承算法。
9. 新增统计冗余表或异步聚合任务。

这些能力后续拆到老师学习页、统计分析、考试闭环和权限增强阶段。

## 4. 关键设计决定

### 4.1 课程练题作为一种来源模式

阶段 2E 将课程练题定义为新的 `source_mode`：

1. `single_bank`：单题库。
2. `multi_bank`：多题库。
3. `question_list`：指定题目列表。
4. `course`：指定课程。

课程来源请求示例：

```json
{
  "practice_mode": "random",
  "source_mode": "course",
  "flow_mode": "fixed_count",
  "course_id": 12,
  "exclude_mastered": true,
  "question_count": 10
}
```

课程来源会话仍写入 `practice_sessions.course_id`，并在 `bank_scope_json` 中保存：

```json
{
  "flow_mode": "fixed_count",
  "source_mode": "course",
  "course_id": 12,
  "exclude_mastered": true,
  "question_count": 10,
  "random_seed": 20260422,
  "round_no": 1
}
```

这样可以沿用现有会话表结构，并保持列表、结果和后续聚合可直接读取 `course_id`。

### 4.2 课程候选题来自课程下可用题库

阶段 2E 的课程练题候选范围定义为：

1. `courses.id = course_id`。
2. 课程属于当前 `tenant_id`，且未删除。
3. 题库属于当前 `tenant_id`，未删除。
4. 题库 `course_id = course_id`。
5. 题库状态必须为当前系统已发布可用口径 `active`。
6. 题目属于当前 `tenant_id`，`status=active`，未删除，存在当前版本。
7. 如果 `exclude_mastered=true`，排除当前用户已标熟题。

阶段 2E 不实现跨组织下发可见范围继承，只保持租户隔离和课程归属过滤。完整可见范围继承后续单独设计。

### 4.3 定量练习和连续刷题都支持课程来源

定量练习规则沿用阶段 2C：

1. `question_count` 可由用户自定义。
2. `question_count` 未传或小于等于 0 时默认 10。
3. 候选题不足时返回实际候选题量。
4. 候选题为空时返回明确无候选错误。

连续刷题规则沿用阶段 2C：

1. 不要求设置题量。
2. 同一轮内尽量不重复出题。
3. 当前课程范围刷完后自动进入下一轮。
4. `round_no` 递增。
5. 用户主动退出时调用结束会话接口。

### 4.4 会话与状态列表按课程过滤

练题记录列表增加 `course_id` 查询参数：

```text
GET /api/v1/practice/sessions?course_id=12&page=1&page_size=20
```

规则：

1. 只返回当前用户自己的会话。
2. 继续按 `tenant_id + user_id` 隔离。
3. 如果传入 `course_id`，只返回该课程下的会话。
4. 可以与 `status`、`flow_mode`、`practice_mode` 组合筛选。

用户题目状态列表增加 `course_id` 查询参数：

```text
GET /api/v1/user-question-states?state_type=wrong&course_id=12
```

规则：

1. 基于题目当前所属题库的课程过滤。
2. 一道题如果存在于多个题库，任一可用题库匹配该课程即可进入结果。
3. 仍可与 `bank_id` 组合；同时传 `course_id` 和 `bank_id` 时取交集。

### 4.5 前端先做最小课程入口

阶段 2E 不建设完整“我的课程”页面，先在现有练题中心和复习页面增加最小课程筛选控件。

练题中心增强：

1. 来源选择：
   - 题库 ID。
   - 课程 ID。
2. 选择课程 ID 后，创建会话传：
   - `source_mode=course`
   - `course_id=<用户输入>`
   - 不传 `bank_ids`
3. 定量练习仍显示题量输入，默认 10。
4. 连续刷题仍不显示题量输入。

练题记录增强：

1. 增加课程 ID 筛选输入。
2. 会话列表展示课程 ID。

错题本、熟题本、疑惑题增强：

1. 增加课程 ID 筛选输入。
2. 继续练习时只使用当前筛选结果的题目 ID。

结果页和会话详情增强：

1. 如果会话存在 `course_id`，展示课程 ID。
2. 阶段 2E 暂不强制展示课程名称，避免额外引入课程详情接口依赖。

## 5. API 设计

### 5.1 创建课程练题会话

复用：

`POST /api/v1/practice/sessions`

请求：

```json
{
  "practice_mode": "random",
  "source_mode": "course",
  "flow_mode": "fixed_count",
  "course_id": 12,
  "exclude_mastered": true,
  "question_count": 10
}
```

响应沿用 `PracticeSessionDetail`，并补充或保持：

```json
{
  "id": 501,
  "practice_mode": "random",
  "source_mode": "course",
  "flow_mode": "fixed_count",
  "course_id": 12,
  "status": "active",
  "questions": []
}
```

校验规则：

1. `source_mode=course` 时 `course_id` 必填且大于 0。
2. `course_id` 不属于当前租户或已删除时返回 400 或 404。推荐返回 404，避免暴露跨租户资源存在性。
3. 没有候选题时返回 `CodeNoCandidates`。
4. 仍要求 `practice:use` 权限。

### 5.2 练题记录课程筛选

`GET /api/v1/practice/sessions`

新增查询参数：

1. `course_id`：可选，正整数。

响应列表项增加：

```json
{
  "id": 501,
  "course_id": 12,
  "status": "finished",
  "flow_mode": "fixed_count",
  "practice_mode": "random",
  "source_mode": "course",
  "answered_count": 10,
  "correct_count": 8,
  "wrong_count": 2,
  "accuracy": 0.8
}
```

### 5.3 会话详情与结果

`GET /api/v1/practice/sessions/{id}`

`GET /api/v1/practice/sessions/{id}/results`

规则：

1. 会话摘要返回 `course_id`。
2. 跨租户或其他用户会话仍返回 404。
3. 题目明细结构不因课程来源变化而改变。

### 5.4 用户题目状态课程筛选

`GET /api/v1/user-question-states`

新增查询参数：

1. `course_id`：可选，正整数。

示例：

```text
GET /api/v1/user-question-states?state_type=wrong&course_id=12&page=1&page_size=20
```

响应结构不变，继续返回题目展示信息。

## 6. 数据库与仓库设计

阶段 2E 不新增 migration。

原因：

1. `practice_sessions.course_id` 已存在。
2. `question_banks.course_id` 已存在。
3. `practice_sessions.bank_scope_json` 已用于保存练题流配置。
4. 课程过滤可以通过现有表关联完成。

仓库层需要补齐：

1. 课程存在性检查：
   - 按 `tenant_id + course_id + deleted_at IS NULL` 查询。
2. 课程候选题查询：
   - 基于 `question_banks.course_id` 过滤。
3. 会话列表过滤：
   - `practice_sessions.course_id = ?`。
4. 用户题目状态过滤：
   - `EXISTS` 关联 `question_bank_items` 与 `question_banks`，并检查 `question_banks.course_id = ?`。

性能注意：

1. 课程状态列表过滤会引入 `EXISTS` 查询，阶段 2E 数据量较小时可接受。
2. 后续若数据量增长，应为 `question_banks(tenant_id, course_id)` 与 `question_bank_items(tenant_id, question_id)` 增补索引。
3. 阶段 2E 不新增索引 migration，除非测试或查询计划显示现有结构无法接受。

## 7. 权限与异常处理

### 7.1 权限

所有阶段 2E 能力继续要求 `practice:use` 权限。

规则：

1. 无 token 返回 401。
2. 无 `practice:use` 返回 403。
3. 课程不存在、跨租户或已删除时返回 404。
4. 访问其他用户会话或状态返回 404。

### 7.2 异常处理

1. 课程 ID 为空：创建课程练题会话返回 400。
2. 课程不存在：返回 404。
3. 课程下无可练题目：返回无候选错误。
4. 课程筛选下记录为空：前端展示空态。
5. 课程 ID 输入不是正整数：前端先提示，后端仍做兜底校验。

## 8. 测试策略

### 8.1 后端测试

必须覆盖：

1. 使用 `source_mode=course` 创建定量练习会话。
2. 使用 `source_mode=course` 创建连续刷题会话并获取下一题。
3. 课程练题只抽取该课程下题库的题目。
4. `exclude_mastered=true` 对课程练题生效。
5. 课程不存在或跨租户返回 404。
6. 课程下无候选题返回 `CodeNoCandidates`。
7. 练题记录列表按 `course_id` 筛选。
8. 用户题目状态列表按 `course_id` 筛选。
9. 同时传 `course_id` 和 `bank_id` 时取交集。
10. 跨用户访问课程会话仍返回 404。

### 8.2 SDK 测试

必须覆盖：

1. `createPracticeSession` 可以发送 `source_mode=course` 与 `course_id`。
2. `listPracticeSessions` 可以携带 `course_id` 查询参数。
3. `getPracticeSession` 和 `getPracticeSessionResults` 类型包含 `course_id`。
4. `listUserQuestionStates` 可以携带 `course_id` 查询参数。

### 8.3 前端测试

必须覆盖：

1. 练题中心选择课程来源后创建课程练题会话。
2. 定量练习课程来源默认题量为 10。
3. 连续刷题课程来源不发送题量。
4. 练题记录页按课程 ID 筛选。
5. 错题本、熟题本、疑惑题按课程 ID 筛选。
6. 结果页或会话详情展示课程 ID。

## 9. 验收标准

阶段 2E 完成时必须满足：

1. 学生可按课程开始定量练习。
2. 学生可按课程开始连续刷题。
3. 课程练题不会抽到其他课程题库的题目。
4. 练题记录可按课程筛选。
5. 错题本、熟题本、疑惑题可按课程筛选。
6. 练题结果和会话详情能展示课程来源。
7. `go test -work ./...` 通过。
8. `pnpm test` 通过。
9. `pnpm typecheck` 通过。
10. `pnpm build` 通过。
11. OpenAPI YAML 可解析。
12. 无异常引用标记。
13. 无敏感信息残留。
14. 无 UTF-8 BOM 与混合换行。

## 10. 后续扩展

阶段 2E 后可继续拆分：

1. 老师班级学习页。
2. 课程维度学习统计图表。
3. 我的课程页面和课程卡片入口。
4. 题库可见范围继承校验。
5. 知识点掌握度。
6. 错题专项强化训练。
7. 考试错题联动。
8. 学习数据导出。
