# 阶段 1 实施状态

更新日期：2026-04-22

## 已完成

1. Git 仓库已初始化，当前分支为 `codex/stage1-foundation`。
2. 仓库基础文件已补齐：`.gitignore`、`.editorconfig`、根 `README.md`。
3. 后端 Go module 已建立，包含：
   - `cmd/server` 启动入口；
   - `internal/bootstrap` Gin 路由；
   - `internal/common/config` 配置加载；
   - `internal/common/response` 统一响应；
   - `internal/common/tenantctx` 多租户上下文与平台级虚拟租户常量；
   - `/healthz` 健康检查。
4. 前端 pnpm workspace 已建立，包含：
   - `apps/admin-web` 管理端 Vite 应用壳；
   - `apps/user-web` 学生端 Vite 应用壳；
   - `packages/api-sdk` API 客户端；
   - `packages/shared-utils` 权限与路由访问工具；
   - `packages/ui-web` 权限按钮组件。
5. 本地前端开发服务已验证：
   - 管理端：`http://127.0.0.1:5173/`
   - 学生端：`http://127.0.0.1:5174/`
6. MySQL migration 已执行到本地开发库：
   - 连接：`mysql_local_dev`
   - 数据库：`aios_practice_system`
   - MySQL：`8.0.45`
   - 表数量：49
   - 平台虚拟租户：`tenants.id=1`，`code=platform`
   - 系统管理员角色：`roles.code=sys_admin`，已绑定 14 个权限
   - `courses.start_at` / `courses.end_at` 已存在
   - `file_assets` 已存在
   - `import_jobs.file_asset_id` 已存在
   - 所有 `tenant_id` 字段均非空
7. 认证模块已完成第一批 TDD 骨架：
   - 登录服务校验账号状态与 bcrypt 密码；
   - 登录 handler 返回正式整数 `code` 的统一响应；
   - JWT 签发器生成 access/refresh token，包含 `tenant_id`、`roles`、`permissions`。
8. 登录租户定位口径已确认：
   - 登录请求使用 `tenant_code + username + password`；
   - 平台系统管理员使用 `tenant_code=platform`；
   - OpenAPI、设计说明、后端 LoginCommand、认证服务、MySQL 仓储、前端 API SDK 已同步。
9. 本地开发平台管理员账号已创建：
   - `tenant_code=platform`
   - `username=admin`
   - `display_name=系统管理员`
   - `user_type=sys_admin`
   - 已绑定 `sys_admin` 角色与 14 个权限
   - 初始密码只写入数据库 bcrypt 哈希，文档不记录明文
10. 后端本地服务已验证：
   - 地址：`http://127.0.0.1:18080`
   - `/healthz` 返回 200
   - `/api/v1/auth/login` 使用开发账号登录成功，返回 access token 与 refresh token
11. 认证模块剩余接口已落地并完成真实验收：
   - `/api/v1/auth/refresh`：返回新的 access/refresh token
   - `/api/v1/auth/me`：返回 `display_name=系统管理员`、`roles=sys_admin` 与完整权限列表
   - `/api/v1/auth/logout`：返回 `true`
   - 最新验收实例：`http://127.0.0.1:18081`
12. 管理端已接入最小登录页与会话状态：
   - 未登录时显示 `组织下拉 / username / password` 登录表单
   - 登录成功后展示当前用户、基础平台能力入口与退出按钮
   - 登录结果会写入浏览器本地会话存储，刷新后可恢复
   - 退出登录会清理本地会话
13. RBAC 菜单最小链路已落地：
   - 后端 `GET /api/v1/menus?app_type=admin` 已实现
   - 菜单基于 access token 中的权限列表做过滤
   - 管理端登录后会拉取菜单并渲染组织管理、用户管理、角色权限、公告通知等入口
14. 组织与课程模块已完成第一版闭环：
   - 后端已实现 `schools / grades / classes / courses` 的列表、创建、详情、更新、禁用接口；
   - 所有组织与课程查询默认按 access token 中的 `tenant_id` 做租户隔离；
   - 课程列表支持 `status / keyword / active_at` 过滤，课程创建与更新支持 `start_at / end_at / description`；
   - 管理端已新增组织管理视图，可执行学校、年级、班级、课程的列表查看、创建与禁用；
   - API SDK 已补齐组织与课程的分页查询、创建、详情、更新、禁用方法。
