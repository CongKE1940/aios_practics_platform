# 阶段 2A 实施状态

更新日期：2026-04-22

## 范围

阶段 2A 采用管理端先行，只覆盖：

1. 题库管理：列表、创建、更新、发布、下发可见范围。
2. 题目管理：列表、创建、更新主信息、版本列表、新增版本。
3. 管理端入口：题库管理、题目管理。
4. API SDK：题库与题目相关方法。

模板导入、标签、评论、质疑、老师端入口、练题与考试不进入阶段 2A。

## 已完成

1. 正式契约已补齐：
   - `docs/api/openapi.yaml`
   - `docs/docs/openapi_design_v1.md`
2. 后端新增题库模块：
   - `internal/modules/questionbank`
   - 支持 `GET /question-banks`
   - 支持 `POST /question-banks`
   - 支持 `PUT /question-banks/{id}`
   - 支持 `POST /question-banks/{id}/publish`
   - 支持 `POST /question-banks/{id}/visibility`
3. 后端新增题目模块：
   - `internal/modules/question`
   - 支持 `GET /questions`
   - 支持 `POST /questions`
   - 支持 `PUT /questions/{id}`
   - 支持 `GET /questions/{id}/versions`
   - 支持 `POST /questions/{id}/versions`
4. 题目内容已按 `questions + question_versions` 落地：
   - 创建题目时自动生成版本 1
   - 更新题目主信息不覆盖版本
   - 新增版本时递增 `version_no`
   - 新增版本后回写 `questions.current_version_id`
5. 题库下发继续走 `question_bank_visibility` 授权模型，不复制题库或题目。
6. RBAC 菜单已新增：
   - `题库管理` -> `/admin/question-banks`
   - `题目管理` -> `/admin/questions`
7. API SDK 已新增题库与题目方法。
8. 管理端已新增：
   - `QuestionBankPanel`
   - `QuestionPanel`
   - `AdminApp` 菜单接入。

## 已验证

本轮已通过：

- `go test -work ./...`
- `pnpm test`，11 个测试文件，45 条用例
- `pnpm typecheck`
- `pnpm build`

## 当前限制

1. 阶段 2A 管理端页面仍是最小可用形态，尚未做复杂分页、编辑回填、题目预览富交互。
2. 题目编辑器当前只支持客观题的简化录入，图片资产只通过已有文件资产能力预留，不做富文本编辑器。
3. 题库下发界面当前使用目标类型与目标 ID 录入，组织树选择器留待后续增强。
4. 标签、评论、质疑、模板导入将进入阶段 2B / 2C。

## 下一步

阶段 2A 可继续做真实数据库联调与页面打磨；若按阶段计划推进，下一块是阶段 2B：模板下载、导入任务与行级错误反馈。
