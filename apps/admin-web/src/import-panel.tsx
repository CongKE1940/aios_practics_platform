import { useEffect, useState, type FormEvent } from "react";

import type {
  ImportJob,
  ImportJobType,
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

interface ImportFormState {
  import_type: ImportJobType;
  template_version: string;
  file_url: string;
  content: string;
}

const importTypes: Array<{ value: ImportTemplateType; label: string; filename: string }> = [
  { value: "org_structure", label: "组织/年级/班级", filename: "org_structure_import_template.csv" },
  { value: "admin", label: "管理员", filename: "admin_import_template.csv" },
  { value: "teacher", label: "教师", filename: "teacher_import_template.csv" },
  { value: "course", label: "课程", filename: "course_import_template.csv" },
  { value: "student", label: "学生", filename: "student_import_template.csv" },
  { value: "question_bank", label: "题库", filename: "question_bank_import_template.csv" },
  { value: "question", label: "题目", filename: "question_import_template.csv" },
  { value: "exam", label: "考试", filename: "exam_import_template.csv" },
  { value: "exam_paper", label: "试卷", filename: "exam_paper_import_template.csv" }
];

const defaultForm: ImportFormState = {
  import_type: "org_structure",
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
  const [rowResultJob, setRowResultJob] = useState<ImportJob | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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

  useEffect(() => {
    if (!items.some((item) => isRunningStatus(item.status))) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [api, items]);

  async function handleDownload(type: ImportTemplateType) {
    setErrorMessage("");
    try {
      const content = await api.downloadImportTemplate(type);
      setTemplatePreview(content.trim());
      downloadCSV(content, importTypes.find((item) => item.value === type)?.filename ?? `${type}_import_template.csv`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "模板下载失败");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await api.createImportJob({
        import_type: form.import_type,
        template_version: form.template_version,
        file_url: form.file_url,
        content: form.content
      });
      setStatusMessage("导入任务已进入后台处理");
      setForm((current) => ({ ...defaultForm, import_type: current.import_type }));
      await loadJobs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建导入任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoadRows(job: ImportJob) {
    const result = await api.listImportJobRows(job.id);
    setRows(result.items);
    setRowResultJob(job);
  }

  return (
    <section aria-label="导入中心面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">导入中心</span>
            <h2>导入中心</h2>
          </div>
          <div className="ui-admin-toolbar">
            <select
              aria-label="模板类型"
              value={form.import_type}
              onChange={(event) =>
                setForm((current) => ({ ...current, import_type: event.target.value as ImportTemplateType }))
              }
            >
              {importTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="button" className="ui-button ui-button--primary" onClick={() => void handleDownload(form.import_type)}>
              下载模板
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {statusMessage ? <div className="ui-status ui-status--success">{statusMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>创建导入任务</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid ui-admin-form__grid--wide" onSubmit={(event) => void handleCreate(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="import_type">导入类型</label>
                  <select
                    id="import_type"
                    value={form.import_type}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, import_type: event.target.value as ImportTemplateType }))
                    }
                  >
                    {importTypes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="import_template_version">模板版本</label>
                  <input
                    id="import_template_version"
                    value={form.template_version}
                    onChange={(event) => setForm((current) => ({ ...current, template_version: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="import_file_url">文件地址</label>
                  <input
                    id="import_file_url"
                    value={form.file_url}
                    onChange={(event) => setForm((current) => ({ ...current, file_url: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="import_content">CSV 内容</label>
                  <textarea
                    id="import_content"
                    value={form.content}
                    onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary" disabled={submitting}>
                    {submitting ? "提交中..." : "创建导入任务"}
                  </button>
                </div>
              </form>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>导入任务列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>状态</th>
                    <th>总行数</th>
                    <th>成功</th>
                    <th>失败</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{getImportTypeLabel(item.import_type)}</td>
                      <td>
                        <span className={statusClassName(item.status)}>{getStatusLabel(item.status)}</span>
                      </td>
                      <td>{item.total_rows}</td>
                      <td>{item.success_rows}</td>
                      <td>{item.failed_rows}</td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => void handleLoadRows(item)}>
                            查看行结果
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <aside className="ui-admin-side-card">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>模板预览</h3>
                </div>
              </div>
              {templatePreview ? <pre className="ui-admin-code-block">{templatePreview}</pre> : <div className="ui-admin-empty-inline">请选择左侧模板下载预览内容</div>}
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>行级结果</h3>
                </div>
              </div>
              {rowResultJob ? (
                <div className="ui-admin-empty-inline">行级结果已在弹窗中展示</div>
              ) : rows.length > 0 ? (
                <div className="ui-admin-mini-list">
                  {rows.map((row) => (
                    <article key={row.id} className="ui-admin-mini-item">
                      <strong>{`第 ${row.row_no} 行`}</strong>
                      <p>{row.error_message ?? row.status}</p>
                      <div className="ui-admin-row-meta">
                        <span>{row.error_code ?? "-"}</span>
                        <span>{row.target_entity_type ?? "-"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="ui-admin-empty-inline">选择任务后可查看行级结果</div>
              )}
            </section>
          </aside>
        </div>
      ) : null}

      {rowResultJob ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="导入行结果弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>导入行结果</h3>
                <p>{`${getImportTypeLabel(rowResultJob.import_type)} / ${getStatusLabel(rowResultJob.status)}`}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setRowResultJob(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>总行数</dt>
                  <dd>{rowResultJob.total_rows}</dd>
                </div>
                <div>
                  <dt>成功</dt>
                  <dd>{rowResultJob.success_rows}</dd>
                </div>
                <div>
                  <dt>失败</dt>
                  <dd>{rowResultJob.failed_rows}</dd>
                </div>
                <div>
                  <dt>错误摘要</dt>
                  <dd>{rowResultJob.error_summary ?? "-"}</dd>
                </div>
              </dl>
              {rows.length > 0 ? (
                <div className="ui-admin-mini-list">
                  {rows.map((row) => (
                    <article key={row.id} className="ui-admin-mini-item">
                      <strong>{`第 ${row.row_no} 行`}</strong>
                      <p>{row.error_message ?? row.status}</p>
                      <div className="ui-admin-row-meta">
                        <span>{row.error_code ?? "-"}</span>
                        <span>{row.target_entity_type ?? "-"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="ui-admin-empty-inline">暂无行级结果</div>
              )}
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setRowResultJob(null)}>
                我知道了
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function statusClassName(value: string): string {
  switch (value) {
    case "success":
      return "ui-admin-status ui-admin-status--active";
    case "partial_success":
    case "uploaded":
    case "parsing":
    case "validating":
    case "importing":
      return "ui-admin-status ui-admin-status--pending";
    case "failed":
      return "ui-admin-status ui-admin-status--danger";
    default:
      return "ui-admin-status ui-admin-status--draft";
  }
}

function getImportTypeLabel(value: string): string {
  return importTypes.find((item) => item.value === value)?.label ?? value;
}

function getStatusLabel(value: string): string {
  switch (value) {
    case "uploaded":
      return "已入队";
    case "parsing":
      return "解析中";
    case "validating":
      return "校验中";
    case "importing":
      return "导入中";
    case "success":
      return "成功";
    case "partial_success":
      return "部分成功";
    case "failed":
      return "失败";
    case "rolled_back":
      return "已回滚";
    default:
      return value;
  }
}

function isRunningStatus(value: string): boolean {
  return ["uploaded", "parsing", "validating", "importing"].includes(value);
}

function downloadCSV(content: string, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom")) {
    return;
  }
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
