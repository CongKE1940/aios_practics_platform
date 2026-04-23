# 老师侧考试详情编辑与试卷预览设计

> 日期：2026-04-23
> 范围：`apps/user-web` 老师考试管理页、`packages/api-sdk`、`docs/api/openapi.yaml`

## 1. 背景

当前考试主链路已经具备以下能力：

1. 老师可在学生端入口 `/app/exams` 创建考试草稿并发布。
2. 学生可查看已发布考试、开始考试、保存答案、交卷并查看结果。
3. 后端已经具备 `GET /exams/{id}` 与 `PUT /exams/{id}` 能力。

但老师侧仍缺少两个关键能力：

1. 无法在考试列表中打开某场考试的详情并回填现有配置；
2. 无法在发布前直观看到试卷题目内容与分值顺序。

同时，考试相关 OpenAPI 仍有大量 `Ok` 通用响应，SDK 与前端虽然已经手写了类型，但正式契约没有收口到强类型 schema。

## 2. 目标

本轮连续完成以下内容：

1. 在老师侧考试管理页增加“查看详情 / 编辑草稿 / 试卷预览”能力；
2. 保持现有“列表 + 新建”主页面不被拆散成复杂路由；
3. 对固定试卷与随机组卷两种考试都能展示可理解的详情；
4. 将考试相关 OpenAPI 响应统一收口到强类型 schema，并同步 SDK。

## 3. 非目标

本轮不包含以下内容：

1. 不新增独立的老师考试详情路由；
2. 不实现随机组卷的实时重新抽题按钮；
3. 不实现老师侧考试成绩统计页；
4. 不调整考试建模或数据库结构。

## 4. 方案选择

### 方案 A：在现有老师考试页内做“列表 + 表单 + 详情预览”的双栏增强

优点：

1. 改动集中，复用现有 `TeacherExamPage`；
2. 不需要新增前端路由与页面壳层；
3. 与当前最小实现连续性最好。

缺点：

1. 单页状态会变复杂；
2. 需要小心处理“新建模式”和“编辑模式”的切换。

### 方案 B：新增独立详情页

优点：

1. 状态更清晰；
2. 后续扩展考试统计更自然。

缺点：

1. 需要补路由、导航、回退逻辑；
2. 当前项目的用户端导航仍是轻量路径字符串驱动，新增一整页的收益暂时不高。

### 方案 C：只做预览弹层，不做编辑回填

优点：

1. 实现最短；
2. 可以快速看到题目内容。

缺点：

1. 老师仍无法修改已有草稿；
2. 不能真正补齐老师主链路。

### 结论

采用方案 A。以现有 `TeacherExamPage` 为中心增强，新增“选中考试详情区域”和“试卷预览区域”，同时保留原有创建草稿能力，并让草稿可回填编辑。

## 5. 交互设计

### 5.1 页面结构

`TeacherExamPage` 调整为三段式：

1. 顶部：考试表单区域
2. 左下：考试列表
3. 右下：当前选中考试详情 / 试卷预览

### 5.2 表单模式

表单存在两种模式：

1. `新建草稿`
2. `编辑草稿`

进入编辑模式的方式：

1. 点击列表项“查看详情”后加载详情；
2. 若考试状态为 `draft`，显示“编辑草稿”按钮，点击后把详情回填到表单；
3. 若考试状态为 `published`，表单不进入编辑模式，只允许查看详情和试卷预览。

### 5.3 试卷预览

固定试卷：

1. 直接展示 `fixed_questions` 列表；
2. 每行展示题号、题目 ID、版本 ID、分值；
3. 若详情接口已返回题目内容，则展示题干摘要；
4. 若后端仅返回题目 ID 与版本 ID，则至少保证基础结构可见。

随机组卷：

1. 展示 `paper_rules`；
2. 每条规则展示题型、题量、单题分值、课程、题库范围；
3. 在“预览”区域明确提示这是规则预览，不是已展开题目清单。

### 5.4 列表操作

每个考试项增加：

1. `查看详情`
2. `编辑草稿`（仅 `draft`）
3. `发布`（仅 `draft`）

## 6. 数据与契约设计

### 6.1 前端 API 能力补充

`TeacherExamApi` 增加：

1. `getExam(id)`
2. `updateExam(id, body)`

