# 阶段 2D 设计：练题记录与复习闭环

日期：2026-04-22
状态：已确认方向，待进入实现计划
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 2A 已完成题库与题目管理，阶段 2B 已完成模板导入，阶段 2C 已完成练题核心链路：创建练题会话、抽题、提交答案、即时判题、标熟、标疑惑和用户题目状态沉淀。

阶段 2D 的目标是补齐学生端练后的复习闭环，让学生不只是能“开始练”，还能在练完后回看结果、复盘历史、进入错题本/熟题本/疑惑题，并从这些列表继续发起新一轮练习。

本阶段聚焦学生端，不纳入老师查看学生练题情况。老师侧班级学习页、班级对比和统计分析后续单独设计。

## 2. 目标

阶段 2D 完成后，应满足：

1. 学生结束一轮练习后可以进入轻量结果页。
2. 学生可以按会话维度查看历史练题记录。
3. 学生可以进入某次会话详情，回看题目、自己的答案、正确答案、解析和题目状态。
4. 学生可以打开错题本、熟题本、疑惑题列表。
5. 学生可以从错题本、熟题本、疑惑题的当前筛选结果继续练习。
6. 所有练题记录、结果明细和题目状态均限制在当前 `tenant_id + user_id` 范围内。
7. OpenAPI、SDK、后端测试、前端测试和阶段状态文档同步更新。

## 3. 范围

### 3.1 包含范围

1. 后端练题查询能力：
   - `GET /api/v1/practice/sessions`
   - `GET /api/v1/practice/sessions/{id}/results`
   - `POST /api/v1/practice/sessions/from-questions`
   - 增强 `GET /api/v1/user-question-states`
2. SDK 新增练题记录、会话结果、从题目继续练相关方法和类型。
3. 学生端新增页面：
   - 练题结果页
   - 练题记录页
   - 练题会话详情页
   - 错题本
   - 熟题本
   - 疑惑题列表
4. 学生端导航扩展：
   - 练题中心
   - 练题记录
   - 错题本
   - 熟题本
   - 疑惑题
5. OpenAPI 正式化与设计说明更新。
6. 阶段 2D 实施状态文档。

### 3.2 不包含范围

1. 老师班级学习页。
2. 老师查看学生练题记录。
3. 知识点掌握度算法。
4. 智能推荐和个性化抽题。
5. 复杂趋势图、排行榜、班级对比和后台统计看板。
6. 评论与质疑入口。
7. 考试错题联动。
8. 练题数据导出。
9. 新增统计冗余字段或大规模性能优化。

这些能力后续可拆为学习分析、老师看板、题目协作和考试联动阶段。

## 4. 关键设计决定

### 4.1 练题记录默认按会话展示

练题记录页以 `practice_sessions` 为主记录源，默认按会话维度展示，不按题目维度平铺。

列表项展示：

1. 会话 ID。
2. 开始时间。
3. 结束时间。
4. 状态：`active` / `finished`。
5. 练题流：`fixed_count` / `continuous`。
6. 练题模式：`random` / `sequential`。
7. 题库范围。
8. 已答题数。
9. 正确数。
10. 错误数。
11. 正确率。

统计数据优先通过 `practice_session_questions` 与 `practice_answers` 聚合得到。阶段 2D 暂不新增冗余统计字段，后续如出现性能压力，再评估在会话表增加摘要列。

### 4.2 会话详情展示本次练题明细

会话详情页通过 `practice_session_questions + practice_answers + user_question_states` 聚合展示。

每道题展示：

1. 题干和选项。
2. 用户答案。
3. 正确答案。
4. 是否正确。
5. 解析。
6. 当前题目状态：
   - 是否错题。
   - 是否已标熟。
   - 是否已标疑惑。
7. 最近作答结果。

会话详情页支持继续标熟、标疑惑。评论、质疑、题目纠错和编辑入口不进入阶段 2D。

### 4.3 练题结果页保持轻量

练题结束后进入结果页。结果页不做复杂图表，只展示本次会话摘要和主动作。

展示字段：

1. 总题数。
2. 已答题数。
3. 正确数。
4. 错误数。
5. 正确率。
6. 练题流与练题模式。
7. 开始时间和结束时间。

主动作：

1. 查看本次明细。
2. 进入错题本。
3. 继续练习。

阶段 2D 的结果页用于承接练题结束后的主路径，不承担复杂学习报告职责。

### 4.4 错题本、熟题本、疑惑题复用同一状态列表能力

