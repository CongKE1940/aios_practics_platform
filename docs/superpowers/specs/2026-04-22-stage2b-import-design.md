# 阶段 2B 设计：模板下载与导入任务

日期：2026-04-22
状态：已确认方向，待进入实现计划
适用仓库：`D:\workspace\projects\aios_practice_platform`

## 1. 背景

阶段 2A 已完成管理端题库管理、题目管理、题目版本与题库下发闭环。阶段 2B 继续补齐题库与题目的批量导入能力，让管理员可以通过标准模板批量创建题库和题目，并查看行级导入结果。

当前系统已经具备以下基础：

1. `file_assets` 文件资产登记接口，初版支持上传与远端 URL 转储。
2. `import_jobs` 与 `import_job_rows` 数据表。
3. 题库和题目后端模块。
4. 管理端最小页面与 API SDK。
5. 导入模板文件：
   - `docs/templates/15_question_import_template.csv`
   - `docs/templates/16_bank_import_template.csv`
   - `docs/templates/17_exam_import_template.csv`

阶段 2B 需要把这些能力串成一个可验收的最小真实闭环。

## 2. 目标

阶段 2B 的目标是完成模板下载、导入任务创建、行级校验反馈与题库/题目写入。

本阶段完成后，应满足：

1. 管理员可下载题目、题库、考试三类 CSV 模板。
2. 管理员可创建题库导入任务，合法行写入题库，非法行记录行级错误。
3. 管理员可创建题目导入任务，合法行写入题目、版本 1 和题库关联，非法行记录行级错误。
4. 管理员可查看导入任务列表、详情和行级结果。
5. 导入接口必须按当前用户 `tenant_id` 隔离，不允许跨租户读取任务或结果。

## 3. 范围

### 3.1 包含范围

1. 模板下载：
   - `GET /api/v1/import/templates/{type}`
   - 支持 `question`、`question_bank`、`exam`
2. 导入任务：
   - `POST /api/v1/import/jobs`
   - `GET /api/v1/import/jobs`
   - `GET /api/v1/import/jobs/{id}`
   - `GET /api/v1/import/jobs/{id}/rows`
3. 导入类型：
   - `question_bank`
   - `question`
4. 管理端页面：
   - 导入中心
   - 模板下载入口
   - 导入任务创建
   - 行级结果查看
5. SDK 与菜单：
   - 管理端菜单新增导入中心入口
   - API SDK 补齐导入方法

### 3.2 不包含范围

1. 完整异步队列。
2. xlsx 解析。
3. 真实对象存储内容回放。
4. 考试导入落库。
5. AI 识别导入、图片批量识别导入。
6. 导入撤销、批量回滚。

这些内容后续在对象存储、考试模块和异步任务基础设施稳定后再补。

## 4. 关键设计决定

### 4.1 阶段 2B 先采用同步导入

虽然导入任务最终适合异步队列，但当前系统尚未引入队列基础设施。阶段 2B 先采用同步处理：

1. 创建导入任务。
2. 解析 CSV 文本。
3. 校验每一行。
4. 写入合法数据。
5. 回写任务统计与行级结果。
6. 返回导入任务详情。

同步导入仍保留 `import_jobs.status` 状态机，后续接入异步队列时可以复用当前任务与行级结果模型。

### 4.2 导入任务创建请求先使用 JSON

正式 OpenAPI 早期草案使用 `multipart/form-data` 上传文件。阶段 2B 为复用阶段 1 的文件资产接口，导入任务创建先采用 JSON：

```json
{
  "import_type": "question",
  "template_version": "v1",
  "file_asset_id": 1,
  "file_url": "/api/v1/files/1/content",
  "content": "csv text"
}
```

其中：

1. `file_asset_id` 可选，但如果存在，需要写入 `import_jobs.file_asset_id`。
2. `file_url` 必填，写入 `import_jobs.file_url`。
3. `content` 为阶段 2B 的同步 CSV 内容来源。
4. 后续接入真实对象存储后，可通过 `file_asset_id` 拉取内容并去掉前端直传 `content` 的临时口径。

### 4.3 模板下载走仓库内模板文件

模板下载直接读取 `docs/templates` 下的 CSV 文件：

1. `question` -> `docs/templates/15_question_import_template.csv`
2. `question_bank` -> `docs/templates/16_bank_import_template.csv`
3. `exam` -> `docs/templates/17_exam_import_template.csv`

返回 `text/csv; charset=utf-8`，并设置下载文件名。

### 4.4 题库导入字段映射

题库模板字段：

```csv
bank_name,owner_scope_type,owner_scope_name,course_name,description,status
```

阶段 2B 字段口径：

1. `bank_name` 必填，映射 `question_banks.name`。
2. `course_name` 可选，按当前租户 `courses.name` 查找课程；找不到时记录行级错误，不自动创建课程。
3. `description` 可选。
4. `status` 可选，允许 `draft / active`，为空默认 `draft`。
5. `owner_scope_type` 与 `owner_scope_name` 阶段 2B 仅记录到行级归一化数据，不改变阶段 2A 的学校级归属收敛口径。

### 4.5 题目导入字段映射

题目模板字段：

```csv
bank_name,course_name,question_type,stem_type,stem_content,option_a,option_b,option_c,option_d,option_e,option_f,correct_options,analysis,difficulty,system_tags
```

阶段 2B 字段口径：

