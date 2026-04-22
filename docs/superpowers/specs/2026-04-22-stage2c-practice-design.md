# 阶段 2C 设计：练题核心链路

日期：2026-04-22
状态：已确认方向，待进入实现计划
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 2A 已完成题库、题目、版本与题库下发基础能力。阶段 2B 已完成模板下载、题库/题目导入任务与管理端导入中心。阶段 2C 开始进入用户侧核心体验：选择题库范围后开始练题、提交答案、即时判题，并沉淀错题、熟题和疑惑题状态。

当前系统已具备练题域表：

1. `practice_sessions`
2. `practice_session_questions`
3. `practice_answers`
4. `user_question_states`
5. `user_question_state_logs`

阶段 2C 需要把这些表与题库题目能力串成可验收的最小练题闭环。

## 2. 目标

阶段 2C 的目标是让用户可以从已存在题库中开始练题，并在每次作答后得到明确反馈。

本阶段完成后，应满足：

1. 用户可以选择单题库或多题库范围创建练题会话。
2. 用户可以选择定量练习或连续刷题。
3. 定量练习支持用户自定义题数，未填时默认 10 题。
4. 连续刷题不要求设置题数，用户可一直获取下一题直到主动退出。
5. 支持顺序和随机两种抽题方式。
6. 支持排除已标熟题。
7. 提交答案后立即判题，并返回正确答案和解析。
8. 错题自动进入用户题目状态。
9. 用户可手动标记或取消熟题、疑惑题。
10. 用户端提供最小练题页面完成创建会话、答题、下一题、退出流程。

## 3. 范围

### 3.1 包含范围

1. 后端 `practice` 模块：
   - `POST /api/v1/practice/sessions`
   - `GET /api/v1/practice/sessions/{id}`
   - `POST /api/v1/practice/sessions/{id}/answer`
   - `POST /api/v1/practice/sessions/{id}/next-question`
   - `POST /api/v1/practice/questions/{id}/mark-mastered`
   - `POST /api/v1/practice/questions/{id}/mark-confused`
   - `GET /api/v1/user-question-states`
2. SDK 练题方法。
3. 用户端最小练题页面。
4. 用户端菜单入口：
   - `练题中心` -> `/app/practice`
5. OpenAPI 正式化。
6. 阶段 2C 状态文档。

### 3.2 不包含范围

1. 考试模块。
2. 智能推荐算法。
3. 知识点掌握度算法。
4. 复杂练习报告。
5. 错题专项页。
6. 评论入口。
7. 质疑入口。
8. 练题结果页的完整统计图表。
9. 真实题库可见范围继承算法。

这些内容后续可拆分到练题增强、考试、统计分析和题目协作阶段。

## 4. 关键设计决定

### 4.1 练题流分为定量练习和连续刷题

阶段 2C 新增 `flow_mode` 概念：

1. `fixed_count`：定量练习。
2. `continuous`：连续刷题。

`flow_mode` 暂存于 `practice_sessions.bank_scope_json` 中，不新增表字段。这样可以复用现有 DDL，后续如果练题模式稳定，再评估是否拆成独立列。

`bank_scope_json` 示例：

```json
{
  "flow_mode": "fixed_count",
  "bank_ids": [1, 2],
  "question_count": 10,
  "exclude_mastered": true,
  "random_seed": 20260422
}
```

连续刷题示例：

```json
{
  "flow_mode": "continuous",
  "bank_ids": [1, 2],
  "exclude_mastered": true,
  "random_seed": 20260422,
  "round_no": 1
}
```

### 4.2 定量练习一次性抽题

定量练习创建会话时一次性抽取题目并写入 `practice_session_questions`。

规则：

1. `question_count` 可由用户自定义。
2. 如果用户不传或传 0，默认 10。
3. 如果候选题不足，返回实际可抽题目数量，不因不足失败。
4. 如果没有任何候选题，返回 400，提示当前范围暂无可练习题目。
5. 顺序练习按题库关联顺序和题目 ID 稳定排序。
6. 随机练习使用会话级 seed 打乱，便于排查与复现。

### 4.3 连续刷题按需取下一题

连续刷题创建会话时返回第一题，之后通过 `next-question` 获取下一题。

规则：

