# 阶段 2A 设计：题库管理、题目编辑与题库下发

日期：2026-04-22  
状态：已确认方向，待进入实现计划  
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 1 已完成基础平台能力，包括认证、多租户、组织课程、公告通知、用户与 RBAC 管理，以及文件资产接口占位实现。  
阶段 2 原始范围包含题库管理、题目编辑器、标签/评论、题库下发、模板下载与导入、题目质疑初版。

为降低阶段切换风险，阶段 2 采用分批交付：

1. 阶段 2A：题库管理、题目编辑、题库下发
2. 阶段 2B：模板下载与导入
3. 阶段 2C：标签、评论、质疑与题目治理

本设计文档仅覆盖阶段 2A。

## 2. 目标

阶段 2A 的目标是先构建一个可被管理端直接使用的题源管理闭环，作为后续练题、考试、导入、质疑的基础。

本阶段完成后，应满足以下结果：

1. 管理员可在管理端创建、编辑、发布题库。
2. 管理员可创建客观题题目，并以版本化方式维护题目内容。
3. 管理员可将题库按授权关系下发给目标范围，而不是复制题库。
4. 管理端可用题库和题目数据为阶段 3 练题、阶段 4 考试提供稳定题源。

## 3. 范围

### 3.1 包含范围

1. 题库：
   - 列表
   - 创建
   - 更新
   - 发布
   - 可见范围授权
2. 题目：
   - 列表
   - 创建
   - 更新主信息
   - 版本列表
   - 新增版本
3. 管理端页面：
   - `题库管理`
   - `题目管理`
4. SDK 与菜单：
   - 管理端菜单新增题库管理、题目管理入口
   - API SDK 补齐题库与题目方法

### 3.2 不包含范围

1. 模板下载与导入
2. 标签系统与题目标签绑定
3. 评论
4. 质疑与审核流
5. 老师用户端题库维护入口
6. 练题与考试能力

这些内容分别留在阶段 2B、2C 或后续阶段处理。

## 4. 关键设计决定

### 4.1 先做管理端，不做老师端

阶段 2A 先保证管理端题源治理闭环。老师虽在最终产品中具备题库维护能力，但本阶段不同时开启老师用户端实现，以减少权限边界、页面路由和体验分叉带来的复杂度。

### 4.2 题库下发采用授权，不复制

沿用既定模型：

- 使用 `question_bank_visibility`
- 下发只增加授权关系
- 不复制题库
- 不复制题目

这样可以保持：

1. 版本源唯一
2. 下级看到的是同一份题库
3. 后续质疑修订、练题、考试都能追溯到统一题源

### 4.3 题目内容必须版本化

阶段 2A 明确区分两类更新：

1. `questions` 主信息更新：
   - 状态
   - 难度
   - 归属基础信息
   - 非版本化字段
2. `question_versions` 内容更新：
   - 题干
   - 选项
   - 答案
   - 解析
   - 变更摘要

任何影响题目内容与判定结果的修改，必须新增版本，不允许直接覆盖历史版本。

### 4.4 阶段 2A 的归属范围先收敛到学校级

虽然数据库模型支持 `system/school/grade/class/teacher` 多层归属，但阶段 2A 为降低实现复杂度，先收敛为：

- `question_banks.owner_org_type = school`
- `questions.owner_org_type = school`
- `owner_org_id` 对应当前租户学校级实体

也就是说：

1. 当前阶段先不开放老师、年级、班级级别的归属编辑
2. 先构建租户内学校级题源库
3. 老师端题库归属与更细粒度 ownership 后续再补

这不会破坏现有数据模型，只是阶段性交互收敛。

### 4.5 题目类型先只开放客观题

阶段 2A 仅开放：

- `single_choice`
- `multiple_choice`
- `true_false`

虽然底层 JSON 结构保留主观题扩展能力，但不在本阶段开放主观题编辑。

## 5. 领域模型落地口径

### 5.1 question_banks

本阶段最小落地字段：

- `id`
- `tenant_id`
- `owner_org_type`
- `owner_org_id`
- `creator_id`
- `course_id`
- `name`
- `description`
- `status`
- `source_type`
- `created_at`
- `updated_at`

业务口径：

1. 新建题库默认 `status=draft`
2. 发布后变为 `active`
3. 暂不实现归档操作
4. `source_type` 本阶段支持 `manual`

### 5.2 question_bank_visibility

本阶段只支持对以下目标下发：

- `school`
- `grade`
- `class`
- `user`

权限类型本阶段只开放：

- `view`
- `practice`
- `exam`

`manage` 权限保留在模型中，但不作为管理端普通下发操作开放。

### 5.3 questions

本阶段最小落地字段：