错题本、熟题本、疑惑题都以 `user_question_states` 为主数据源，不新建三套独立表。

筛选规则：

1. 错题本：`state_type=wrong`，默认表示 `practice_wrong_count > 0` 或 `last_result=wrong`。
2. 熟题本：`state_type=mastered`，表示 `is_mastered=1`。
3. 疑惑题：`state_type=confused`，表示 `is_confused=1`。

列表项展示：

1. 状态 ID。
2. 题目 ID。
3. 题目版本 ID。
4. 题干摘要。
5. 题型。
6. 最近作答结果。
7. 练习正确次数。
8. 练习错误次数。
9. 是否已标熟。
10. 是否已标疑惑。
11. 最近更新时间。

状态列表需要补充题目当前版本内容，便于前端直接展示题目摘要和详情。

### 4.5 从当前列表继续练

错题本、熟题本、疑惑题都支持从当前筛选结果发起新一轮练习。

推荐口径：

1. 前端先基于当前筛选结果取一批 `question_ids`。
2. 调用 `POST /api/v1/practice/sessions/from-questions` 创建会话。
3. 创建成功后直接进入练题页。
4. 默认使用 `fixed_count`。
5. 用户可设置题量；不设置时默认 10。
6. 实际题量取 `question_ids` 数量与 `question_count` 的较小值。
7. 如果没有可练题目，后端返回明确错误，前端展示空态提示。

`from-questions` 与原有按题库练习不同，它以题目 ID 列表作为候选范围。后端仍需校验题目属于当前租户、题目可用、当前用户有权访问，并跳过不可用题目。

## 5. 数据与 API 设计

### 5.1 练题记录列表

`GET /api/v1/practice/sessions`

查询参数：

1. `status`：可选，`active` / `finished`。
2. `flow_mode`：可选，`fixed_count` / `continuous`。
3. `practice_mode`：可选，`random` / `sequential`。
4. `page`：默认 1。
5. `page_size`：默认 20。

响应数据：