1. 不要求设置 `question_count`。
2. 同一轮内尽量不重复出题。
3. 如果当前题库范围内题目已刷完，自动进入下一轮，可以再次出现题目。
4. `display_order` 持续递增，不因进入下一轮重置。
5. 退出连续刷题时，前端可调用结束会话接口；阶段 2C 若不新增结束接口，则通过页面退出保留 `active` 会话，后续再补会话结束。

阶段 2C 建议新增轻量结束接口：

- `POST /api/v1/practice/sessions/{id}/finish`

结束接口只更新 `practice_sessions.status=finished` 和 `ended_at`，不生成复杂报告。

### 4.4 抽题候选范围

候选题来自当前租户下的题库与题目：

1. 题库必须属于当前 `tenant_id`。
2. 题库 `deleted_at IS NULL`。
3. 题目必须属于当前 `tenant_id`。
4. 题目 `status=active` 且 `deleted_at IS NULL`。
5. 题目必须有 `current_version_id`。
6. 如果 `exclude_mastered=true`，排除当前用户 `user_question_states.is_mastered=1` 的题目。

阶段 2C 暂不实现完整题库下发可见范围校验，只校验题库租户隔离。题库可见范围继承在后续权限增强中补齐。

### 4.5 判题范围

阶段 2C 只处理客观题：

1. `single_choice`
2. `multiple_choice`
3. `true_false`

答案结构沿用题目版本中的 `answer_json`。

提交答案请求：

```json
{
  "session_question_id": 9001,
  "answer": {
    "selected_keys": ["B"],
    "value": true
  }
}
```

判题规则：

1. `judge_mode=by_option_key` 时，比较 `selected_keys` 与 `correct_keys`，忽略顺序但不忽略集合差异。
2. `judge_mode=boolean` 时，比较 `value` 与 `correct_value`。
3. 不支持的 `judge_mode` 返回 400。

响应返回：

```json
{
  "is_correct": true,
  "correct_answer": {
    "judge_mode": "by_option_key",
    "correct_keys": ["B"]
  },
  "analysis": {
    "text": "基础算术"
  },
  "state": {
    "practice_correct_count": 1,
    "practice_wrong_count": 0,
    "is_mastered": false,
    "is_confused": false
  }
}
```

### 4.6 用户题目状态更新

每次提交答案：

1. 写入 `practice_answers`。
2. upsert `user_question_states`。
3. 正确时 `practice_correct_count + 1`。
4. 错误时 `practice_wrong_count + 1`，更新 `last_wrong_at`。
5. 始终更新 `last_answer_json`、`last_result`、`question_version_id`。
6. 写入 `user_question_state_logs`，`source_type=practice`。

手动标熟：

1. `POST /practice/questions/{id}/mark-mastered`
2. 请求体：`{"value": true}`
3. 置 `is_mastered` 与 `mastered_at`。
4. 取消标熟时 `is_mastered=false`，`mastered_at=NULL`。

手动标疑惑：

1. `POST /practice/questions/{id}/mark-confused`
2. 请求体：`{"value": true}`
3. 置 `is_confused` 与 `confused_at`。
4. 取消标疑惑时 `is_confused=false`，`confused_at=NULL`。

### 4.7 权限

练题接口使用 `practice:use` 权限。

规则：

1. 无 token 返回 401。
2. 无 `practice:use` 返回 403。
3. 跨租户访问会话或题目状态返回 404。
4. 用户只能访问自己的练题会话和题目状态。

### 4.8 用户端最小页面

阶段 2C 用户端只做一个最小可用入口 `/app/practice`。

页面包含：

1. 题库 ID 输入框，支持逗号分隔多个题库。
2. 练题流选择：
   - 定量练习
   - 连续刷题
3. 题量输入框：
   - 仅定量练习显示。
   - 默认 10。
4. 练题模式：
   - 随机
   - 顺序
5. 排除熟题开关。
6. 开始练题按钮。
7. 题目展示区。
8. 选项选择区。
9. 提交答案按钮。
10. 下一题按钮。
11. 标熟、标疑惑、退出按钮。

页面不做复杂视觉重构，优先保证功能闭环和测试稳定。

## 5. API 设计

### 5.1 创建练题会话

`POST /api/v1/practice/sessions`

请求：

```json
{
  "practice_mode": "random",
  "source_mode": "multi_bank",
  "flow_mode": "fixed_count",
  "bank_ids": [1, 2],
  "exclude_mastered": true,
  "question_count": 10
}
```

