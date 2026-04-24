import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  PageResult,
  QuestionBank,
  QuestionBankInput,
  QuestionBankVisibilityInput
} from "@aios/api-sdk";

export interface QuestionBankPanelApi {
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

const defaultVisibilityForm = {
  target_type: "class",
  target_id: "",
  permission_type: "practice"
};

export function QuestionBankPanel({ api }: { api: QuestionBankPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<QuestionBank[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [keyword, setKeyword] = useState("");
  const [visibilityForm, setVisibilityForm] = useState(defaultVisibilityForm);
  const [selectedItemID, setSelectedItemID] = useState<number | null>(null);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listQuestionBanks();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载题库失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    if (!selectedItemID && items.length > 0) {
      setSelectedItemID(items[0].id);
    }
  }, [items, selectedItemID]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        [item.name, item.description ?? "", String(item.course_id ?? "")]
          .join(" ")
          .toLowerCase()
          .includes(keyword.trim().toLowerCase())
      ),
    [items, keyword]
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemID) ?? filteredItems[0] ?? null,
    [filteredItems, items, selectedItemID]
  );

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

  async function handleAssignVisibility(id: number) {
    const targetID = Number(visibilityForm.target_id);
    await api.assignQuestionBankVisibility(id, {
      grants: [
        {
          grant_type: visibilityForm.target_type,
          target_type: visibilityForm.target_type,
          target_id: targetID,
          permission_type: visibilityForm.permission_type,
          inherit_to_children: false
        }
      ]
    });
    setVisibilityForm(defaultVisibilityForm);
    await loadAll();
  }

  return (
    <section aria-label="题库管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <span className="ui-admin-page__eyebrow">题库管理</span>
        <h2>题库管理</h2>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-filters ui-admin-card">
              <div className="ui-admin-filters__grid">
                <div className="ui-admin-form__field">
                  <label htmlFor="question_bank_keyword">搜索题库</label>
                  <input
                    id="question_bank_keyword"
                    placeholder="输入题库名称、课程 ID 或说明"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增题库</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="question_bank_name">题库名称</label>
                  <input
                    id="question_bank_name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="question_bank_course_id">课程ID</label>
                  <input
                    id="question_bank_course_id"
                    inputMode="numeric"
                    value={form.course_id}
                    onChange={(event) => setForm((current) => ({ ...current, course_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="question_bank_description">题库说明</label>
                  <textarea
                    id="question_bank_description"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增题库
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
                    <th>课程ID</th>
                    <th>说明</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.course_id ?? "-"}</td>
                      <td>{item.description ?? "-"}</td>
                      <td>
                        <span className={item.status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--draft"}>
                          {item.status === "active" ? "已发布" : "草稿"}
                        </span>
                      </td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => setSelectedItemID(item.id)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handlePublish(item.id)}>
                            发布题库
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleAssignVisibility(item.id)}>
                            下发题库
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
                <>
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>名称</dt>
                      <dd>{selectedItem.name}</dd>
                    </div>
                    <div>
                      <dt>课程ID</dt>
                      <dd>{selectedItem.course_id ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>
                        <span className={selectedItem.status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--draft"}>
                          {selectedItem.status === "active" ? "已发布" : "草稿"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>说明</dt>
                      <dd>{selectedItem.description ?? "暂无说明"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="ui-admin-empty-inline">暂无题库</div>
              )}
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>题库下发</h3>
                </div>
              </div>
              <div className="ui-admin-form__grid">
                <div className="ui-admin-form__field">
                  <label htmlFor="visibility_target_type">下发目标类型</label>
                  <select
                    id="visibility_target_type"
                    value={visibilityForm.target_type}
                    onChange={(event) => setVisibilityForm((current) => ({ ...current, target_type: event.target.value }))}
                  >
                    <option value="school">学校</option>
                    <option value="grade">年级</option>
                    <option value="class">班级</option>
                    <option value="user">用户</option>
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="visibility_target_id">下发目标ID</label>
                  <input
                    id="visibility_target_id"
                    inputMode="numeric"
                    value={visibilityForm.target_id}
                    onChange={(event) => setVisibilityForm((current) => ({ ...current, target_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="visibility_permission_type">下发用途</label>
                  <select
                    id="visibility_permission_type"
                    value={visibilityForm.permission_type}
                    onChange={(event) =>
                      setVisibilityForm((current) => ({ ...current, permission_type: event.target.value }))
                    }
                  >
                    <option value="view">查看</option>
                    <option value="practice">练题</option>
                    <option value="exam">考试</option>
                  </select>
                </div>
              </div>
              <div className="ui-admin-side-card__actions">
                <button
                  type="button"
                  className="ui-button ui-button--primary"
                  onClick={() => (selectedItem ? void handleAssignVisibility(selectedItem.id) : undefined)}
                >
                  下发题库
                </button>
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
