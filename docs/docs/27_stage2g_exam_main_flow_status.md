# 阶段 2G 考试主链路状态

更新时间：2026-04-23

## 已完成

- 新增后端考试模块，覆盖考试草稿创建、更新、发布、固定试卷、随机组卷、学生开考、答题保存、交卷判分、结果查询。
- 学生 `GET /api/v1/exams` 可查询自己可参加的已发布考试；老师仍可通过 `exam:publish` 查看租户内考试管理列表。
- 开考与 attempt 查询返回题目 `question_type` 和 `content`，学生端可渲染题干与选项。
- SDK 已补齐考试管理、开考、答题保存、交卷、结果查询契约。
- 用户端已接入老师考试管理页，支持考试列表、固定试卷草稿、随机组卷草稿、发布。
- 用户端已接入学生考试入口与作答页，支持查看可参加考试、开始考试、保存答案、交卷并查看得分。

## 已验证

- `go test ./internal/modules/exam`
- `pnpm test -- apps/user-web/src/app.test.tsx apps/user-web/src/student-exam-page.test.tsx apps/user-web/src/teacher-exam-page.test.tsx`
- `pnpm typecheck`

## 后续待做

- 考试页仍是最小功能界面，后续需要补充更完整的视觉样式、倒计时、交卷确认、离开保护和题号导航。
- 老师侧暂未做考试详情编辑页与试卷预览页，当前先满足草稿创建与发布。
- OpenAPI 正式文件中考试接口仍有部分响应复用通用 `Ok`，后续可继续拆成强类型响应 schema。
