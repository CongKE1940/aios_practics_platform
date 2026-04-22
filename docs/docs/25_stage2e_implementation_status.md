# 阶段 2E 实施状态：课程来源练题

日期：2026-04-22
状态：已完成文档与 OpenAPI 对齐，待提交归档

## 1. 本阶段完成内容

阶段 2E 已完成课程来源练题的文档与 OpenAPI 口径补齐，重点覆盖练题创建、练题记录、用户题目状态和结果/详情字段一致性。

本阶段完成的文档变更包括：
- `docs/api/openapi.yaml`：补充 `source_mode=course`、`course_id`、练题记录与用户题目状态的课程筛选参数。
- `docs/docs/openapi_design_v1.md`：补充课程来源练题、按课程筛选练题记录、按课程筛选用户题目状态的说明。
- `docs/README.md`：把阶段 2E 状态文档纳入阅读顺序和目录说明。

新增状态文档用于汇总本次对齐结果，便于后续阶段持续引用。

## 2. 已落地的业务口径

1. `PracticeSessionInput.source_mode` 新增 `course`。
2. `source_mode=course` 时，`course_id` 必填。
3. `source_mode=course` 时，`bank_ids` 可以为空数组，不再要求显式列出题库 ID。
4. 课程来源练题的候选题来自当前租户下该课程关联的可用题库。
5. 练题会话详情、练题记录列表项和结果页中的会话对象都能读取 `course_id`。
6. `GET /practice/sessions` 支持按 `course_id` 筛选练题记录。
7. `GET /user-question-states` 支持按 `course_id` 筛选用户题目状态。
8. 练题记录、练题结果和用户题目状态仍保持当前租户与当前用户的隔离口径。

## 3. 当前限制

1. 本次交付仅完成文档和 OpenAPI 对齐，没有改动代码实现。
2. OpenAPI 3.0 无法直接表达 `source_mode=course` 时 `course_id` 必填、`bank_ids` 可为空数组的条件约束，当前通过字段说明补充。
3. 课程来源练题的可用题库筛选、候选题构造和业务校验仍依赖后端实际实现。
4. 课程筛选仅覆盖练题记录和用户题目状态，不扩展到其它列表或统计接口。

## 4. 已执行验证

已执行：

```powershell
go run $env:TEMP\openapi_yaml_check.go
```

验证结论：
1. `docs/api/openapi.yaml` 可以被 YAML 解析器正常解析。
2. 本次修改未引入明显的格式破坏或结构缺失。
3. 已人工检查新增内容的中文表述、文件命名和阅读顺序引用。

## 5. 下一步建议

阶段 2E 后续如继续推进代码实现，建议优先补齐：

1. 课程来源练题的后端条件校验。
2. 练题记录与用户题目状态的课程过滤实现。
3. SDK 与前端对课程筛选参数的联动适配。