响应：

```json
{
  "id": 501,
  "practice_mode": "random",
  "source_mode": "multi_bank",
  "flow_mode": "fixed_count",
  "status": "active",
  "questions": [
    {
      "session_question_id": 9001,
      "question_id": 1001,
      "question_version_id": 3001,
      "display_order": 1,
      "question_type": "single_choice",
      "content": {
        "stem": {
          "content_type": "text",
          "text": "1+1等于几？",
          "assets": []
        },
        "options": [
          {"key": "A", "content_type": "text", "text": "1", "assets": []},
          {"key": "B", "content_type": "text", "text": "2", "assets": []}
        ],
        "option_order_randomizable": true,
        "ext": {}
      }
    }
  ]
}
```

### 5.2 获取会话详情

`GET /api/v1/practice/sessions/{id}`

返回会话信息、已抽题目、已答题目状态。

### 5.3 获取下一题

`POST /api/v1/practice/sessions/{id}/next-question`

用于连续刷题，也允许定量练习在前端需要时获取下一题。

响应：

```json
{
  "question": {
    "session_question_id": 9002,
    "question_id": 1002,
    "question_version_id": 3002,
    "display_order": 2,
    "question_type": "true_false",
    "content": {
      "stem": {
        "content_type": "text",
        "text": "太阳从东方升起。",
        "assets": []
      },
      "ext": {}
    }
  },
  "round_no": 1
}
```

### 5.4 提交答案

`POST /api/v1/practice/sessions/{id}/answer`

请求：

```json
{
  "session_question_id": 9001,
  "answer": {
    "selected_keys": ["B"]
  }
}
```

响应包含判题结果、正确答案、解析和用户题目状态。

### 5.5 结束会话

`POST /api/v1/practice/sessions/{id}/finish`

响应：

```json
{
  "id": 501,
  "status": "finished",
  "answered_count": 8,
  "correct_count": 6,
  "wrong_count": 2
}
```

### 5.6 标熟和标疑惑

`POST /api/v1/practice/questions/{id}/mark-mastered`

`POST /api/v1/practice/questions/{id}/mark-confused`

请求：

```json
{
  "value": true
}
```

### 5.7 用户题目状态列表

`GET /api/v1/user-question-states`

查询参数：

1. `state_type`: `wrong` / `mastered` / `confused`
2. `bank_id`
3. `page`
4. `page_size`

阶段 2C 可先实现 `state_type` 和 `bank_id`，`course_id` 后续在课程练题入口稳定后补。

## 6. 测试策略

### 6.1 后端测试

必须覆盖：

1. 创建定量练习会话默认 10 题。
2. 创建定量练习会话支持用户自定义题数。
3. 创建连续刷题会话不要求题数，并返回第一题。
4. 连续刷题 `next-question` 在一轮内不重复，刷完后进入下一轮。
5. 随机练习使用 seed 产生稳定顺序。
6. 顺序练习按题库关联与题目 ID 稳定排序。
7. 排除熟题。
8. 提交单选、多选、判断答案并返回判题结果。
9. 错题自动更新 `user_question_states`。
10. 标熟和标疑惑可设置与取消。
11. 无 `practice:use` 权限返回 403。
12. 跨租户或访问他人会话返回 404。

### 6.2 SDK 与前端测试

必须覆盖：

1. SDK 创建会话、下一题、提交答案、结束会话、标熟、标疑惑、状态列表路径。
2. 用户端页面可创建定量练习并提交答案。
3. 用户端页面可创建连续刷题并获取下一题。
4. 用户端菜单可进入练题中心。

## 7. 验收标准

阶段 2C 完成时必须通过：

1. `go test -work ./...`
2. `pnpm test`
3. `pnpm typecheck`
4. `pnpm build`
5. OpenAPI 可解析
6. 无异常引用标记
7. 无敏感信息残留
8. 无 UTF-8 BOM 与混合换行

## 8. 后续扩展

阶段 2C 后可继续拆分：

1. 错题专项页。
2. 练题结果页和统计图表。
3. 按课程练题入口。
4. 题库可见范围继承校验。
5. 评论与质疑入口。
6. 智能推荐与知识点掌握度。
7. 考试模块。
