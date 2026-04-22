# 题练通（暂定名）交付包

本交付包面向两个对象：
1. **你本人/产品负责人**：用于快速审阅、修改和补充细节；
2. **AI 或研发团队**：用于直接进入设计、开发、测试和上线工作。

本包默认基于以下前提：
- 一期仅交付网页端；
- 二期扩展手机端与平板端；
- 前端 React，后端 Go，数据库 MySQL，缓存 Redis；
- 为题干/选项图片、质疑附件等场景，补充引入对象存储（S3/MinIO 兼容）作为基础设施建议；
- 以“学校/组织”为租户边界，系统级可跨租户查看数据。

## 推荐阅读顺序

### 给 AI 的阅读顺序
1. `00_ai_execution_entry.md`
2. `docs/01_prd_quiz_system.md`
3. `docs/02_business_architecture_and_permissions.md`
4. `docs/03_page_design_and_interaction.md`
5. `docs/database_api_design_v1.md`
6. `docs/mysql_ddl_v1.md`
7. `docs/openapi_design_v1.md`
8. `api/openapi.yaml`
9. `database/migrations/`
10. `docs/05_frontend_tech_plan_react.md`
11. `docs/06_backend_tech_plan_go.md`
12. `docs/09_frontend_code_standards.md`
13. `docs/10_backend_code_standards.md`
14. `docs/11_test_plan_and_acceptance.md`
15. `docs/20_stage1_implementation_status.md`
16. `docs/21_stage2a_implementation_status.md`
17. `docs/22_stage2b_implementation_status.md`
18. `docs/23_stage2c_implementation_status.md`
19. `docs/24_stage2d_implementation_status.md`
20. `templates/` 下的导入模板

### 给你自己的阅读顺序
1. `docs/01_prd_quiz_system.md`
2. `docs/03_page_design_and_interaction.md`
3. `prototype/04_low_fidelity_prototype.html`
4. `docs/12_milestones_and_delivery_plan.md`
5. `docs/19_open_questions_and_risks.md`

## 目录说明
- `00_ai_execution_entry.md`：给 AI 的执行入口说明
- `docs/01_prd_quiz_system.md`：PRD
- `docs/02_business_architecture_and_permissions.md`：业务架构、层级、多租户、权限、快照策略
- `docs/03_page_design_and_interaction.md`：页面清单、布局、交互、状态说明
- `prototype/04_low_fidelity_prototype.html`：低保真原型，可直接打开预览
- `docs/database_api_design_v1.md`：数据库与 API 设计说明基线
- `docs/mysql_ddl_v1.md`：MySQL 8 DDL 基线
- `docs/openapi_design_v1.md`：OpenAPI 设计说明
- `api/openapi.yaml`：正式 OpenAPI 3.0 YAML
- `database/migrations/`：正式拆分 migration 文件
- `docs/05_frontend_tech_plan_react.md`：前端技术方案与目录结构
- `docs/06_backend_tech_plan_go.md`：后端技术方案与模块设计
- `api/07_openapi_draft.yaml`：历史 REST API 草案，仅作参考，不作为开发基线
- `database/08_database_schema.sql`：历史 MySQL 建表脚本草案，仅作参考，不作为开发基线
- `docs/09_frontend_code_standards.md`：前端代码规范
- `docs/10_backend_code_standards.md`：后端代码规范
- `docs/11_test_plan_and_acceptance.md`：测试计划、验收标准
- `docs/12_milestones_and_delivery_plan.md`：里程碑与交付计划
- `docs/13_release_and_deployment_guide.md`：环境、发布、回滚与上线检查
- `docs/20_stage1_implementation_status.md`：阶段 1 当前实施状态、验证结果与下一步
- `docs/21_stage2a_implementation_status.md`：阶段 2A 题库与题目管理实施状态
- `docs/22_stage2b_implementation_status.md`：阶段 2B 模板下载与导入任务实施状态
- `docs/23_stage2c_implementation_status.md`：阶段 2C 练题核心链路实施状态
- `docs/24_stage2d_implementation_status.md`：阶段 2D 练题记录与复习闭环实施状态
- `templates/14_acceptance_checklist.csv`：验收清单
- `templates/15_question_import_template.csv`：题目导入模板
- `templates/16_bank_import_template.csv`：题库导入模板
- `templates/17_exam_import_template.csv`：试卷/考试导入模板
- `docs/19_open_questions_and_risks.md`：需你补充确认的开放问题

## 如何把这套文档交给 AI
1. 先让 AI 阅读 `00_ai_execution_entry.md`；
2. 再依次阅读 PRD、业务架构、页面设计、API、数据库；
3. 要求 AI **严格按文档落地，不得自行改动核心业务规则**；
4. 开发中若遇到未定义项，应优先写入 `docs/19_open_questions_and_risks.md` 约定的决策点，而不是擅自创造新规则。

## 建议先确认的 5 个点
1. 学校/组织租户是否允许“集团 + 子校”二级租户。
2. 老师是否可能跨租户授课。
3. 学生是否允许跨班级并行在读。
4. 题目图片的来源：上传对象存储还是外链托管。
5. 考试是否需要防作弊能力（切屏、倒计时同步、IP 限制等）。

## 版本信息
- 交付包版本：v0.9 初稿
- 生成日期：2026-04-21
- 用途：AI 可执行的项目蓝图、研发实施包、验收包
