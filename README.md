# AIOS Practice Platform

AIOS Practice Platform 是面向学校、教师、学生与平台运营方的题库练习和考试平台。项目以“学校/组织”为租户边界，围绕题库建设、练题闭环、考试测评、通知公告、数据看板、审计快照等能力，提供管理端和用户端两套 Web 应用。

## 当前功能

### 管理端

- 工作台：展示平台管理入口与关键状态。
- 组织管理：维护学校/组织、年级、班级、课程等基础数据。
- 用户与权限：支持用户管理、角色管理、权限分配、菜单权限过滤。
- 字典管理：维护平台字典和字典项。
- 公告通知：发布、撤回公告，并生成用户通知。
- 题库与题目：维护题库、题目、版本、标签、评论、质疑和题库可见范围。
- 导入中心：提供组织、管理员、教师、课程、学生、题目、题库、考试、试卷等 CSV 模板下载，支持导入任务、行级结果、失败报告和回滚。
- 考试管理：支持考试草稿、固定试卷、随机组卷、发布、试卷管理和组卷入口。
- 数据看板：查看管理端总览、考试概览、班级练习汇总、学生练习详情等统计信息。
- 快照历史：查询审计日志、实体快照、学籍变更、任课变更，并可登记学籍和任课变更。

### 用户端

- 登录与账号：支持组织选择登录、令牌刷新、退出、首次改密、个人资料与密码修改。
- 学习中心：提供我的课程、练题中心、练题记录、错题本、熟题本、疑惑题。
- 练题闭环：支持按题库/课程/指定题目创建练习，答题、判分、完成练习、查看结果，并标记掌握或疑惑。
- 班级学习：教师可查看班级课程学习情况，进入学生练习明细和题目批阅。
- 考试入口：学生可查看可参加考试、开考、保存答案、交卷、查看结果。
- 教师考试：教师可创建、编辑、发布考试，查看统计和学生答卷，批阅主观题并导出筛选结果。
- 我的题库与质疑：教师/学生可查看相关题库，学生可提交题目质疑，管理端可处理质疑。
- 通知中心：查看公告通知并标记已读。

### 后端 API

- 健康检查：`GET /healthz`
- 业务 API 前缀：`/api/v1`
- 已注册模块：认证、菜单、RBAC、用户、组织、字典、公告通知、文件资源、导入任务、题库、题目、练题、考试、数据分析、快照审计。
- 正式接口契约以 [docs/api/openapi.yaml](docs/api/openapi.yaml) 为准。

## 技术栈

- 后端：Go 1.26、Gin、MySQL、JWT。
- 前端：React 18、TypeScript、Vite、Vitest。
- 包管理：pnpm workspace，当前声明版本为 `pnpm@10.33.0`。
- 共享包：
  - `packages/api-sdk`：前端 API SDK 与类型定义。
  - `packages/shared-utils`：权限等共享工具。
  - `packages/ui-web`：通用 UI shell、导航、按钮、提示等组件。

## 目录结构

```text
apps/
  admin-web/        管理端 Web 应用，默认端口 5173
  user-web/         用户端 Web 应用，默认端口 5174
cmd/server/         后端 HTTP 服务入口
internal/           后端公共能力与业务模块
packages/           前端共享 SDK、工具和 UI 包
docs/api/           正式 OpenAPI 契约
docs/database/      正式数据库 migration 与历史 schema
docs/docs/          产品、架构、状态、测试和发布文档
docs/templates/     导入模板
```

## 本地运行

### 1. 安装前端依赖

```powershell
pnpm install
```

### 2. 配置后端环境

后端默认监听 `:18081`。如需注册完整业务路由，需要配置 MySQL DSN；未配置 `AIOS_MYSQL_DSN` 时仅能访问健康检查等基础路由。

```powershell
$env:AIOS_HTTP_ADDR=":18081"
$env:AIOS_MYSQL_DSN="<user>:<password>@tcp(127.0.0.1:3306)/<database>?parseTime=true&loc=Local"
$env:AIOS_JWT_SECRET="<local-dev-secret>"
$env:AIOS_FILE_STORAGE_DIR="D:\workspace\projects\aios_practice_platform\data\file_assets"
go run .\cmd\server
```

常用环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `AIOS_APP_NAME` | `aios-practice-platform` | 应用名称 |
| `AIOS_APP_ENV` | `local` | 运行环境 |
| `AIOS_HTTP_ADDR` | `:18081` | 后端监听地址 |
| `AIOS_MYSQL_DSN` | 空 | MySQL 连接串 |
| `AIOS_REDIS_ADDR` | `127.0.0.1:6379` | Redis 地址 |
| `AIOS_JWT_SECRET` | `local-dev-secret` | JWT 密钥，本地可覆盖 |
| `AIOS_FILE_STORAGE_DIR` | `data/file_assets` | 文件资源本地存储目录 |
| `AIOS_PLATFORM_TENANT_ID` | `1` | 平台级虚拟租户 ID |

### 3. 启动前端

管理端：

```powershell
pnpm --filter @aios/admin-web dev
```

用户端：

```powershell
pnpm --filter @aios/user-web dev
```

两个前端默认读取 `VITE_API_BASE_URL`，未配置时使用 `http://127.0.0.1:18081/api/v1`。

## 数据库与文档基线

- 正式数据库 migration：[docs/database/migrations](docs/database/migrations)
- 当前最终 schema 参考：[docs/database/final_schema_20260430.sql](docs/database/final_schema_20260430.sql)
- 正式 OpenAPI：[docs/api/openapi.yaml](docs/api/openapi.yaml)
- 文档索引：[docs/README.md](docs/README.md)
- AI 执行入口：[docs/00_ai_execution_entry.md](docs/00_ai_execution_entry.md)

历史草案 `docs/api/07_openapi_draft.yaml` 与 `docs/database/08_database_schema.sql` 仅作参考，不作为当前开发基线。

## 开发与验证

```powershell
go test ./...
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

提交前需要确认：

- 文本文件为 UTF-8，遵循 `.editorconfig` 的 LF 换行约定。
- 未提交 `.env`、密钥、证书、数据库凭据、缓存、日志、临时上传文件和构建产物。
- 数据库变更进入 `docs/database/migrations`，接口变更同步 `docs/api/openapi.yaml` 与 SDK。
- 新增目录、脚本和文档使用小写字母、数字、连字符或下划线命名。

## 相关阅读

- 产品与业务架构：[docs/docs/01_prd_quiz_system.md](docs/docs/01_prd_quiz_system.md)、[docs/docs/02_business_architecture_and_permissions.md](docs/docs/02_business_architecture_and_permissions.md)
- 前后端技术方案：[docs/docs/05_frontend_tech_plan_react.md](docs/docs/05_frontend_tech_plan_react.md)、[docs/docs/06_backend_tech_plan_go.md](docs/docs/06_backend_tech_plan_go.md)
- 测试与验收：[docs/docs/11_test_plan_and_acceptance.md](docs/docs/11_test_plan_and_acceptance.md)
- 发布部署：[docs/docs/13_release_and_deployment_guide.md](docs/docs/13_release_and_deployment_guide.md)
- 最新阶段状态：[docs/docs/27_stage2g_exam_main_flow_status.md](docs/docs/27_stage2g_exam_main_flow_status.md)、[docs/docs/28_stage6_admin_analytics_snapshot_status.md](docs/docs/28_stage6_admin_analytics_snapshot_status.md)