```json
{
  "items": [
    {
      "id": 501,
      "status": "finished",
      "flow_mode": "fixed_count",
      "practice_mode": "random",
      "source_mode": "multi_bank",
      "bank_ids": [1, 2],
      "started_at": "2026-04-22T10:00:00+08:00",
      "ended_at": "2026-04-22T10:12:00+08:00",
      "total_count": 10,
      "answered_count": 10,
      "correct_count": 8,
      "wrong_count": 2,
      "accuracy": 0.8
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

### 5.2 会话结果详情

`GET /api/v1/practice/sessions/{id}/results`

响应数据：

```json
{
  "session": {
    "id": 501,
    "status": "finished",
    "flow_mode": "fixed_count",
    "practice_mode": "random",
    "answered_count": 10,
    "correct_count": 8,
    "wrong_count": 2,
    "accuracy": 0.8
  },
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
        ]
      },
      "answer": {
        "selected_keys": ["B"]
      },
      "correct_answer": {
        "judge_mode": "by_option_key",
        "correct_keys": ["B"]
      },
      "is_correct": true,
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
  ]
}
```

### 5.3 从题目列表创建练题会话

`POST /api/v1/practice/sessions/from-questions`

请求：

```json
{
  "question_ids": [1001, 1002, 1003],
  "practice_mode": "random",
  "flow_mode": "fixed_count",
  "question_count": 10,
  "exclude_mastered": false
}
```

响应沿用 `POST /api/v1/practice/sessions` 的会话详情结构。

规则：

1. `question_ids` 不可为空。
2. `question_count` 未传或小于等于 0 时默认 10。
3. 只抽取当前租户下 `status=active` 且存在当前版本的题目。
4. `exclude_mastered=true` 时排除当前用户已标熟题。
5. 候选题不足时返回实际候选数量。
6. 候选题为空时返回 400。

### 5.4 用户题目状态列表增强

复用：

`GET /api/v1/user-question-states`

查询参数：

1. `state_type`：`wrong` / `mastered` / `confused`。
2. `bank_id`：可选。
3. `page`：默认 1。
4. `page_size`：默认 20。

阶段 2D 增强响应项，补充题目展示信息：

```json
{
  "items": [
    {
      "id": 1,
      "question_id": 1001,
      "question_version_id": 3001,
      "question_type": "single_choice",
      "content": {
        "stem": {
          "content_type": "text",
          "text": "1+1等于几？",
          "assets": []
        }
      },
      "practice_correct_count": 1,
      "practice_wrong_count": 2,
      "last_result": "wrong",
      "is_mastered": false,
      "is_confused": true,
      "updated_at": "2026-04-22T10:20:00+08:00"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

## 6. 学生端页面设计

### 6.1 练题中心

继续保留阶段 2C 的练题入口。结束练题后，前端进入练题结果页，而不是只清空当前会话。

### 6.2 练题结果页

页面路径建议：

`/app/practice/results/{sessionId}`

页面内容：

1. 本次练习摘要。
2. 正确率。
3. 查看本次明细按钮。
4. 进入错题本按钮。
5. 继续练习按钮。

### 6.3 练题记录页

页面路径建议：

`/app/practice/history`

页面内容：

1. 会话列表。
2. 状态筛选。
3. 练题流筛选。
4. 练题模式筛选。
5. 分页。
6. 查看详情按钮。

### 6.4 会话详情页

页面路径建议：

`/app/practice/history/{sessionId}`

页面内容：

1. 会话摘要。
2. 题目明细列表。
3. 用户答案。
4. 正确答案。
5. 解析。
6. 标熟、标疑惑按钮。

### 6.5 错题本、熟题本、疑惑题

页面路径建议：

1. `/app/practice/wrong`
2. `/app/practice/mastered`
3. `/app/practice/confused`

三页复用同一列表组件，通过 `state_type` 切换标题、空态和默认筛选。

页面内容：

1. 题目状态列表。
2. 按题库筛选。
3. 分页。
4. 查看题目详情。
5. 继续练习按钮。

## 7. 权限与异常处理

### 7.1 权限

所有阶段 2D API 继续要求 `practice:use` 权限。

规则：

1. 无 token 返回 401。
2. 无 `practice:use` 返回 403。
3. 跨租户访问返回 404。
4. 访问其他用户练题记录、会话详情或题目状态返回 404。

### 7.2 异常处理

1. 练题记录为空：展示空态，引导去练题中心开始练习。
2. 会话不存在：返回 404。
3. 状态列表为空：按错题本、熟题本、疑惑题分别展示空态。
4. 从列表继续练时无题目：前端提示暂无可练题目，后端返回无候选错误。
5. 题目当前版本不可用：后端跳过不可用题目；全部不可用时返回无候选错误。
6. 分页参数非法：后端归一化为 `page=1`、`page_size=20`。

## 8. 测试策略

### 8.1 后端测试

必须覆盖：

1. 查询练题会话列表。
2. 查询练题会话结果详情。
3. 查询错题、熟题、疑惑题状态列表并返回题目展示信息。
4. 从 `question_ids` 创建练题会话。
5. 从空题目列表创建会话返回错误。
6. 候选题全部不可用时返回错误。
7. 无 `practice:use` 权限返回 403。
8. 跨租户或跨用户访问返回 404。

### 8.2 SDK 测试

必须覆盖：

1. `listPracticeSessions` 路径和查询参数。
2. `getPracticeSessionResults` 路径。
3. `createPracticeSessionFromQuestions` 请求体。
4. `listUserQuestionStates` 返回题目展示信息。

### 8.3 前端测试

必须覆盖：

1. 练题结束后进入结果页。
2. 练题结果页主动作渲染。
3. 练题记录页渲染并进入详情。
4. 会话详情页展示用户答案和正确答案。
5. 错题本、熟题本、疑惑题列表渲染。
6. 从状态列表继续练触发新会话。

## 9. 验收标准

阶段 2D 完成时必须满足：

1. 学生可以完成一轮练习并进入结果页。
2. 学生可以查看历史练题记录。
3. 学生可以进入某次会话查看题目明细。
4. 学生可以打开错题本、熟题本、疑惑题列表。
5. 学生可以从任一状态列表发起新一轮练习。
6. 所有数据只展示当前登录用户自己的内容。
7. `go test -work ./...` 通过。
8. `pnpm test` 通过。
9. `pnpm typecheck` 通过。
10. `pnpm build` 通过。
11. OpenAPI YAML 可解析。
12. 无异常引用标记。
13. 无敏感信息残留。
14. 无 UTF-8 BOM 与混合换行。

## 10. 后续扩展

阶段 2D 后可继续拆分：

1. 老师班级学习页。
2. 课程维度练题入口与课程结果聚合。
3. 错题本专项强化训练。
4. 知识点掌握度。
5. 练题报告图表。
6. 评论与质疑入口。
7. 考试错题联动。
8. 学习数据导出。
