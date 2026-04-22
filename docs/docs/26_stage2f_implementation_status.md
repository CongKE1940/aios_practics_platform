# 阶段 2F 实施状态：老师侧班级学习页

日期：2026-04-22
状态：已完成并准备提交

## 1. 本阶段完成内容

阶段 2F 已补齐老师侧班级学习页的最小闭环，覆盖班级课程练题概览、学生明细、老师任课范围校验、SDK 契约和用户端入口。

本阶段完成的代码与文档变更包括：
- `internal/modules/analytics`：新增 analytics 模块，提供班级课程练题概览与学生明细聚合。
- `internal/modules/analytics`：按 `analytics:view` 权限和 `teacher_class_course_assignments` 当前任课关系校验老师可见范围。
- `internal/modules/analytics`：MySQL 仓储基于练题会话、答题记录、用户题目状态和当前班级归属实时聚合，不新增统计表。
- `internal/modules/analytics`：新增 `GET /analytics/class-course-options`，按当前老师任课范围或租户范围返回班级课程树。
- `cmd/server`：将 analytics handler 注册到 `/api/v1`。
- `internal/modules/rbac`：用户端菜单新增“班级学习”，权限为 `analytics:view`。
- `packages/api-sdk`：新增 `listClassCourseOptions`、`getClassPracticeSummary` 方法与相关类型。
- `apps/user-web`：`ClassLearningPage` 升级为单个班级课程级联选择器，支持日期范围查询，展示汇总指标与学生明细。
- `docs/api/openapi.yaml`：补充 `GET /analytics/class-course-options` 与 `GET /analytics/class-practice-summary` 正式契约。
- `docs/docs/openapi_design_v1.md`：补充老师侧班级课程级联选项与练题概览接口说明。
- `docs/README.md`：把阶段 2F 状态文档纳入阅读顺序和目录说明。

## 2. 已落地的业务口径

1. `GET /api/v1/analytics/class-practice-summary` 必须同时提供 `class_id` 和 `course_id`。
2. `start_at` 与 `end_at` 为可选 RFC3339 时间，用于限定统计窗口。
3. 班级学生范围来自当前 `current` 状态的学生班级归属。
4. `session_count` 按练题会话 `started_at` 统计。
5. `answered_count`、`correct_count`、`wrong_count` 和正确率按答题记录 `answered_at` 统计。
6. `wrong_question_count` 和 `confused_question_count` 仅统计当前课程下有效题库与有效题目。
7. 老师仅能查看当前任课的班级课程；系统管理员与学校管理员按当前租户范围查看。
8. 用户端阶段 2F 通过 `GET /api/v1/analytics/class-course-options` 先拉取班级课程树，再在单个级联选择器中完成班级和课程选择。
9. 当且仅当可选课程总数为 1 时，页面会自动默认选中该课程。

## 3. 当前限制

1. 班级学习页暂不提供趋势图、导出、知识点分析、考试分析和学生详情跳转。
2. 班级课程选择当前为基础级联按钮树，尚未接入更完整的搜索式选择器或组织树样式控件。
3. 统计实时聚合，尚未引入物化统计表或异步汇总任务。
4. 学校管理员的数据范围当前按 token 租户处理，后续可继续细化到学校/年级范围。

## 4. 已执行验证

已执行：

```powershell
go test ./internal/modules/analytics -count=1
go test ./internal/modules/analytics -run MySQL -count=1
go test ./cmd/server ./internal/modules/rbac ./internal/modules/analytics -count=1
pnpm test -- packages/api-sdk/src/client.test.ts
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/app.test.tsx
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
go run -work D:\workspace\temp\openapi_parse_stage2f.go
```

验证结论：
1. 前端测试通过：级联选择器相关 2 个测试文件、12 个用例通过；阶段 2F 全量前端测试与后续全量验证见最终收口结果。
2. 前端类型检查与构建通过。
3. 后端 Go 全量测试通过；`internal/modules/analytics` 新增测试通过。
4. `docs/api/openapi.yaml` 可以被 `github.com/goccy/go-yaml` 正常解析。
5. 提交前已完成空白、BOM、混合换行、敏感初始密码与异常引用标记扫描。

## 5. 下一步建议

阶段 2F 之后建议优先补齐：

1. 从班级学习页进入学生错题、疑惑题和练题详情。
2. 面向老师的课程维度学习趋势与薄弱题型统计。
3. 将当前基础级联选择器升级为带搜索与更丰富状态提示的正式选择组件。
4. 当数据量上升后，将实时聚合沉淀为异步统计任务或物化汇总表。
