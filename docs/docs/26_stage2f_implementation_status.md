# 阶段 2F 实施状态：老师侧班级学习页与用户端登录闭环

日期：2026-04-23
状态：已完成并准备提交

## 1. 本阶段完成内容

阶段 2F 已补齐老师侧班级学习页与用户端最小登录闭环，覆盖班级课程练题概览、学生明细、老师任课范围校验、SDK 契约，以及用户端登录页、动态菜单、退出登录、`401` 失效回退、本地会话恢复和脏会话兜底。

本阶段完成的代码与文档变更包括：
- `internal/modules/analytics`：新增 analytics 模块，提供班级课程练题概览与学生明细聚合。
- `internal/modules/analytics`：按 `analytics:view` 权限和 `teacher_class_course_assignments` 当前任课关系校验老师可见范围。
- `internal/modules/analytics`：MySQL 仓储基于练题会话、答题记录、用户题目状态和当前班级归属实时聚合，不新增统计表。
- `internal/modules/analytics`：新增 `GET /analytics/class-course-options`，按当前老师任课范围或租户范围返回班级课程树。
- `internal/modules/analytics`：新增 `GET /analytics/student-practice-detail`，支持老师查看当前班级课程下单个学生的练题记录、错题和疑惑题。
- `cmd/server`：将 analytics handler 注册到 `/api/v1`。
- `internal/modules/rbac`：用户端菜单新增“班级学习”，权限为 `analytics:view`。
- `packages/api-sdk`：新增 `listClassCourseOptions`、`getClassPracticeSummary`、`getStudentPracticeDetail` 方法与相关类型。
- `apps/user-web`：`ClassLearningPage` 升级为单个班级课程级联选择器，支持日期范围查询，展示汇总指标与学生明细。
- `apps/user-web`：新增 `StudentLearningDetailPage`，支持从班级学习页继续下钻到学生详情，并通过标签页切换练题记录、错题和疑惑题。
- `apps/user-web`：补齐登录页、动态菜单、退出登录、`401` 统一失效回退、本地会话恢复，以及 `localStorage` 脏 session 的结构校验与自动清理。
- `docs/api/openapi.yaml`：补充 `GET /analytics/class-course-options`、`GET /analytics/class-practice-summary` 与 `GET /analytics/student-practice-detail` 正式契约。
- `docs/docs/openapi_design_v1.md`：补充老师侧班级课程级联选项、练题概览与学生学习详情接口说明。
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
10. 用户端启动时会优先尝试从 `localStorage` 恢复合法 session；若 session 可解析但结构残缺，会立即清理并回到登录页，不允许首屏崩溃。
11. 学生详情页通过 `GET /api/v1/analytics/student-practice-detail` 复用班级课程与当前学生归属口径，支持 `sessions`、`wrong`、`confused` 三个标签页。

## 3. 当前限制

1. 班级学习页暂不提供趋势图、导出、知识点分析和考试分析。
2. 班级课程选择当前为基础级联按钮树，尚未接入更完整的搜索式选择器或组织树样式控件。
3. 统计实时聚合，尚未引入物化统计表或异步汇总任务。
4. 学校管理员的数据范围当前按 token 租户处理，后续可继续细化到学校/年级范围。
5. 学生详情页当前仍为最小可用形态，暂未继续下钻到单次练题详情或完整题目详情页。

## 4. 已执行验证

已执行：

```powershell
git diff --check
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/app.test.tsx
pnpm test -- apps/user-web/src/class-learning-page.test.tsx apps/user-web/src/student-learning-detail-page.test.tsx
go test ./internal/modules/analytics
pnpm test
pnpm typecheck
pnpm build
go test -work ./...
go run -work D:\workspace\temp\openapi_parse_stage2f.go
rg -n "�|filecite|<<<<<<<|=======|>>>>>>>" apps\user-web\src docs\api docs\docs internal\modules\analytics packages\api-sdk\src
rg -n "1149637211qa|AIOS_MYSQL_DSN=.*:|mysql://|PRIVATE KEY|BEGIN RSA|access_key|secret_key" . --glob '!node_modules/**' --glob '!dist/**' --glob '!coverage/**' --glob '!pnpm-lock.yaml'
PowerShell 脚本检查 `git diff --name-only` 中所有文本文件的 UTF-8 BOM 与 CRLF/LF 混用。
```

验证结论：
1. `git diff --check` 无输出，空白检查通过。
2. 前端定向回归通过：`packages/api-sdk/src/client.test.ts`、`apps/user-web/src/app.test.tsx`、`apps/user-web/src/class-learning-page.test.tsx` 与 `apps/user-web/src/student-learning-detail-page.test.tsx` 覆盖登录页、动态菜单、退出登录、`401` 失效回退、班级学习页和学生详情页。
3. 后端 analytics 包测试通过，覆盖班级汇总、学生详情服务与 MySQL 仓储查询。
4. 前端全量测试通过：`pnpm test` 共 16 个测试文件、97 个测试通过。
5. 前端类型检查通过。
6. 前端构建通过。
7. Go 全包测试通过：`go test -work ./...` 覆盖 server、bootstrap、common 与各业务模块。
8. OpenAPI YAML 解析通过：`openapi_parse_ok`。
9. 提交前已完成 BOM、CRLF/LF 混用、异常字符、残留引用标记、冲突标记与敏感连接串快速检查，本轮新增文档与代码保持 UTF-8 编码。

## 5. 下一步建议

阶段 2F 之后建议优先补齐：

1. 从学生详情页继续进入单次练题详情和完整题目详情。
2. 面向老师的课程维度学习趋势与薄弱题型统计。
3. 将当前基础级联选择器升级为带搜索与更丰富状态提示的正式选择组件。
4. 当数据量上升后，将实时聚合沉淀为异步统计任务或物化汇总表。