- `id`
- `tenant_id`
- `owner_org_type`
- `owner_org_id`
- `question_type`
- `difficulty`
- `current_version_id`
- `status`
- `source_type`
- `creator_id`
- `created_at`
- `updated_at`

业务口径：

1. 新建题目默认 `status=active`
2. `source_type` 本阶段支持 `manual`
3. 创建题目时必须同步创建版本 1

### 5.4 question_versions

必须包含：

- `content_json`
- `answer_json`
- `analysis_json`
- `structure_hash`
- `change_summary`
- `version_no`
- `is_published`

业务口径：

1. 新建题目自动生成 `version_no=1`
2. 新增版本时递增 `version_no`
3. `questions.current_version_id` 永远指向最新启用版本
4. 历史版本保留，不做覆盖

### 5.5 question_bank_questions

题目与题库关系通过 `question_bank_questions` 维护。

业务口径：

1. 创建题目时可一次绑定多个题库
2. 后续如需支持题库内排序调整，可基于 `sort_no` 继续扩展
3. 阶段 2A 不单独做复杂拖拽排序能力

## 6. JSON 结构口径

### 6.1 content_json

阶段 2A 使用统一结构：

```json
{
  "stem": {
    "content_type": "text|image|mixed",
    "text": "题干文本",
    "assets": [
      { "url": "https://example.com/a.png", "type": "image" }
    ]
  },
  "options": [
    {
      "key": "A",
      "content_type": "text|image|mixed",
      "text": "选项A",
      "assets": []
    }
  ],
  "option_order_randomizable": true,
  "ext": {}
}
```

约束：

1. 单选、多选必须有 `options`
2. 判断题可不使用动态选项列表，前端以固定“正确/错误”交互收敛
3. 选项 `key` 必须稳定，不能因排序变化而变化

### 6.2 answer_json

单选：

```json
{
  "judge_mode": "by_option_key",
  "correct_keys": ["B"]
}
```

多选：

```json
{
  "judge_mode": "set_exact_match",
  "correct_keys": ["A", "C"]
}
```

判断：

```json
{
  "judge_mode": "boolean",
  "correct_value": true
}
```

约束：

1. 所有选择题答案都按 `option_key` 存储
2. 不能按显示位置或数组下标存储答案
3. 这样可以兼容后续随机选项顺序

## 7. API 设计

### 7.1 阶段 2A 落地接口

题库：

- `GET /api/v1/question-banks`
- `POST /api/v1/question-banks`
- `PUT /api/v1/question-banks/{id}`
- `POST /api/v1/question-banks/{id}/publish`
- `POST /api/v1/question-banks/{id}/visibility`

题目：

- `GET /api/v1/questions`
- `POST /api/v1/questions`
- `PUT /api/v1/questions/{id}`
- `GET /api/v1/questions/{id}/versions`
- `POST /api/v1/questions/{id}/versions`

### 7.2 题库接口最小口径

题库列表查询参数：

- `course_id`
- `status`
- `keyword`
- `page`
- `page_size`

题库列表返回项至少包含：

- `id`
- `name`
- `course_id`
- `status`
- `owner_org_type`
- `owner_org_id`

创建/更新题库请求体：

- `name`
- `course_id`
- `description`

下发请求体：

- `grants[]`
  - `grant_type`
  - `target_type`
  - `target_id`
  - `permission_type`
  - `inherit_to_children`

### 7.3 题目接口最小口径

题目列表查询参数：

- `question_type`
- `course_id`
- `bank_id`
- `status`
- `keyword`
- `page`
- `page_size`

创建题目请求体：

- `question_type`
- `difficulty`
- `content`
- `answer`
- `analysis`
- `bank_ids`

更新题目主信息请求体：

- `difficulty`
- `status`

新增版本请求体：

- `content`
- `answer`
- `analysis`
- `change_summary`

### 7.4 契约更新要求

在正式编码前，应先补齐 `docs/api/openapi.yaml` 的以下内容：

1. 阶段 2A 所有接口的 query 参数
2. request body schema
3. response schema
4. 题目 JSON 结构的最小正式定义

如果正式契约和实现顺序不一致，必须先修契约再写代码。

## 8. 权限与菜单

阶段 2A 直接复用已有权限种子：

- `question_bank:manage`
- `question:manage`

管理端菜单新增：

1. `题库管理` -> `/admin/question-banks`
2. `题目管理` -> `/admin/questions`

页面显示规则：

1. 拥有 `question_bank:manage` 才显示题库管理
2. 拥有 `question:manage` 才显示题目管理
3. 接口权限校验与菜单隐藏必须同时生效

## 9. 管理端页面设计

### 9.1 题库管理页

