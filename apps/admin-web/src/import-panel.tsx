import { useEffect, useState, type FormEvent } from "react";

import type {
  ImportJob,
  ImportJobInput,
  ImportJobRow,
  ImportTemplateType,
  PageResult
} from "@aios/api-sdk";

export interface ImportPanelApi {
  downloadImportTemplate(type: ImportTemplateType): Promise<string>;
  listImportJobs(): Promise<PageResult<ImportJob>>;
  createImportJob(body: ImportJobInput): Promise<ImportJob>;
  listImportJobRows(id: number): Promise<PageResult<ImportJobRow>>;
}

const defaultForm = {
  import_type: "question",
  template_version: "v1",
  file_url: "",
  content: ""
};

export function ImportPanel({ api }: { api: ImportPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [templatePreview, setTemplatePreview] = useState("");
  const [items, setItems] = useState<ImportJob[]>([]);
  const [rows, setRows] = useState<ImportJobRow[]>([]);
  const [form, setForm] = useState(defaultForm);

  async function loadJobs() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listImportJobs();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载导入任务失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [api]);

  async function handleDownload(type: ImportTemplateType) {
    const content = await api.downloadImportTemplate(type);
    setTemplatePreview(content.trim());
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createImportJob({
      import_type: form.import_type,
      template_version: form.template_version,
      file_url: form.file_url,
      content: form.content
    });
    setForm(defaultForm);
    await loadJobs();
  }

  async function handleLoadRows(id: number) {
    const result = await api.listImportJobRows(id);
    setRows(result.items);
  }

  return (
    <section aria-label="导入中心面板">
      <h2>导入中心</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <section aria-label="模板下载">
        <button type="button" onClick={() => void handleDownload("question")}>
          下载题目模板
        </button>
        <button type="button" onClick={() => void handleDownload("question_bank")}>
          下载题库模板
        </button>
        <button type="button" onClick={() => void handleDownload("exam")}>
          下载考试模板
        </button>
        {templatePreview ? <pre>{templatePreview}</pre> : null}
      </section>

      <form onSubmit={(event) => void handleCreate(event)}>
        <label htmlFor="import_type">导入类型</label>
        <select
          id="import_type"
          value={form.import_type}
          onChange={(event) => setForm((current) => ({ ...current, import_type: event.target.value }))}
        >
          <option value="question">question</option>
          <option value="question_bank">question_bank</option>
        </select>
        <label htmlFor="import_template_version">模板版本</label>
        <input
          id="import_template_version"
          value={form.template_version}
          onChange={(event) => setForm((current) => ({ ...current, template_version: event.target.value }))}
        />
        <label htmlFor="import_file_url">文件地址</label>
        <input
          id="import_file_url"
          value={form.file_url}
          onChange={(event) => setForm((current) => ({ ...current, file_url: event.target.value }))}
        />
        <label htmlFor="import_content">CSV 内容</label>
        <textarea
          id="import_content"
          value={form.content}
          onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
        />
        <button type="submit">创建导入任务</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th>状态</th>
            <th>总行</th>
            <th>成功</th>
            <th>失败</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.import_type}</td>
              <td>{item.status}</td>
              <td>{item.total_rows}</td>
              <td>{item.success_rows}</td>
              <td>{item.failed_rows}</td>
              <td>
                <button type="button" onClick={() => void handleLoadRows(item.id)}>
                  查看行结果
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-label="行级结果">
        <h3>行级结果</h3>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.row_no}</span>
              <span>{row.status}</span>
              <span>{row.error_code ?? "-"}</span>
              <span>{row.error_message ?? "-"}</span>
              <span>{row.target_entity_type ?? "-"}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
