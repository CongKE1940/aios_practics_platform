import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  PageResult,
  QuestionBank,
  QuestionBankInput,
  QuestionBankVisibilityInput
} from "@aios/api-sdk";

export interface TeacherQuestionBankApi {
  listQuestionBanks(): Promise<PageResult<QuestionBank>>;
  createQuestionBank(body: QuestionBankInput): Promise<QuestionBank>;
  publishQuestionBank(id: number): Promise<QuestionBank>;
  assignQuestionBankVisibility(id: number, body: QuestionBankVisibilityInput): Promise<boolean>;
}

const defaultForm = {
  name: "",
  course_id: "",
  description: ""
};

export function TeacherQuestionBankPage({ api }: { api: TeacherQuestionBankApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<QuestionBank[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    if (!selectedID && items.length > 0) {
      setSelectedID(items[0].id);
    }
  }, [items, selectedID]);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listQuestionBanks();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载老师题库失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createQuestionBank({
      name: form.name,
      course_id: form.course_id ? Number(form.course_id) : undefined,
      description: form.description || undefined
    });
    setForm(defaultForm);
    await loadAll();
  }

  async function handlePublish(id: number) {
    await api.publishQuestionBank(id);
    await loadAll();
  }

  async function handleAssign(id: number) {
    await api.assignQuestionBankVisibility(id, {
      grants: [
        {
          grant_type: "class",
          target_type: "class",
          target_id: 1,
          permission_type: "practice",
          inherit_to_children: false
        }
      ]
    });
  }

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedID) ?? items[0] ?? null, [items, selectedID]);

  return (
    <section aria-label="老师题库页" className="ui-admin-page ui-user-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">老师题库</span>
            <h2>老师题库</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--primary" onClick={() => void loadAll()}>
              刷新题库
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>创建题库</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="teacher_bank_name">题库名称</label>
                  <input id="teacher_bank_name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="teacher_bank_course_id">课程 ID</label>
                  <input
                    id="teacher_bank_course_id"
                    value={form.course_id}
                    onChange={(event) => setForm((current) => ({ ...current, course_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="teacher_bank_description">题库说明</label>
                  <textarea
                    id="teacher_bank_description"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新建题库
                  </button>
                </div>
              </form>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>题库列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>题库名称</th>
                    <th>课程 ID</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.course_id ?? "-"}</td>
                      <td>
                        <span className={item.status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--draft"}>
                          {item.status === "active" ? "已发布" : "草稿"}
                        </span>
                      </td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => setSelectedID(item.id)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handlePublish(item.id)}>
                            发布
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleAssign(item.id)}>
                            下发
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
                  <h3>题库详情</h3>
                </div>
              </div>
              {selectedItem ? (
                <dl className="ui-admin-meta-list">
                  <div>
                    <dt>名称</dt>
                    <dd>{selectedItem.name}</dd>
                  </div>
                  <div>
                    <dt>课程 ID</dt>
                    <dd>{selectedItem.course_id ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{selectedItem.status === "active" ? "已发布" : "草稿"}</dd>
                  </div>
                  <div>
                    <dt>说明</dt>
                    <dd>{selectedItem.description ?? "暂无说明"}</dd>
                  </div>
                </dl>
              ) : (
                <div className="ui-admin-empty-inline">暂无题库详情</div>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