1. `bank_name` 必填，按当前租户题库名称查找；找不到时记录行级错误，不自动创建题库。
2. `question_type` 必填，允许 `single_choice / multiple_choice / true_false`。
3. `stem_content` 必填。
4. 单选、多选必须至少有两个选项。
5. 单选 `correct_options` 必须恰好一个选项 key。
6. 多选 `correct_options` 至少两个选项 key。
7. 判断题支持 `correct_options=true/false/A/B`，归一化为布尔答案。
8. `analysis` 可选，写入 `analysis_json.text`。
9. `difficulty` 可选，允许 `easy / medium / hard`，为空默认 `medium`。
10. `system_tags` 阶段 2B 暂不写入标签表，仅记录在 `import_job_rows.normalized_data_json`。

### 4.6 行级错误必须可追踪

每一行导入结果都写入 `import_job_rows`：

1. `row_no` 使用 CSV 中的物理数据行号，表头下一行是 2。
2. `raw_data_json` 保存原始字段。
3. `normalized_data_json` 保存归一化后的字段。
4. 成功行：
   - `status=success`
   - `target_entity_type=question_bank` 或 `question`
   - `target_entity_id` 指向创建的数据
5. 失败行：
   - `status=failed`
   - `error_code` 使用稳定字符串
   - `error_message` 使用中文可读错误说明

### 4.7 任务状态口径

阶段 2B 使用以下状态：

1. `uploaded`：任务已创建。
2. `parsing`：解析 CSV。
3. `validating`：校验字段。
4. `importing`：写入业务表。
5. `success`：全部成功。
6. `partial_success`：部分成功、部分失败。
7. `failed`：全部失败或模板无法解析。

由于同步执行速度较快，管理端最终看到的通常是 `success / partial_success / failed`。

## 5. API 设计

### 5.1 下载模板

`GET /api/v1/import/templates/{type}`

路径参数：

- `type`: `question / question_bank / exam`

返回：

- `text/csv; charset=utf-8`

### 5.2 创建导入任务

`POST /api/v1/import/jobs`

请求体：

```json
{
  "import_type": "question",
  "template_version": "v1",
  "file_asset_id": 1,
  "file_url": "/api/v1/files/1/content",
  "content": "bank_name,course_name,..."
}
```

返回：

```json
{
  "id": 1,
  "tenant_id": 1,
  "import_type": "question",
  "template_version": "v1",
  "file_asset_id": 1,
  "file_url": "/api/v1/files/1/content",
  "status": "partial_success",
  "total_rows": 2,
  "success_rows": 1,
  "failed_rows": 1,
  "error_summary": "1 行导入失败",
  "operator_id": 1
}
```

### 5.3 任务列表

`GET /api/v1/import/jobs`

查询参数：

- `import_type`
- `status`
- `page`
- `page_size`

### 5.4 任务详情

`GET /api/v1/import/jobs/{id}`

按 `tenant_id` 隔离，跨租户访问返回 404。

### 5.5 行级结果

`GET /api/v1/import/jobs/{id}/rows`

查询参数：

- `status`
- `page`
- `page_size`

按任务 `tenant_id` 隔离。

## 6. 权限与菜单

阶段 2B 复用已存在权限：

- `import:manage`

管理端菜单新增：

- `导入中心` -> `/admin/imports`

接口规则：

1. 无 `import:manage` 权限返回 403。
2. 无效 token 返回 401。
3. 跨租户任务访问返回 404。

## 7. 管理端页面

### 7.1 导入中心

页面包含：

1. 模板下载区：
   - 下载题目模板
   - 下载题库模板
   - 下载考试模板
2. 导入任务创建区：
   - 导入类型
   - 模板版本
   - 文件 URL
   - CSV 内容输入框
   - 创建导入任务按钮
3. 任务列表：
   - 导入类型
   - 状态
   - 总行数
   - 成功行数
   - 失败行数
   - 操作：查看行结果
4. 行结果区：
   - 行号
   - 状态
   - 错误码
   - 错误说明
   - 目标实体

### 7.2 页面限制

阶段 2B 页面以功能闭环优先：

1. 不做拖拽上传。
2. 不做 xlsx 预览。
3. 不做复杂进度条。
4. 不做导入撤销。

## 8. 测试策略

### 8.1 后端测试

后端必须覆盖：

1. 模板下载返回 CSV。
2. 题库导入合法行创建题库。
3. 题库导入非法课程名记录行级错误。
4. 题目导入合法行创建题目和版本 1。
5. 题目导入未知题库记录行级错误。
6. 查询任务列表、详情、行结果。
7. 无 `import:manage` 权限返回 403。
8. 跨租户任务访问返回 404。

### 8.2 前端与 SDK 测试

前端必须覆盖：

1. SDK 创建导入任务请求体。
2. SDK 查询任务与行级结果路径。
3. 管理端导入中心可下载模板、创建任务、查看行结果。
4. 主应用菜单可进入导入中心。

## 9. 验收标准

阶段 2B 完成时必须通过：

1. `go test -work ./...`
2. `pnpm test`
3. `pnpm typecheck`
4. `pnpm build`
5. OpenAPI 可解析
6. 无残留异常引用标记
7. 无 UTF-8 BOM 与混合换行

## 10. 后续扩展

阶段 2B 完成后，后续可继续增强：

1. 接入真实对象存储内容读取。
2. 支持 xlsx。
3. 将同步导入替换为异步任务。
4. 导入完成后生成错误报告文件。
5. 考试模板导入落库。
6. 支持导入撤销或批量回滚。