页面目标：让管理员在一个界面内完成筛选、创建、发布、下发。

最小结构：

1. 顶部标题与主按钮：`创建题库`
2. 筛选区：
   - 课程
   - 状态
   - 关键字
3. 列表区：
   - 名称
   - 课程
   - 状态
   - 创建时间
   - 操作
4. 操作区：
   - 编辑
   - 发布
   - 下发
   - 查看题目

本阶段 UI 形态建议：

1. 主体使用列表 + 轻量侧边编辑区
2. 下发使用独立小表单区域或简单弹层
3. 不做复杂树形组织下发器，先用目标类型 + 目标 ID 的方式落功能

### 9.2 题目管理页

页面目标：先让题目创建、预览、版本新增闭环可用。

最小结构：

1. 顶部标题与主按钮：`创建题目`
2. 筛选区：
   - 题型
   - 难度
   - 题库
   - 状态
3. 列表区：
   - 题型
   - 难度
   - 状态
   - 当前版本号
   - 操作
4. 编辑区：
   - 基础信息
   - 题干
   - 选项
   - 答案
   - 解析
   - 实时预览
   - 关联题库

本阶段 UI 形态建议：

1. `QuestionPanel` 作为列表 + 编辑器组合页
2. 版本历史使用简化列表展示
3. 新增版本使用“基于当前版本复制后修改”的交互

### 9.3 编辑器交互规则

1. 增加选项时自动生成稳定 key
2. 多选答案支持多项勾选
3. 判断题改用布尔答案控件
4. 保存前校验：
   - 题干非空
   - 答案合法
   - 选项 key 唯一
   - 至少绑定一个题库

## 10. 后端实现边界

### 10.1 新模块建议

新增模块：

1. `internal/modules/questionbank`
2. `internal/modules/question`

每个模块延续当前仓库模式：

- `model.go`
- `service.go`
- `handler.go`
- `mysql_repository.go`
- `*_test.go`

### 10.2 数据库访问原则

1. Repository 默认按 `tenant_id` 隔离
2. 阶段 2A 不开放跨租户显式查询
3. 创建题目与创建版本需要事务包裹
4. 题库下发授权写入要避免重复授权冲突

### 10.3 文件资产的使用方式

阶段 2A 若题干或选项带图片，只允许录入：

1. 已有文件资产 URL
2. 已上传文件的访问地址

本阶段不做复杂富文本图片选择器，只保留结构兼容。

## 11. 测试策略

### 11.1 后端

题库模块至少覆盖：

1. 列表过滤
2. 创建题库
3. 更新题库
4. 发布题库
5. 下发授权
6. 无权限访问拒绝
7. 租户隔离

题目模块至少覆盖：

1. 创建题目同时生成版本 1
2. 更新主信息不覆盖版本内容
3. 新增版本号递增
4. 版本列表正确返回
5. 题目与题库关系写入
6. 无权限访问拒绝
7. JSON 结构非法时拒绝

### 11.2 前端

至少覆盖：

1. 题库页加载与创建
2. 题库发布与下发
3. 题目页加载与创建
4. 单选、多选、判断题表单交互
5. 新增版本
6. 权限控制与菜单入口展示

### 11.3 阶段验收

阶段 2A 完成后，最小验收项为：

1. 管理端可创建题库并发布
2. 管理端可创建题目并绑定题库
3. 管理端可新增题目版本
4. 管理端可下发题库授权
5. 所有关键接口具备测试

## 12. 执行顺序

建议按以下顺序实施：

1. 先补阶段 2A spec、OpenAPI 与菜单设计
2. 再补题库模块后端
3. 再补题目与版本模块后端
4. 然后补 SDK
5. 然后补管理端题库页
6. 最后补管理端题目页与版本交互
7. 更新阶段状态文档并做全量验证

## 13. 延后项与风险

### 13.1 延后项

1. 老师端题库管理
2. 模板导入
3. 标签、评论、质疑
4. 复杂组织树下发选择器
5. 富文本/图片混排高级编辑器

### 13.2 风险

1. 如果在 2A 中同时引入老师端 ownership，会显著扩大权限与组织边界复杂度
2. 如果题目内容直接覆盖而不版本化，会破坏后续练题和考试结果可追溯性
3. 如果题库下发改成复制模式，后续版本治理会失控

## 14. 结论

阶段 2A 应作为阶段 2 的第一块垂直闭环，优先落：

- 题库管理
- 题目编辑
- 题库下发

并以“学校级归属、管理端先行、题目版本化、授权式下发”为明确边界。

在此基础上，再进入 2B 导入与 2C 质疑治理，能保证后续阶段的复杂度与返工成本处于可控范围。
