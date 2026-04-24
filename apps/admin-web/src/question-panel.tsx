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

export interface QuestionPanelApi {
  listQuestions(): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
  updateQuestion(id: number, body: QuestionUpdateInput): Promise<Question>;
  listQuestionVersions(id: number): Promise<QuestionVersion[]>;
  createQuestionVersion(id: number, body: QuestionVersionInput): Promise<QuestionVersion>;
}

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

export function QuestionPanel({ api, onNavigate }: { api: QuestionPanelApi; onNavigate?: (path: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<Question[]>([]);
  const [versions, setVersions] = useState<QuestionVersion[]>([]);
  const [selectedQuestionID, setSelectedQuestionID] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);
  const [versionForm, setVersionForm] = useState(defaultVersionForm);

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
    if (!selectedQuestionID && items.length > 0) {
      setSelectedQuestionID(items[0].id);
    }
  }, [items, selectedQuestionID]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        [item.question_type, item.difficulty ?? "", String(item.bank_ids?.[0] ?? "")]
          .join(" ")
          .toLowerCase()
          .includes(keyword.trim().toLowerCase())
      ),
    [items, keyword]
  );

  const selectedQuestion = useMemo(
    () => items.find((item) => item.id === selectedQuestionID) ?? filteredItems[0] ?? null,
    [filteredItems, items, selectedQuestionID]
  );

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
    setQuestionForm(defaultQuestionForm);
    await loadAll();
  }

  async function handleDisableQuestion(question: Question) {
    await api.updateQuestion(question.id, {
      difficulty: question.difficulty ?? undefined,
      status: "disabled"
    });
    await loadAll();
  }

  async function handleLoadVersions(id: number) {
    setSelectedQuestionID(id);
    const result = await api.listQuestionVersions(id);
    setVersions(result);
  }

  async function handleCreateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuestionID) {
      return;
    }
    await api.createQuestionVersion(selectedQuestionID, {
      content: buildChoiceContent(versionForm.stem, "1", "2"),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [versionForm.correct_key]
      },
      analysis: {},
      change_summary: versionForm.change_summary || undefined
    });
    setVersionForm(defaultVersionForm);
    setVersions(await api.listQuestionVersions(selectedQuestionID));
  }

  return (
    <section aria-label="题目管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">题目管理</span>
            <h2>题目管理</h2>
          </div>
          {onNavigate ? (
            <div className="ui-admin-toolbar">
              <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate("/admin/questions/editor")}>
                进入题目编辑器
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout--wide ui-admin-layout">
          <aside className="ui-admin-tree-card">
            <div className="ui-admin-tree-card__header">
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
                <div className="ui-admin-empty-inline">先从右侧题目列表选择题目查看版本</div>
              )}
            </div>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增版本</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleCreateVersion(event)}>
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
                    onChange={(event) =>
                      setVersionForm((current) => ({ ...current, change_summary: event.target.value }))
                    }
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增版本
                  </button>
                </div>
              </form>
            </section>
          </aside>

          <div className="ui-admin-main">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增题目</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid ui-admin-form__grid--wide" onSubmit={(event) => void handleCreateQuestion(event)}>
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
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增题目
                  </button>
                </div>
              </form>
            </section>

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

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>题目列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>题型</th>
                    <th>难度</th>
                    <th>状态</th>
                    <th>当前版本</th>
                    <th>所属题库</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
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
                          <button type="button" className="ui-admin-link" onClick={() => void handleLoadVersions(item.id)}>
                            查看版本
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleDisableQuestion(item)}>
                            停用题目
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {selectedQuestion ? (
              <section className="ui-admin-side-card">
                <div className="ui-admin-side-card__header">
                  <div>
                    <h3>当前选中题目</h3>
                  </div>
                </div>
                <dl className="ui-admin-meta-list">
                  <div>
                    <dt>题型</dt>
                    <dd>{selectedQuestion.question_type}</dd>
                  </div>
                  <div>
                    <dt>难度</dt>
                    <dd>{selectedQuestion.difficulty ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>{selectedQuestion.current_version_no ?? "-"}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </div>
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
