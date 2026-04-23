# 阶段 6 数据分析与快照实施状态

更新时间：2026-04-23

## 本阶段目标
- 建立管理端阶段六最小闭环：
  - 数据看板
  - 学籍/任课历史
  - 快照与审计查询
  - 变更登记接口与管理端入口

## 已完成内容

### 1. 后端模块
- `internal/modules/analytics`
  - 新增 `GET /api/v1/analytics/admin-overview`
  - 返回管理端总览指标、最近学籍变更、最近审计日志
- `internal/modules/snapshot`
  - 新增 `GET /api/v1/audit-logs`
  - 新增 `GET /api/v1/entity-snapshots`
  - 新增 `GET /api/v1/student-transitions`
  - 新增 `POST /api/v1/student-transitions`
  - 新增 `GET /api/v1/teacher-assignment-histories`
  - 新增 `POST /api/v1/teacher-assignment-changes`
  - 学籍变更登记时同步维护：
    - `student_class_memberships`
    - `student_profiles`
    - `student_transitions`
    - `entity_snapshots`
    - `audit_logs`
  - 任课变更登记时同步维护：
    - `teacher_class_course_assignments`
    - `teacher_assignment_histories`
    - `entity_snapshots`
    - `audit_logs`
- `cmd/server`
  - 已注册 snapshot handler 到 `/api/v1`

### 2. 管理端
- `apps/admin-web`
  - 新增 [analytics-panel.tsx](D:\workspace\projects\aios_practice_platform\apps\admin-web\src\analytics-panel.tsx)
  - 新增 [history-panel.tsx](D:\workspace\projects\aios_practice_platform\apps\admin-web\src\history-panel.tsx)
  - 已接入：
    - `/admin/analytics`
    - `/admin/history`
  - 数据看板页可查看核心指标与最近动态
  - 快照历史页可查看：
    - 学籍变更记录
    - 任课变更记录
    - 实体快照
    - 审计日志
  - 快照历史页可直接登记：
    - 学籍变更
    - 任课变更

### 3. SDK 与菜单
- `packages/api-sdk`
  - 已补齐阶段六新增类型与请求方法
- `internal/modules/rbac/menu.go`
  - 管理端菜单新增：
    - 数据看板
    - 快照历史

### 4. 正式文档
- 正式 OpenAPI 已同步：
  - [openapi.yaml](D:\workspace\projects\aios_practice_platform\docs\api\openapi.yaml)
- 设计说明已同步：
  - [openapi_design_v1.md](D:\workspace\projects\aios_practice_platform\docs\docs\openapi_design_v1.md)
- 阶段六设计与计划文档：
  - [2026-04-23-stage6-admin-analytics-snapshot-design.md](D:\workspace\projects\aios_practice_platform\docs\superpowers\specs\2026-04-23-stage6-admin-analytics-snapshot-design.md)
  - [2026-04-23-stage6-admin-analytics-snapshot-implementation.md](D:\workspace\projects\aios_practice_platform\docs\superpowers\plans\2026-04-23-stage6-admin-analytics-snapshot-implementation.md)

## 当前阶段范围说明
- 本阶段先做“最小可用”的管理端阶段六闭环。
- 尚未扩展：
  - 趋势图表
  - 导出分析报表
  - 更多业务事件自动入审计
  - 按天快照或批量快照任务

## 验证结果
- `go test ./internal/modules/analytics ./internal/modules/snapshot ./internal/modules/rbac ./cmd/server`
- `pnpm test`
- `pnpm typecheck`

当前结果：
- Go 模块测试通过
- 前端测试通过
- TypeScript 类型检查通过

## 下一步建议
1. 扩展阶段六看板筛选能力（时间范围、学校/课程维度）
2. 为组织管理与用户管理动作补更完整的自动审计写入
3. 进入阶段七，补验收链路、权限回归和部署准备
