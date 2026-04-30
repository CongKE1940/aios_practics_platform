# 阶段 2F 设计：老师侧班级学习页

日期：2026-04-22
状态：方案 A 已确认，待用户审阅
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 2A 到 2E 已完成题库、导入、练题核心链路、复习闭环和课程来源练题。学生现在可以按题库或课程练题，系统也已经沉淀了 `practice_sessions`、`practice_answers`、`user_question_states` 等练题过程数据。

下一步需要把这些数据反馈给老师，让老师能按班级和课程查看学习情况。阶段 2F 的目标不是建设完整数据大屏，而是先打通 U-18“老师班级学习页”的最小可用闭环：老师能选择自己任课的班级课程，查看班级概览和学生明细，定位谁练了、练得怎么样、错题和疑惑题是否集中。

## 2. 目标

阶段 2F 完成后，应满足：

1. 老师可以查看自己当前任课班级和课程的练题学习数据。
2. 管理员可以查看当前租户范围内的班级课程练题数据。
3. 班级学习页展示班级课程概览：学生数、参与学生数、练题次数、答题数、正确率、错题数、疑惑题数、最近练习时间。
4. 班级学习页展示学生明细：学生 ID、学生名称、练题次数、答题数、正确率、错题数、疑惑题数、最近练习时间。
5. 支持 `class_id`、`course_id`、时间范围和分页。
6. OpenAPI、SDK、后端测试、前端测试和阶段状态文档同步更新。

## 3. 范围

### 3.1 包含范围

1. 新增或正式化老师侧班级学习 API：
   - `GET /api/v1/analytics/class-practice-summary`
2. 后端新增 `analytics` 模块：
   - Handler 解析 JWT、权限和查询参数。
   - Service 负责权限口径、时间范围和分页规则。
   - Repository 负责 MySQL 聚合查询。
3. API 返回一个班级课程概览和学生明细分页。
4. 老师数据范围：
   - 老师只能查看 `teacher_class_course_assignments` 中自己当前任课、状态为 `active` 的 `class_id + course_id`。
5. 管理员数据范围：
   - 拥有 `analytics:view` 且 `user_type` 为 `sys_admin` 或 `school_admin` 的用户，可以查看当前租户内数据。
6. 用户端新增“班级学习”入口：
   - 复用 user app。
   - 使用 `analytics:view` 权限展示菜单。
   - 最小页面包含筛选区、概览区、学生明细表、加载态、错误态和空态。
7. SDK 增加班级学习接口与类型。
8. OpenAPI、设计说明、阶段状态文档更新。

### 3.2 不包含范围

1. 趋势图、排行榜、班级对比和导出。
2. 知识点掌握度、标签维度分析和难度维度分析。
3. 考试数据聚合。
4. 学生个人学习报告详情页。
5. 从班级学习页直接跳转到学生错题详情。
6. 自动预警、推荐练习和教师批注。
7. 新增统计冗余表或异步聚合任务。
8. 完整组织树选择器。

这些能力后续拆到数据看板、考试闭环和教师教学工具阶段。

## 4. 核心设计

### 4.1 API 形态

阶段 2F 新增正式接口：

```text
GET /api/v1/analytics/class-practice-summary
```

查询参数：

1. `class_id`：必填，正整数。
2. `course_id`：必填，正整数。
3. `start_at`：可选，ISO 8601 时间字符串。
4. `end_at`：可选，ISO 8601 时间字符串。
5. `page`：可选，默认 1。
6. `page_size`：可选，默认 20，最大 100。

`class_id` 和 `course_id` 同时必填，是为了避免阶段 2F 做过宽的统计查询，也让老师查看范围与任课关系一一对应。

### 4.2 响应结构

响应数据结构：

