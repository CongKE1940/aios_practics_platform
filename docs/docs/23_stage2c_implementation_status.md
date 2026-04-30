# 阶段 2C 实施状态：练题核心链路

日期：2026-04-22
状态：已完成实现并通过验证，待提交归档

## 1. 本阶段完成内容

阶段 2C 已完成定量练习、连续刷题、即时判题、用户题目状态、SDK 与学生端最小练题闭环。

后端新增：
- `POST /api/v1/practice/sessions`：创建练题会话，支持定量练习与连续刷题。
- `GET /api/v1/practice/sessions/{id}`：查看练题会话详情。
- `POST /api/v1/practice/sessions/{id}/next-question`：连续刷题模式继续取下一题。
- `POST /api/v1/practice/sessions/{id}/answer`：提交单题答案并即时判题。
- `POST /api/v1/practice/sessions/{id}/finish`：结束练题会话并返回统计摘要。
- `POST /api/v1/practice/questions/{id}/mark-mastered`：标熟或取消标熟。
- `POST /api/v1/practice/questions/{id}/mark-confused`：标疑惑或取消标疑惑。
- `GET /api/v1/user-question-states`：查看错题、熟题、疑惑题状态列表。

学生端新增：
- `/app/practice` 练题中心入口。
- 题库范围、练题流、练题模式、题量与排除熟题表单。
- 单选题/判断题最小展示与作答。
- 判题结果展示、连续刷题下一题、退出练题。
- 标熟、标疑惑基础交互。

SDK 新增：
- `createPracticeSession`
- `getPracticeSession`
- `nextPracticeQuestion`
- `submitPracticeAnswer`
- `finishPracticeSession`
- `markPracticeQuestionMastered`
- `markPracticeQuestionConfused`
- `listUserQuestionStates`

## 2. 已落实的业务口径

1. 定量练习允许用户自定义题量；未传或传入 `0` 时默认按 `10` 题处理。
2. 连续刷题不要求预先设置题量，创建会话时先返回首题，后续通过 `next-question` 逐题获取。
3. 连续刷题在当前轮候选题耗尽后自动进入下一轮，`round_no` 递增。
4. 抽题支持 `single_bank` 与 `multi_bank`，练题模式支持 `random` 与 `sequential`。
5. 提交答案后立即返回判题结果、正确答案、解析和最新用户题目状态。
6. 题目状态支持错题自动更新，以及手动标熟、标疑惑。
7. 所有练题接口要求 `practice:use` 权限，并按租户与用户维度隔离数据。

## 3. 当前限制

1. 学生端目前仅提供最小练题页，尚未补齐答题卡、会话历史、专项错题页和练题报告。
2. 前端当前优先支持单选题和判断题；多选题的交互基础已经兼容，但未做更完整的专项界面优化。
3. 连续刷题当前采用基础轮转策略，尚未接入智能推荐、知识点掌握度算法和个性化抽题。
4. 练题结果统计目前仅提供会话摘要，未提供按题型、题库、课程的聚合分析。
5. 题目解析直接来自当前题目版本内容，尚未接入更丰富的多媒体解析展示。

## 4. 已执行验证

已执行：

```powershell
go test -work ./...
pnpm test
pnpm typecheck
pnpm build
```

同时已完成：

1. OpenAPI YAML 解析检查。
2. 敏感密码与异常引用标记检查。
3. UTF-8 编码、BOM 与混合换行检查。

## 5. 下一阶段建议

阶段 2D 建议进入练题结果与学习闭环增强：

1. 练题记录列表与会话回看。
2. 错题本与熟题本页面。
3. 课程维度练题入口与结果聚合。
4. 学生端练题页的答题卡、进度和交互优化。

智能推荐、知识点掌握度算法、复杂统计报表与考试联动建议作为后续独立增强。
