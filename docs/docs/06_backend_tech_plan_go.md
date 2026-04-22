# 后端技术方案（Go）

## 1. 目标
构建一个支持多租户、题库、练题、考试、历史快照与质疑闭环的后端服务，满足一期网页端需求并支持二期扩展。

## 2. 建议技术栈
- Go 1.22+
- Gin（HTTP 框架）
- GORM（ORM，配合 SQL migration）
- MySQL 8
- Redis
- Casbin（RBAC，可选但强烈推荐）
- Zap（日志）
- Viper（配置）
- Swagger / OpenAPI
- Asynq（可选，用于导入任务、通知、统计异步任务）
- 对象存储：S3/MinIO 兼容

## 3. 代码组织建议
```text
cmd/server/
configs/
internal/
  bootstrap/
  common/
    auth/
    errors/
    middleware/
    response/
    tenantctx/
  modules/
    auth/
    tenant/
    org/
    user/
    role/
    notice/
    course/
    questionbank/
    question/
    practice/
    exam/
    challenge/
    importjob/
    analytics/
    snapshot/
pkg/
  logger/
  redisx/
  timex/
  idgen/
migrations/
```

## 4. 分层约束
1. Handler / Controller：解析请求、参数校验、响应封装
2. Service：业务编排、事务边界、权限判断
3. Repository：数据库读写
4. Domain Model / DTO：领域对象与接口对象

## 5. 多租户实现
- 登录后从 token 解析 tenant 上下文，注入 `context.Context`。
- Repository 默认读取 tenant 上下文追加过滤。
- 只有系统管理员接口允许显式关闭 tenant filter。
- 审计日志必须记录：operator_user_id、operator_role、tenant_id、module、action、request_id、result。

## 6. 题库与题目设计
### 6.1 题库下发
采用“归属 + 可见范围授权”模型：
- 原始题库归某个层级所有
- 下发只创建 visibility 关系
- 题目默认不复制

### 6.2 题目版本化
质疑通过或归属方编辑时：
- 保留原版本
- 生成新版本
- 对外默认展示最新启用版本
- 考试/练题记录保留当时版本快照引用

### 6.3 题目内容结构
以 JSON 结构支持：文本题干、图片题干、图文混合题干、动态选项数，以及将来主观题扩展。

## 7. 练题服务设计
- 创建练题会话
- 根据配置取下一题
- 判定客观题答案
- 更新用户题目状态（错题/熟题/疑惑）
- 输出练题结果统计

取题逻辑建议：
1. 先根据可见题库与权限获取候选题
2. 过滤熟题（仅练题）
3. 若顺序练题，按题库内排序与题目 ID 稳定排序
4. 若随机练题，按会话级随机种子抽题，确保可重放与排查

## 8. 考试服务设计
### 8.1 组卷核心流程
1. 校验发布人权限
2. 读取组卷规则
3. 统计候选题池
4. 按题型 + 知识点规则抽题
5. 若不足则返回详细缺口
6. 保存试卷快照
7. 发布考试

### 8.2 作答与判分
- 客观题提交即存答案
- 交卷时计算客观题得分
- 生成 `exam_attempt` 与 `exam_attempt_answers`
- 形成错题沉淀，但不影响熟题

### 8.3 并发与锁
- 考试发布时使用分布式锁避免同模板重复组卷冲突
- 考试作答自动保存注意幂等

## 9. 导入服务设计
上传文件 → 解析模板 → 行级校验 → 生成错误报告 → 成功入库 → 返回结果汇总

错误反馈要求：行号、字段名、错误原因、修复建议。

## 10. 快照与历史设计
### 10.1 为什么同时需要快照表与历史表
- 快照表：用于完整回放某一时刻对象状态
- 历史表：用于快速查看某类变更轨迹

### 10.2 建议事件
- CLASS_TRANSFER
- GRADE_UPGRADE
- ENROLLMENT
- GRADUATION
- LEAVE_SCHOOL
- TEACHING_ASSIGNMENT_CHANGED
- EXAM_PUBLISHED

## 11. 缓存策略
- 字典数据缓存
- 热门题库概览缓存
- 看板统计缓存（短 TTL）
- 登录态/刷新令牌缓存
- 考试倒计时和自动保存会话可用 Redis 存短期状态

## 12. 日志与观测
- 请求日志：request_id、path、user_id、tenant_id、duration、status_code
- 业务日志：考试发布、导入任务、质疑处理、批量下发
- 指标：接口耗时、错误率、缓存命中率、导入成功率、组卷耗时
- Trace：关键链路可接入 OpenTelemetry

## 13. 安全建议
- 文件上传白名单与大小限制
- 图片/附件签名 URL
- 防止越权访问导出与下载接口
- 关键管理接口加操作日志
- SQL 注入、XSS、富文本内容安全过滤
