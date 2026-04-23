# 阶段 6 设计：管理端数据看板与快照历史闭环

日期：2026-04-23

## 背景

当前项目已经完成：

1. 阶段 1 骨架与认证权限基础；
2. 阶段 2A~2G 的题库、导入、练题、老师侧学习分析与考试主链路；
3. analytics 模块已经具备老师侧班级学习与考试统计能力。

但原始交付包中“数据分析与快照”这一阶段仍缺少正式落地：

- 管理端没有数据看板；
- `audit_logs`、`student_transitions`、`teacher_assignment_histories`、`entity_snapshots` 虽已有 DDL / migration，但尚未形成业务写入与查询闭环；
- 学生流转、老师任课变更还不能在系统里形成正式历史记录；
- 管理端也没有统一的“快照与历史记录”入口。

## 目标

本轮阶段 6 的目标不是一次做完整 BI，而是交付一个正式可用的最小闭环：

1. 管理端新增“数据看板”，可查看租户内练题、考试、组织规模和待处理统计；
2. 管理端新增“快照与历史记录”页，可查看审计日志、实体快照、学生流转、老师任课历史；
3. 系统支持录入学生流转和老师任课变更，并同步写入历史表；
4. 关键事件写入审计日志与实体快照，形成可追溯链路。

## 范围

### 1. 管理端数据看板

新增最小只读看板，面向系统管理员 / 学校管理员。

看板展示首版固定为：

- 学校数
- 班级数
- 课程数
- 在读学生数
- 在职教师数
- 最近 7 天练题会话数
- 已发布考试数
- 已交卷记录数
- 待人工批阅考试数
- 最近 30 天学生流转数

同时展示两块列表：

- 最近学生流转记录
- 最近审计日志

### 2. 快照与历史记录页

新增管理端“快照与历史记录”页，首版包含四个分区：

1. 审计日志
2. 实体快照
3. 学生流转
4. 老师任课历史

首版以表格为主，不做时间轴图形化。

### 3. 学生流转记录

新增正式命令接口，用于记录以下事件：

- `class_change`
- `promote`
- `transfer_in`
- `transfer_out`
- `graduate`
- `leave_school`
- `re_enroll`

业务要求：

1. 写入 `student_transitions`；
2. 更新 `student_class_memberships` 当前关系；
3. 按需要更新 `student_profiles.school_id / enrollment_status / graduated_at`；
4. 写入 `entity_snapshots`；
5. 写入 `audit_logs`。

### 4. 老师任课变更记录

新增正式命令接口，用于记录以下事件：

- `assign`
- `unassign`

本轮先不做复杂的“replace / transfer”批量替换流程，后续如有需要再扩展。

业务要求：

1. 写入 `teacher_assignment_histories`；
2. 更新 `teacher_class_course_assignments` 当前关系；
3. 写入 `entity_snapshots`；
4. 写入 `audit_logs`。

### 5. 快照写入范围

本轮将以下场景纳入快照与审计写入：

1. 学生流转
2. 老师任课变更
3. 学校/年级/班级/课程新增、编辑、停用
4. 考试发布

其中：

- 学生流转 / 老师任课变更：写历史表 + 快照 + 审计
- 组织实体和考试发布：写快照 + 审计

## 接口设计

### Analytics

- `GET /api/v1/analytics/admin-overview`

返回管理端看板聚合数据与最近记录。

权限：

- 需要 `analytics:view`
- `user_type` 允许 `sys_admin`、`school_admin`

### Snapshot / History

- `GET /api/v1/audit-logs`
- `GET /api/v1/entity-snapshots`
- `GET /api/v1/student-transitions`
- `POST /api/v1/student-transitions`
- `GET /api/v1/teacher-assignment-histories`
- `POST /api/v1/teacher-assignment-changes`

权限：

- 查询历史：`audit:view`
- 录入学生流转 / 任课变更：`org:manage`

## 页面设计

### 管理端数据看板

页面路径：

- `/admin/analytics`

布局：

1. 顶部指标卡
2. 最近学生流转列表
3. 最近审计日志列表

首版不引入图表库，使用数字卡片和表格，先保证闭环可用。

### 管理端快照与历史记录

页面路径：

- `/admin/history`

布局：

1. 学生流转录入表单
2. 老师任课变更录入表单
3. 审计日志列表
4. 实体快照列表
5. 学生流转列表
6. 老师任课历史列表

## 数据与一致性约束

### 学生流转

1. 同一学生同一时刻只能有一个 `is_current=1` 且 `status=active` 的班级归属；
2. `graduate` / `leave_school` / `transfer_out` 会关闭当前归属；
3. `class_change` / `promote` / `transfer_in` / `re_enroll` 会新建一条当前归属；
4. `promote` 要求目标年级、目标班级必填；
5. `graduate` 会写入 `graduated_at`；
6. `leave_school` / `transfer_out` 会将 `enrollment_status` 更新为非在读状态；
7. 所有动作必须在事务内完成。

### 老师任课变更

1. `assign` 创建新的当前任课关系；
2. `unassign` 关闭当前任课关系并回填 `effective_to`；
3. 同一老师、同一班级、同一课程在同一时刻只允许一条当前有效关系；
4. 所有动作必须在事务内完成。

## 架构影响

### 后端

新增模块：

- `internal/modules/snapshot`

职责：

1. 历史查询
2. 学生流转命令
3. 老师任课变更命令
4. 审计日志与实体快照写入工具

扩展模块：

- `internal/modules/analytics`
  - 新增管理端总览接口
- `internal/modules/org`
  - 在学校 / 年级 / 班级 / 课程变更后写审计与快照
- `internal/modules/exam`
  - 在考试发布后写审计与快照

### 前端

新增页面 / 组件：

- `apps/admin-web/src/analytics-panel.tsx`
- `apps/admin-web/src/history-panel.tsx`

扩展：

- `apps/admin-web/src/app.tsx`
- `apps/admin-web/src/app.test.tsx`

### SDK

扩展：

- `packages/api-sdk/src/client.ts`
- `packages/api-sdk/src/client.test.ts`

## 不做内容

本轮明确不做：

1. 图表库驱动的大屏式可视化
2. 知识点 / 标签 / 难度的深度教学分析
3. 学生流转批量导入
4. 老师任课批量替换流程
5. 时间点回放式历史统计重算

## 测试策略

### 后端

1. 学生流转命令测试：
   - 关闭旧归属
   - 创建新归属
   - 更新 profile
   - 写入 transition / snapshot / audit
2. 老师任课变更命令测试：
   - assign / unassign
   - 历史写入与当前关系更新
3. 管理端总览查询测试
4. 历史列表过滤与权限测试

### 前端

1. 管理端看板展示测试
2. 历史页录入表单提交测试
3. 快照 / 审计 / 历史列表渲染测试
4. 菜单与页面切换测试

## 交付标准

满足以下条件视为本轮阶段 6 完成：

1. 管理端可查看最小数据看板；
2. 管理端可录入学生流转和老师任课变更；
3. 录入后可在历史页看到对应记录；
4. 关键组织变更与考试发布会写入审计日志和实体快照；
5. OpenAPI、SDK、前端页面、后端接口和 migration 保持一致；
6. 自动化测试通过。
