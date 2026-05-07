import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

import type { Question, QuestionVersion } from "@aios/api-sdk";

import type { QuestionPanelApi } from "./question-panel";
import {
  buildTextQuestionOptions,
  createDefaultOptionDrafts,
  createOptionDraft,
  getOptionKey,
  normalizeCorrectKey,
  type QuestionOptionDraft
} from "./question-option-draft";

interface EditorForm {
  stem: string;
  options: QuestionOptionDraft[];
  correctKey: string;
  changeSummary: string;
}

function createDefaultForm(): EditorForm {
  return {
    stem: "",
    options: createDefaultOptionDrafts("", ""),
    correctKey: "A",
    changeSummary: ""
  };
}

export function QuestionEditorPanel({ api }: { api: QuestionPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [versions, setVersions] = useState<QuestionVersion[]>([]);
  const [selectedQuestionID, setSelectedQuestionID] = useState<number | null>(null);
  const [form, setForm] = useState<EditorForm>(() => createDefaultForm());

  useEffect(() => {
    void loadQuestions();
  }, [api]);

  useEffect(() => {
    if (!selectedQuestionID && questions.length > 0) {
      setSelectedQuestionID(questions[0].id);
    }
  }, [questions, selectedQuestionID]);

  useEffect(() => {
    if (!selectedQuestionID) {
      return;
    }
    void loadVersions(selectedQuestionID);
  }, [api, selectedQuestionID]);

  async function loadQuestions() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listQuestions();
      setQuestions(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载题目列表失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadVersions(questionID: number) {
    try {
      const result = await api.listQuestionVersions(questionID);
      setVersions(result);
      const latestVersion = result[result.length - 1];
      if (latestVersion) {
        setForm(buildFormFromVersion(latestVersion));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载题目版本失败");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuestionID) {
      return;
    }

    await api.createQuestionVersion(selectedQuestionID, {
      content: {
        stem: { content_type: "text", text: form.stem },
        options: buildTextQuestionOptions(form.options)
      },
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [normalizeCorrectKey(form.correctKey, form.options)]
      },
      analysis: {},
      change_summary: form.changeSummary || undefined
    });

    await loadVersions(selectedQuestionID);
  }

  const selectedQuestion = useMemo(
    () => questions.find((item) => item.id === selectedQuestionID) ?? questions[0] ?? null,
    [questions, selectedQuestionID]
  );

  function updateOption(index: number, text: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, text } : option))
    }));
  }

  function addOption() {
    setForm((current) => ({
      ...current,
      options: [...current.options, createOptionDraft()]
    }));
  }

  function removeOption(index: number) {
    setForm((current) => {
      if (current.options.length <= 1) {
        return current;
      }
      const options = current.options.filter((_, optionIndex) => optionIndex !== index);
      return {
        ...current,
        options,
        correctKey: normalizeCorrectKey(current.correctKey, options)
      };
    });
  }

  return (
    <section aria-label="题目编辑器面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">题目编辑器</span>
            <h2>题目编辑器</h2>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout--triple ui-admin-layout">
          <aside className="ui-admin-tree-card">
            <div className="ui-admin-tree-card__header">
              <div>
                <h3>题目列表</h3>
              </div>
            </div>
            <div className="ui-admin-tree">
              {questions.map((question) => (
                <div
                  key={question.id}
                  className={["ui-admin-tree__leaf", selectedQuestionID === question.id ? "is-active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <strong>{`题目 #${question.id}`}</strong>
                  <span className="ui-admin-subtle">{question.question_type}</span>
                  <button type="button" className="ui-admin-link" onClick={() => setSelectedQuestionID(question.id)}>
                    编辑
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>编辑内容</h3>
              </div>
            </div>
            {selectedQuestion ? (
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmit(event)}>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="editor_stem">题干</label>
                  <textarea id="editor_stem" value={form.stem} onChange={(event) => setForm((current) => ({ ...current, stem: event.target.value }))} />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <div style={optionSectionHeaderStyle}>
                    <span style={optionSectionTitleStyle}>选项</span>
                    <button type="button" className="ui-button ui-button--ghost" onClick={addOption}>
                      增加选项
                    </button>
                  </div>
                  <div style={optionListStyle}>
                    {form.options.map((option, index) => {
                      const optionKey = getOptionKey(index);
                      const optionInputID = `editor_option_${option.draft_id}`;
                      return (
                        <div key={option.draft_id} style={optionRowStyle}>
                          <label htmlFor={optionInputID}>{`选项 ${optionKey}`}</label>
                          <div style={optionInputRowStyle}>
                            <input id={optionInputID} value={option.text} onChange={(event) => updateOption(index, event.target.value)} />
                            <button
                              type="button"
                              className="ui-button ui-button--ghost"
                              onClick={() => removeOption(index)}
                              disabled={form.options.length <= 1}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="editor_correct_key">正确答案</label>
                  <select
                    id="editor_correct_key"
                    value={normalizeCorrectKey(form.correctKey, form.options)}
                    onChange={(event) => setForm((current) => ({ ...current, correctKey: event.target.value }))}
                  >
                    {form.options.map((_, index) => {
                      const optionKey = getOptionKey(index);
                      return (
                        <option key={optionKey} value={optionKey}>
                          {optionKey}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="editor_change_summary">变更摘要</label>
                  <input
                    id="editor_change_summary"
                    value={form.changeSummary}
                    onChange={(event) => setForm((current) => ({ ...current, changeSummary: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    保存为新版本
                  </button>
                </div>
              </form>
            ) : (
              <div className="ui-admin-empty-inline">暂无可编辑题目</div>
            )}
          </section>

          <aside className="ui-admin-side-card">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>实时预览</h3>
                </div>
              </div>
              <div className="ui-admin-mini-list">
                <article className="ui-admin-mini-item">
                  <strong>题干</strong>
                  <p>{form.stem || "请输入题干"}</p>
                </article>
                {form.options.map((option, index) => (
                  <article key={option.draft_id} className="ui-admin-mini-item">
                    <strong>{`选项 ${getOptionKey(index)}`}</strong>
                    <p>{option.text || "未填写"}</p>
                  </article>
                ))}
                <article className="ui-admin-mini-item">
                  <strong>正确答案</strong>
                  <p>{form.correctKey}</p>
                </article>
              </div>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>版本记录</h3>
                </div>
              </div>
              {versions.length > 0 ? (
                <div className="ui-admin-timeline">
                  {versions.map((version) => (
                    <article key={version.id} className="ui-admin-timeline__item">
                      <strong>{`版本 ${version.version_no}`}</strong>
                      <p>{version.change_summary || "无变更说明"}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="ui-admin-empty-inline">暂无版本记录</div>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function buildFormFromVersion(version: QuestionVersion): EditorForm {
  const content = version.content as { stem?: { text?: string | null }; options?: Array<{ key?: string; text?: string | null }> };
  const options = content.options ?? [];
  const answer = version.answer as { correct_keys?: string[] };
  const optionDrafts = options.length > 0 ? options.map((item) => createOptionDraft(item.text ?? "")) : createDefaultOptionDrafts("", "");

  return {
    stem: content.stem?.text ?? "",
    options: optionDrafts,
    correctKey: normalizeCorrectKey(answer.correct_keys?.[0] ?? "A", optionDrafts),
    changeSummary: version.change_summary ?? ""
  };
}

const optionSectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10
};

const optionSectionTitleStyle: CSSProperties = {
  fontWeight: 700
};

const optionListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12
};

const optionRowStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const optionInputRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center"
};
