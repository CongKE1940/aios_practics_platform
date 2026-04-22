# 阶段 2E 实施状态：课程来源练题

日期：2026-04-22
状态：已完成并提交

## 1. 本阶段完成内容

阶段 2E 已完成课程来源练题的后端、SDK、用户端和文档闭环，重点覆盖练题创建、练题记录、用户题目状态和结果/详情字段一致性。

本阶段完成的代码与文档变更包括：
- `internal/modules/practice`：支持 `source_mode=course` 创建练题会话，校验课程归属与状态，并在课程候选题构造时按 `question_id` 稳定去重。
- `internal/modules/practice`：练题记录、用户题目状态和题目状态详情支持 `course_id` 筛选。
- `packages/api-sdk`：补齐课程来源练题、练题记录课程筛选、用户题目状态课程筛选的请求参数与返回字段。
- `apps/user-web`：练题面板支持题库/课程来源切换，练题记录、错题本、熟题本、疑惑题支持课程筛选与课程 ID 展示。
- `docs/api/openapi.yaml`：补充 `source_mode=course`、`course_id`、练题记录与用户题目状态的课程筛选参数。
- `docs/docs/openapi_design_v1.md`：补充课程来源练题、按课程筛选练题记录、按课程筛选用户题目状态的说明。
- `docs/README.md`：把阶段 2E 状态文档纳入阅读顺序和目录说明。

本阶段提交号：`b4bf6bf 新增：完成阶段2e课程维度练题入口`。

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

1. OpenAPI 3.0 无法直接表达 `source_mode=course` 时 `course_id` 必填、`bank_ids` 可为空数组的条件约束，当前通过字段说明和后端校验共同约束。
2. 用户端课程选择目前采用课程 ID 输入的最小入口，尚未接入“我的课程”卡片式选择。
3. 课程筛选仅覆盖练题记录和用户题目状态，不扩展到教师端班级学习看板或复杂统计。
4. 课程候选题当前按题库与题目关系聚合，尚未引入知识点、标签、难度等更细粒度条件。

## 4. 已执行验证

已执行：

```powershell
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
go run -work D:\workspace\temp\openapi_parse_stage2e.go
```

验证结论：
1. 前端测试通过：14 个测试文件、63 个用例通过。
2. 前端类型检查与构建通过。
3. 后端 Go 测试通过；普通 `go test ./...` 在 Windows 清理临时构建目录时曾出现 `Access is denied`，已使用 `go test -work ./...` 验证真实测试结果。
4. `docs/api/openapi.yaml` 可以被 `github.com/goccy/go-yaml` 正常解析。
5. 提交前已完成空白、BOM、混合换行、敏感初始密码与异常引用标记扫描。

## 5. 下一步建议

阶段 2E 之后建议进入阶段 2F，优先补齐：

1. 老师侧班级学习页，查看课程/班级维度的练题参与、正确率和错题情况。
2. 学生侧“我的课程”到练题入口的卡片式联动，替换当前课程 ID 输入的最小入口。
3. 课程维度练题结果聚合，沉淀为后续考试与学习数据看板的数据基础。