```json
{
  "summary": {
    "class_id": 101,
    "class_name": "一班",
    "course_id": 12,
    "course_name": "数学",
    "student_count": 45,
    "participated_student_count": 38,
    "session_count": 96,
    "answered_count": 820,
    "correct_count": 690,
    "wrong_count": 130,
    "accuracy": 0.8415,
    "wrong_question_count": 76,
    "confused_question_count": 18,
    "last_practiced_at": "2026-04-22T19:30:00+08:00"
  },
  "students": {
    "items": [
      {
        "student_id": 7001,
        "student_name": "张三",
        "student_no": "S001",
        "session_count": 4,
        "answered_count": 36,
        "correct_count": 30,
        "wrong_count": 6,
        "accuracy": 0.8333,
        "wrong_question_count": 5,
        "confused_question_count": 1,
        "last_practiced_at": "2026-04-22T19:30:00+08:00"
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 45
  }
}
```

统计口径：

1. `student_count` 来自当前班级有效学生归属：`student_class_memberships.is_current=1 AND status='active'`。
2. `participated_student_count` 为时间范围内有练题会话或答题记录的学生去重数。
3. `session_count` 统计 `practice_sessions`，限定 `tenant_id`、`course_id`、学生属于该班级。
4. `answered_count`、`correct_count`、`wrong_count` 统计 `practice_answers`。
5. `accuracy = correct_count / answered_count`，无答题时为 0。
6. `wrong_question_count` 统计 `user_question_states.practice_wrong_count > 0` 且题目当前属于该课程可用题库的去重题目数。
7. `confused_question_count` 统计 `user_question_states.is_confused = 1` 且题目当前属于该课程可用题库的去重题目数。
8. `last_practiced_at` 优先取最近答题时间，没有答题时取最近会话开始时间，没有练习时为空。

### 4.3 时间范围

时间过滤规则：

1. `start_at` 和 `end_at` 都不传时，默认统计最近 30 天。
2. 只传 `start_at` 时，统计从 `start_at` 到当前时间。
3. 只传 `end_at` 时，统计 `end_at` 前 30 天到 `end_at`。
4. `start_at` 必须早于或等于 `end_at`。
5. 时间范围最长 366 天，超过则返回 400。

默认最近 30 天可以降低查询压力，也更符合老师日常查看近期学习状态的场景。

### 4.4 权限与数据范围

接口要求 access token 有 `analytics:view` 权限。

授权规则：

1. `user_type=sys_admin`：可查看当前 token 租户内任意班级课程数据。
2. `user_type=school_admin`：阶段 2F 暂按当前 token 租户内管理员处理，后续再接学校级数据范围。
3. `user_type=teacher`：只能查看自己当前任课的 `class_id + course_id`。
4. 其他用户类型返回 403。
5. 跨租户数据始终不可见。

老师任课判断：

```sql
teacher_class_course_assignments.tenant_id = token.tenant_id
AND teacher_id = token.user_id
AND class_id = :class_id
AND course_id = :course_id
AND is_current = 1
AND status = 'active'
```

如果班级或课程不存在，返回 404；如果存在但用户无权查看，返回 403。

### 4.5 数据查询边界

阶段 2F 直接基于现有明细表实时聚合：

1. `student_class_memberships`
2. `users`
3. `student_profiles`
4. `classes`
5. `courses`
6. `practice_sessions`
7. `practice_answers`
8. `user_question_states`
9. `question_bank_questions`
10. `question_banks`

暂不新增统计表。原因是阶段 2F 的目标是打通教学视角，当前数据量仍属于开发早期，先用实时查询更利于校准口径。后续当数据量上来，再把该接口的口径沉淀成异步聚合任务或物化统计表。

### 4.6 前端页面

用户端新增页面：

```text
/app/class-learning
```

菜单：

1. 所属一级菜单：学习中心。
2. 菜单名称：班级学习。
3. 权限：`analytics:view`。

页面布局：

1. 筛选区：
   - 班级 ID 输入框。
   - 课程 ID 输入框。
   - 开始时间输入框。
   - 结束时间输入框。
   - 查询按钮。