15. 公告与通知模块已完成第一版闭环：
   - 后端已实现 `notices` 的列表、创建、详情、更新、发布、撤回接口；
   - 后端已实现 `notifications` 的当前用户列表与已读标记接口；
   - 公告发布时会按租户生成通知记录，阶段 1 先支持 `publish_scope_type=all`，并兼容 `user_ids` 的定向发布结构；
   - 管理端已新增公告通知视图，可执行公告创建、发布、撤回，并查看当前登录用户通知与标记已读；
   - API SDK 已补齐公告与通知的查询、创建、发布、撤回、已读方法。
16. 用户、角色与 RBAC 管理闭环已完成：
   - 后端已实现 `users` 的列表、创建、详情、更新、角色分配、禁用、重置密码接口；
   - 后端已实现 `roles / permissions` 的列表、创建、更新、角色权限分配接口；
   - 管理端已新增“用户管理”“角色权限”视图，可执行最小新增、授权与状态操作；
   - API SDK 已补齐用户、角色、权限与角色绑定相关方法。
17. 文件资产接口已补齐阶段 1 占位实现：
   - 后端已实现 `POST /api/v1/files/upload`、`POST /api/v1/files/import-url`、`GET /api/v1/files/{id}`；
   - 当前实现会登记 `file_assets` 元数据，生成 `object_key` 与占位访问地址；
   - 当前不接 OSS / MinIO，也不持久化真实文件内容，真实对象存储连接仍留待后续补齐；
   - API SDK 已补齐上传、URL 转储、文件详情方法。
18. 课程开始/结束时间已在管理端课程列表中直接展示，与数据库、OpenAPI 和表单字段保持一致。

## 验证结果

- `go test ./...`：通过。
- `pnpm test`：通过，9 个测试文件，39 条用例。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `docs/api/openapi.yaml`：已同步补齐组织、公告通知的请求体与查询参数，本轮未重新执行独立 YAML 解析工具。
- 文档与新增文件：未发现残留引用标记、中文文件名、UTF-8 BOM、混合换行。
- 数据库：15 个 migration 已按顺序执行；首次执行因 Python 驱动默认单语句模式停在 `002_org_structure.sql`，确认库内仅有 `tenants` 后，改用多语句模式从 `002` 继续执行完成。
- 认证真实链路：`login -> refresh -> me -> logout` 已使用本地开发账号打通。
- 本轮新增链路：`users / roles / permissions / files` 已完成后端测试与前端/SDK 验证。

## 当前限制

1. 本机 `mysql` 命令行客户端未在 PATH 中，本轮使用 Python 驱动执行数据库操作。
2. 连接配置中的 `password_env` 字段本轮经用户确认临时按密码使用，未修改配置文件。
3. Go 默认代理 `proxy.golang.org` 在当前网络下走 IPv6 会超时；本轮使用一次性环境变量 `GOPROXY=https://goproxy.cn,direct` 完成依赖下载，未修改全局配置。
4. 当前开发账号仅用于本地联调，进入正式环境前需要改为安全的初始化流程或首次登录强制改密。
5. 组织管理页当前为阶段 1 的最小可用实现，尚未接入更完整的分页、编辑表单回填和树形组织视图。
6. 公告通知页当前为阶段 1 的最小可用实现，尚未接入富文本内容、定时发布校验、通知批量已读与更细粒度的发布范围管理。
7. 文件资产接口当前仅登记元数据与占位访问地址，尚未接入真实对象存储、远端下载转储、内容回放与安全校验策略。

## 下一步顺序

1. 若以阶段 1 作为收口节点，可开始评估阶段 2 的题库、练题与考试核心流程。
2. 若继续打磨阶段 1，可优先补组织、用户、公告页面的分页、编辑回填与更完整交互。
3. 文件资产模块下一步应接入真实对象存储、远端下载转储与文件内容访问控制。
