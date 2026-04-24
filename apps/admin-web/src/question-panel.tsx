import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  PageResult,
  Question,
  QuestionContentInput,
  QuestionInput,
  QuestionUpdateInput,
  QuestionVersion,
  QuestionVersionInput
} from "@aios/api-sdk";

import { downloadCsv, paginateItems, toggleSelectAll, toggleSelection } from "./list-page-utils";

export interface QuestionPanelApi {
  listQuestions(): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
  updateQuestion(id: number, body: QuestionUpdateInput): Promise<Question>;
  listQuestionVersions(id: number): Promise<QuestionVersion[]>;
  createQuestionVersion(id: number, body: QuestionVersionInput): Promise<QuestionVersion>;
}

const pageSize = 8;

const defaultQuestionForm = {
  question_type: "single_choice",
  difficulty: "medium",
  bank_id: "",
  stem: "",
  option_a: "",
  option_b: "",
  correct_key: "B"
};

const defaultVersionForm = {
  stem: "",
  correct_key: "B",
  change_summary: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; item: Question }
  | null;

export function QuestionPanel({ api, onNavigate }: { api: QuestionPanelApi; onNavigate?: (path: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<Question[]>([]);
  const [versions, setVersions] = useState<QuestionVersion[]>([]);
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);
  const [versionForm, setVersionForm] = useState(defaultVersionForm);
  const [modal, setModal] = useState<ModalState>(null);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listQuestions();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载题目失败");
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
        [item.question_type, item.difficulty ?? "", String(item.bank_ids?.join(",") ?? "")]
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

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createQuestion({
      question_type: questionForm.question_type,
      difficulty: questionForm.difficulty,
      content: buildChoiceContent(questionForm.stem, questionForm.option_a, questionForm.option_b),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [questionForm.correct_key]
      },
      analysis: {},
      bank_ids: questionForm.bank_id ? [Number(questionForm.bank_id)] : []
    });
    closeModal();
    await loadAll();
  }

  async function handleCreateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.type !== "detail") {
      return;
    }
    await api.createQuestionVersion(modal.item.id, {
      content: buildChoiceContent(versionForm.stem, "1", "2"),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [versionForm.correct_key]
      },
      analysis: {},
      change_summary: versionForm.change_summary || undefined
    });
    setVersionForm(defaultVersionForm);
    setVersions(await api.listQuestionVersions(modal.item.id));
  }

  async function openDetailModal(item: Question) {
    setModal({ type: "detail", item });
    setVersions(await api.listQuestionVersions(item.id));
  }

  async function handleBatchDelete() {
    const ids = [...selectedIDs];
    if (ids.length === 0) {
      return;
    }
    await Promise.all(
      ids.map((id) =>
        api.updateQuestion(id, {
          status: "disabled"
        })
      )
    );
    setSelectedIDs([]);
    await loadAll();
  }

  function handleExport() {
    downloadCsv(
      "questions.csv",
      [
        { key: "question_type", title: "题型" },
        { key: "difficulty", title: "难度" },
        { key: "status", title: "状态" },
        { key: "current_version_no", title: "当前版本" }
      ],
      filteredItems
    );
  }

  function closeModal() {
    setModal(null);
    setQuestionForm(defaultQuestionForm);
    setVersionForm(defaultVersionForm);
    setVersions([]);
  }

  return (
    <section aria-label="题目管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">题目管理</span>
            <h2>题目管理</h2>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <>
          <section className="ui-admin-filters ui-admin-card">
            <div className="ui-admin-filters__grid">
              <div className="ui-admin-form__field">
                <label htmlFor="question_keyword">筛选题目</label>
                <input
                  id="question_keyword"
                  placeholder="题型 / 难度 / 题库 ID"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="ui-admin-actions-bar ui-admin-card">
            <div className="ui-admin-actions-bar__group">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setModal({ type: "create" })}>
                新增题目
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void handleBatchDelete()}
                disabled={selectedIDs.length === 0}
              >
                批量删除
              </button>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleExport}>
                导出列表
              </button>
            </div>
            <div className="ui-admin-actions-bar__group">
              {onNavigate ? (
                <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate("/admin/questions/editor")}>
                  进入题目编辑器
                </button>
              ) : null}
            </div>
          </section>

          <section className="ui-admin-table-card">
            <div className="ui-admin-table-card__header">
              <div>
                <h3>题目列表</h3>
              </div>
            </div>
            <table className="ui-admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="ui-admin-table__checkbox"
                      aria-label="全选题目"
                      checked={currentPageIDs.length > 0 && currentPageIDs.every((id) => selectedIDs.includes(id))}
                      onChange={() => setSelectedIDs((current) => toggleSelectAll(current, currentPageIDs))}
                    />
                  </th>
                  <th>题型</th>
                  <th>难度</th>
                  <th>状态</th>
                  <th>当前版本</th>
                  <th>所属题库</th>
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
                        aria-label={`选择题目-${item.id}`}
                        checked={selectedIDs.includes(item.id)}
                        onChange={() => setSelectedIDs((current) => toggleSelection(current, item.id))}
                      />
                    </td>
                    <td>{item.question_type}</td>
                    <td>{item.difficulty ?? "-"}</td>
                    <td>
                      <span className={item.status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--disabled"}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.current_version_no ?? "-"}</td>
                    <td>{item.bank_ids?.join(", ") ?? "-"}</td>
                    <td>
                      <div className="ui-admin-table__actions">
                        <button type="button" className="ui-admin-link" onClick={() => void openDetailModal(item)}>
                          详情
                        </button>
                        <button
                          type="button"
                          className="ui-admin-link"
                          onClick={() => onNavigate?.("/admin/questions/editor")}
                        >
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

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="题目管理弹层">
            {modal.type === "create" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>新增题目</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleCreateQuestion(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_type">题型</label>
                        <select
                          id="question_type"
                          value={questionForm.question_type}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, question_type: event.target.value }))}
                        >
                          <option value="single_choice">single_choice</option>
                          <option value="multiple_choice">multiple_choice</option>
                          <option value="true_false">true_false</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_difficulty">难度</label>
                        <select
                          id="question_difficulty"
                          value={questionForm.difficulty}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, difficulty: event.target.value }))}
                        >
                          <option value="easy">easy</option>
                          <option value="medium">medium</option>
                          <option value="hard">hard</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_bank_id">题库ID</label>
                        <input
                          id="question_bank_id"
                          inputMode="numeric"
                          value={questionForm.bank_id}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, bank_id: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="question_stem">题干</label>
                        <textarea
                          id="question_stem"
                          value={questionForm.stem}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, stem: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_option_a">选项A</label>
                        <input
                          id="question_option_a"
                          value={questionForm.option_a}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, option_a: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_option_b">选项B</label>
                        <input
                          id="question_option_b"
                          value={questionForm.option_b}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, option_b: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_correct_key">正确答案</label>
                        <input
                          id="question_correct_key"
                          value={questionForm.correct_key}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, correct_key: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      新增题目
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>题目详情</h3>
                    <p>{`题目 #${modal.item.id}`}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>题型</dt>
                      <dd>{modal.item.question_type}</dd>
                    </div>
                    <div>
                      <dt>难度</dt>
                      <dd>{modal.item.difficulty ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>所属题库</dt>
                      <dd>{modal.item.bank_ids?.join(", ") ?? "-"}</dd>
                    </div>
                  </dl>

                  <section className="ui-admin-card">
                    <div className="ui-admin-card__header">
                      <div>
                        <h3>版本列表</h3>
                      </div>
                    </div>
                    <div className="ui-admin-tree">
                      {versions.length > 0 ? (
                        versions.map((version) => (
                          <div key={version.id} className="ui-admin-tree__leaf">
                            <strong>{`版本 ${version.version_no}`}</strong>
                            <span className="ui-admin-subtle">{version.change_summary ?? "无变更说明"}</span>
                          </div>
                        ))
                      ) : (
                        <div className="ui-admin-empty-inline">暂无版本信息</div>
                      )}
                    </div>
                  </section>

                  <form onSubmit={(event) => void handleCreateVersion(event)}>
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="question_version_stem">版本题干</label>
                        <textarea
                          id="question_version_stem"
                          value={versionForm.stem}
                          onChange={(event) => setVersionForm((current) => ({ ...current, stem: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_version_correct_key">版本正确答案</label>
                        <input
                          id="question_version_correct_key"
                          value={versionForm.correct_key}
                          onChange={(event) => setVersionForm((current) => ({ ...current, correct_key: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_version_change_summary">变更摘要</label>
                        <input
                          id="question_version_change_summary"
                          value={versionForm.change_summary}
                          onChange={(event) => setVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                        <button type="submit" className="ui-button ui-button--primary">
                          新增版本
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildChoiceContent(stem: string, optionA: string, optionB: string): QuestionContentInput {
  return {
    stem: {
      content_type: "text",
      text: stem,
      assets: []
    },
    options: [
      { key: "A", content_type: "text", text: optionA, assets: [] },
      { key: "B", content_type: "text", text: optionB, assets: [] }
    ],
    option_order_randomizable: true,
    ext: {}
  };
}
