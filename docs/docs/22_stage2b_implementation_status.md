# 阶段 2B 实施状态：模板下载与导入任务

日期：2026-04-22
状态：已完成实现并通过验证，待提交归档

## 1. 本阶段完成内容

阶段 2B 已完成模板下载、同步导入任务、行级导入结果、SDK 与管理端导入中心闭环。

后端新增：
- `GET /api/v1/import/templates/{type}`：下载 `question`、`question_bank`、`exam` 三类 CSV 模板。
- `POST /api/v1/import/jobs`：以 JSON 请求创建同步导入任务。
- `GET /api/v1/import/jobs`：查看导入任务列表。
- `GET /api/v1/import/jobs/{id}`：查看导入任务详情。
- `GET /api/v1/import/jobs/{id}/rows`：查看行级导入结果。

管理端新增：
- `/admin/imports` 导入中心。
- 模板下载按钮。
- 导入任务创建表单。
- 导入任务列表与行级结果查看。

SDK 新增：
- `downloadImportTemplate`
- `createImportJob`
- `listImportJobs`
- `getImportJob`
- `listImportJobRows`

## 2. 已落实的业务口径

1. 题库导入支持按 `course_name` 查找当前租户课程，课程不存在时记录行级错误，不自动创建课程。
2. 题目导入支持 `single_choice`、`multiple_choice`、`true_false`。
3. 题目导入按当前租户题库名称查找题库，题库不存在时记录行级错误。
4. 成功行写入业务表，失败行写入 `import_job_rows`。
5. 导入任务和行级结果均按 `tenant_id` 隔离，跨租户访问返回 404。
6. `exam` 当前仅支持模板下载，不做导入落库。

## 3. 当前限制

1. 导入处理为同步执行，尚未接入异步队列。
2. 当前仅解析 CSV，不支持 xlsx。
3. 阶段 2B 的 `content` 字段是临时同步导入内容来源；后续对象存储稳定后改为服务端根据 `file_asset_id` 读取文件内容。
4. 题目 `system_tags` 仅进入行级归一化数据，暂不写入标签表。
5. 导入失败报告文件、撤销和批量回滚未纳入本阶段。

## 4. 已执行验证

已执行：

```powershell
go test -work ./...
pnpm test
pnpm typecheck
pnpm build
```

同时已完成：

1. OpenAPI YAML 解析检查。
2. 敏感密码与异常引用标记检查。
3. UTF-8 编码、BOM 与混合换行检查。

## 5. 下一阶段建议

阶段 2C 建议进入练题核心链路：

1. 练题会话创建。
2. 题目抽取与作答提交。
3. 用户题目状态更新。
4. 错题、熟题、疑惑题基础闭环。

对象存储内容回放、xlsx 导入、异步导入队列和考试导入建议作为后续独立增强。
