# 阶段 2G 考试主链路状态

更新时间：2026-04-23

## 已完成

- 新增后端考试模块，覆盖考试草稿创建、更新、发布、固定试卷、随机组卷、学生开考、答题保存、交卷判分、结果查询。
- 学生 `GET /api/v1/exams` 可查询自己可参加的已发布考试；老师仍可通过 `exam:publish` 查看租户内考试管理列表。
- 开考与 attempt 查询返回题目 `question_type` 和 `content`，学生端可渲染题干与选项。
- SDK 已补齐考试管理、开考、答题保存、交卷、结果查询契约。
- 用户端已接入老师考试管理页，支持考试列表、固定试卷草稿、随机组卷草稿、发布。
- 用户端老师考试管理页已补充考试详情查看、草稿回填编辑、固定试卷预览、随机组卷规则预览。
- 用户端老师考试管理页已补充考试统计与成绩查看，支持应参加人数、参与/交卷/未开始人数、均分/最高分/最低分以及学生成绩列表。
- 用户端已接入学生考试入口与作答页，支持查看可参加考试、开始考试、保存答案、交卷并查看得分。
- 学生作答页已补充倒计时、到时自动交卷、题号导航、交卷二次确认、刷新/关闭提醒。
- 用户菜单已补齐真实考试入口：老师显示“考试管理”，学生显示“考试入口”。
- 正式 `docs/api/openapi.yaml` 已为考试列表、考试详情、开考、作答保存、交卷、结果查询收口强类型 response schema。
- 正式 `docs/api/openapi.yaml` 已补齐 `GET /api/v1/analytics/exam-overview` 强类型 response schema。

## 已验证

- `go test ./internal/modules/exam`
- `go test ./internal/modules/analytics`
- `go test ./internal/modules/rbac`
- `pnpm test -- apps/user-web/src/app.test.tsx apps/user-web/src/student-exam-page.test.tsx apps/user-web/src/teacher-exam-page.test.tsx`
- `pnpm typecheck`

## 后续待做

- 考试页仍是最小功能界面，后续需要补充更完整的视觉样式、答案自动保存节流、主观题和异常恢复。
- 后续仍可继续增强老师侧成绩明细钻取、试卷题干富预览、异常恢复与更完整的视觉样式。