2. 概览区：
   - 学生数。
   - 参与学生数。
   - 练题次数。
   - 答题数。
   - 正确率。
   - 错题数。
   - 疑惑题数。
   - 最近练习时间。
3. 明细表：
   - 学生。
   - 学号。
   - 练题次数。
   - 答题数。
   - 正确率。
   - 错题数。
   - 疑惑题数。
   - 最近练习时间。
4. 状态：
   - Loading：查询中。
   - Empty：无学生或无练题数据。
   - Error：展示后端错误信息。
   - No Permission：无菜单权限时不显示入口；接口返回 403 时页面展示无权限提示。

阶段 2F 先用 ID 输入作为最小可用入口，不建设完整班级/课程选择器。这样能延续阶段 2E 的最小入口策略，把复杂选择器留到组织与课程体验打磨阶段。

## 5. 错误处理

后端错误口径：

1. 参数缺失或格式错误：400。
2. 时间范围非法：400。
3. 班级或课程不存在：404。
4. 缺少 `analytics:view`：403。
5. 老师不任教该班级课程：403。
6. 数据库查询失败：500，并记录服务端日志。

前端错误口径：

1. 400：提示检查班级、课程或时间范围。
2. 403：提示当前账号无权查看该班级课程。
3. 404：提示班级或课程不存在。
4. 其它错误：提示稍后重试。

## 6. 测试策略

### 6.1 后端测试

新增 `internal/modules/analytics` 的 handler/service 测试：

1. 老师查看自己当前任课班级课程，返回概览和学生明细。
2. 老师查看非任课班级课程，返回 403。
3. 管理员查看当前租户班级课程，返回成功。
4. 缺少 `analytics:view`，返回 403。
5. `class_id` 或 `course_id` 缺失，返回 400。
6. 时间范围超过 366 天，返回 400。
7. 无练题数据时仍返回学生数，练题指标为 0。
8. 正确率计算在 `answered_count=0` 时返回 0。

新增 MySQL repository 测试：

1. 任课关系查询必须限定 `tenant_id`。
2. 班级学生分页必须包含未练题学生。
3. 答题聚合不能把其它课程、其它班级、其它租户的数据计入。
4. 错题和疑惑题统计按课程可用题库过滤。

### 6.2 SDK 测试

新增 API SDK 测试：

1. `getClassPracticeSummary` 能正确拼接 `class_id`、`course_id`、`start_at`、`end_at`、分页参数。
2. 返回类型包含 `summary` 和 `students`。

### 6.3 前端测试

新增用户端测试：

1. 有 `analytics:view` 权限时菜单显示“班级学习”。
2. 输入班级 ID、课程 ID 后点击查询，会调用 SDK。
3. 概览指标和学生明细正常渲染。
4. 空数据时显示空态。
5. 403 时显示无权限提示。

## 7. 文档与迁移

阶段 2F 不新增数据库表，不拆分新的 migration。

需要更新：

1. `docs/api/openapi.yaml`
2. `docs/docs/openapi_design_v1.md`
3. `docs/docs/26_stage2f_implementation_status.md`
4. `docs/README.md`

如果实现过程中发现现有索引不足，仅在计划中记录索引建议，不直接修改已执行 migration。需要新增索引时另开正式 migration，并在设计变更中说明原因。

## 8. 验收标准

阶段 2F 验收标准：

1. 老师账号只能查看自己任课的班级课程。
2. 管理员账号可以查看当前租户范围内的班级课程。
3. 班级概览和学生明细的统计口径与文档一致。
4. 前端页面能完成查询、展示、空态和错误态。
5. OpenAPI 与 SDK 字段一致。
6. `pnpm test`、`pnpm typecheck`、`pnpm build`、`go test -work ./...` 通过。
7. 提交前无 BOM、混合换行、异常引用标记和敏感明文。