### 6.2 老师页本地状态

核心状态：

1. `selectedExamId`
2. `selectedExamDetail`
3. `formMode = create | edit`
4. `editingExamId`
5. `detailLoading`

### 6.3 OpenAPI 强类型响应

将下列考试接口从通用 `Ok` 改为专用响应：

1. `GET /exams` -> `ExamPageOk`
2. `POST /exams` -> `ExamDetailOk`
3. `GET /exams/{id}` -> `ExamDetailOk`
4. `PUT /exams/{id}` -> `ExamDetailOk`
5. `POST /exams/{id}/publish` -> `ExamDetailOk`
6. `POST /exams/{id}/attempts` -> `ExamAttemptDetailOk`
7. `GET /exam-attempts/{id}` -> `ExamAttemptDetailOk`
8. `POST /exam-attempts/{id}/answers` -> `ExamAttemptAnswerOk`
9. `POST /exam-attempts/{id}/submit` -> `ExamAttemptResultOk`
10. `GET /exam-attempts/{id}/result` -> `ExamAttemptResultOk`

另外补齐：

1. `GET /exams/{id}` 路径在 `openapi.yaml` 中正式声明；
2. `ExamPageResult`、`ExamDetailEnvelope`、`ExamAttemptDetailEnvelope`、`ExamAttemptAnswerEnvelope`、`ExamAttemptResultEnvelope`；
3. 若已有考试 schema 不足以支撑详情页展示，则补齐必要字段，但不修改业务语义。

## 7. 菜单接线

当前真实菜单构建逻辑仍未把 `/app/exams` 纳入用户菜单。为了让老师和学生能在真实联调环境看到考试入口，本轮一并补齐：

1. 老师：`exam:publish` -> `/app/exams`，名称为“考试管理”
2. 学生：基于 `practice:use` 之外单独增加“考试入口”并允许学生看到 `/app/exams`

实现上不依赖数据库菜单表，继续沿用 `internal/modules/rbac/menu.go` 的静态菜单构建方式。

## 8. 测试设计

### 8.1 前端

新增或补充：

1. `teacher-exam-page.test.tsx`
   - 查看详情并渲染详情区域
   - 草稿详情回填到表单
   - 编辑后调用 `updateExam`
   - 固定试卷预览显示题号和分值
   - 随机组卷显示规则摘要
2. `app.test.tsx`
   - 老师真实从考试菜单进入后仍能打开增强页面

### 8.2 SDK

补充：

1. `getExam`
2. `updateExam`
3. 考试相关响应解析仍保持强类型

### 8.3 文档

同步：

1. `docs/api/openapi.yaml`
2. `docs/docs/openapi_design_v1.md`
3. 阶段状态文档

## 9. 风险与处理

### 9.1 详情缺少题目正文

若后端 `ExamDetail` 当前只返回 `fixed_questions` 的 ID、版本、分值，而不返回题目正文：

1. 本轮预览页先展示结构化清单；
2. 不额外引入“按题目 ID 再查题目详情”的前端串行调用；
3. 后续若需要更强预览，再扩充后端详情聚合。

### 9.2 学生考试入口菜单权限

学生目前列考试不依赖 `exam:publish`。菜单展示若继续纯权限控制，可能导致学生无菜单入口。

本轮处理：

1. 在静态菜单构建处对 `/app/exams` 增加按 `app_type=user` 的特殊开放逻辑：
   - 拥有 `exam:publish` 的老师显示“考试管理”
   - `user_type=student` 的菜单仍由业务返回路径决定并通过会话菜单测试覆盖

若现有菜单构建函数拿不到 `user_type`，则保守处理为：菜单项要求 `practice:use` 或 `exam:publish` 任一满足即可，页面内部再按 `user_type` 选择老师页/学生页。

## 10. 本轮默认假设

由于你已经明确要求我不中途停下来确认，本轮采用以下默认假设并直接实施：

1. 老师详情编辑页继续放在当前 `/app/exams` 页内，不新建独立路由；
2. 固定试卷预览先展示结构清单，不追求完整题干富文本；
3. 菜单入口问题视为当前功能落地的必要修补，一并处理；
4. OpenAPI 强类型响应以正式 `openapi.yaml` 为准，同步 SDK 和文档说明。
