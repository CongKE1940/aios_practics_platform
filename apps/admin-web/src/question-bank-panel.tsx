import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import type {
  PageResult,
  QuestionBank,
  QuestionBankInput,
  QuestionBankVisibilityInput
} from "@aios/api-sdk";

import { downloadCsv, paginateItems, toggleSelectAll, toggleSelection } from "./list-page-utils";

export interface QuestionBankPanelApi {
  listQuestionBanks(): Promise<PageResult<QuestionBank>>;
  createQuestionBank(body: QuestionBankInput): Promise<QuestionBank>;
  publishQuestionBank(id: number): Promise<QuestionBank>;
  assignQuestionBankVisibility(id: number, body: QuestionBankVisibilityInput): Promise<boolean>;
}

const pageSize = 8;

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

type ModalState =
  | { type: "create" }
  | { type: "detail"; item: QuestionBank }
  | { type: "edit"; item: QuestionBank }
  | null;

export function QuestionBankPanel({ api }: { api: QuestionBankPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<QuestionBank[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [visibilityForm, setVisibilityForm] = useState(defaultVisibilityForm);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [modal, setModal] = useState<ModalState>(null);

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
    setPage(1);
    setSelectedIDs([]);
  }, [keyword]);

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

  const pagination = useMemo(() => paginateItems(filteredItems, page, pageSize), [filteredItems, page]);
  const currentPageIDs = useMemo(() => pagination.items.map((item) => item.id), [pagination.items]);

  useEffect(() => {
    if (page !== pagination.page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createQuestionBank({
      name: form.name,
      course_id: form.course_id ? Number(form.course_id) : undefined,
      description: form.description || undefined
    });
    closeModal();
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

  function handleExport() {
    downloadCsv(
      "question_banks.csv",
      [
        { key: "name", title: "题库名称" },
        { key: "course_id", title: "课程ID" },
        { key: "description", title: "说明" },
        { key: "status", title: "状态" }
      ],
      filteredItems.map((item) => ({ ...item }))
    );
  }

  function openCreateModal() {
    setForm(defaultForm);
    setModal({ type: "create" });
  }

  function openEditModal(item: QuestionBank) {
    setForm({
      name: item.name,
      course_id: item.course_id ? String(item.course_id) : "",
      description: item.description ?? ""
    });
    setModal({ type: "edit", item });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultForm);
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
        <>
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

          <section className="ui-admin-actions-bar ui-admin-card">
            <div className="ui-admin-actions-bar__group">
              <button type="button" className="ui-button ui-button--primary" onClick={openCreateModal}>
                新增题库
              </button>
              <button type="button" className="ui-button ui-button--ghost" disabled>
                批量删除
              </button>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleExport}>
                导出列表
              </button>
            </div>
            <div className="ui-admin-pagination__info">{`已选 ${selectedIDs.length} 项`}</div>
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
                  <th>
                    <input
                      type="checkbox"
                      aria-label="全选题库"
                      className="ui-admin-table__checkbox"
                      checked={currentPageIDs.length > 0 && currentPageIDs.every((id) => selectedIDs.includes(id))}
                      onChange={() => setSelectedIDs((current) => toggleSelectAll(current, currentPageIDs))}
                    />
                  </th>
                  <th>题库名称</th>
                  <th>课程ID</th>
                  <th>说明</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="ui-admin-table__checkbox"
                        aria-label={`选择题库-${item.id}`}
                        checked={selectedIDs.includes(item.id)}
                        onChange={() => setSelectedIDs((current) => toggleSelection(current, item.id))}
                      />
                    </td>
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
                        <button type="button" className="ui-admin-link" onClick={() => setModal({ type: "detail", item })}>
                          详情
                        </button>
                        <button type="button" className="ui-admin-link" onClick={() => openEditModal(item)}>
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ui-admin-table__footer">
              <div className="ui-admin-pagination__info">{`共 ${pagination.total} 条，当前第 ${pagination.page} / ${pagination.pageCount} 页`}</div>
              <div className="ui-admin-pagination">
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}
                  disabled={pagination.page >= pagination.pageCount}
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {modal ? renderModal(modal, closeModal, handleSubmit, form, setForm, visibilityForm, setVisibilityForm, handlePublish, handleAssignVisibility) : null}
    </section>
  );
}

function renderModal(
  modal: Exclude<ModalState, null>,
  closeModal: () => void,
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>,
  form: typeof defaultForm,
  setForm: Dispatch<SetStateAction<typeof defaultForm>>,
  visibilityForm: typeof defaultVisibilityForm,
  setVisibilityForm: Dispatch<SetStateAction<typeof defaultVisibilityForm>>,
  handlePublish: (id: number) => Promise<void>,
  handleAssignVisibility: (id: number) => Promise<void>
) {
  if (modal.type === "detail") {
    const detailModal = modal;
    return (
      <div className="ui-admin-modal-backdrop">
        <section className="ui-admin-modal" aria-label="题库管理弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>题库详情</h3>
                <p>{detailModal.item.name}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>题库名称</dt>
                  <dd>{detailModal.item.name}</dd>
                </div>
                <div>
                  <dt>课程ID</dt>
                  <dd>{detailModal.item.course_id ?? "-"}</dd>
                </div>
                <div>
                  <dt>说明</dt>
                  <dd>{detailModal.item.description ?? "暂无说明"}</dd>
                </div>
              </dl>
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
                <div className="ui-admin-form__field">
                  <label htmlFor="visibility_permission_type">下发用途</label>
                  <select
                    id="visibility_permission_type"
                    value={visibilityForm.permission_type}
                    onChange={(event) => setVisibilityForm((current) => ({ ...current, permission_type: event.target.value }))}
                  >
                    <option value="view">查看</option>
                    <option value="practice">练题</option>
                    <option value="exam">考试</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="ui-admin-modal__footer">
              <div className="ui-admin-actions-bar__group">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => void handlePublish(detailModal.item.id)}>
                  发布题库
                </button>
                <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleAssignVisibility(detailModal.item.id)}>
                  下发题库
                </button>
              </div>
              <button type="button" className="ui-button ui-button--primary" onClick={() => closeModal()}>
                完成
              </button>
            </div>
        </section>
      </div>
    );
  }

  const formModal = modal;
  return (
    <div className="ui-admin-modal-backdrop">
      <section className="ui-admin-modal" aria-label="题库管理弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>{formModal.type === "create" ? "新增题库" : "编辑题库"}</h3>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                关闭
              </button>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)}>
              <div className="ui-admin-modal__body">
                <div className="ui-admin-form__grid">
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
                </div>
              </div>
              <div className="ui-admin-modal__footer">
                <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                  取消
                </button>
                <button type="submit" className="ui-button ui-button--primary">
                  {formModal.type === "create" ? "新增题库" : "保存修改"}
                </button>
              </div>
            </form>
      </section>
    </div>
  );
}
