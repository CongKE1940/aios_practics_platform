import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

import type { Question, QuestionVersion } from "@aios/api-sdk";

import type { QuestionPanelApi } from "./question-panel";
import {
  buildTextQuestionOptions,
  buildQuestionContentBlock,
  createAssetDraftFromFileAsset,
  createAssetDraftFromURL,
  createContentDraft,
  createContentDraftFromBlock,
  createDefaultOptionDrafts,
  createOptionDraft,
  createOptionDraftFromOption,
  getOptionKey,
  hasContentDraftValue,
  normalizeCorrectKey,
  type QuestionAssetDraft,
  type QuestionContentDraft,
  type QuestionOptionDraft
} from "./question-option-draft";

interface EditorForm {
  stem: QuestionContentDraft;
  optionGroup: QuestionContentDraft;
  options: QuestionOptionDraft[];
  correctKey: string;
  optionOrderRandomizable: boolean;
  changeSummary: string;
}

function createDefaultForm(): EditorForm {
  return {
    stem: createContentDraft(),
    optionGroup: createContentDraft(),
    options: createDefaultOptionDrafts("", ""),
    correctKey: "A",
    optionOrderRandomizable: true,
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
        stem: buildQuestionContentBlock(form.stem),
        option_group: hasContentDraftValue(form.optionGroup) ? buildQuestionContentBlock(form.optionGroup) : undefined,
        options: buildTextQuestionOptions(form.options),
        option_order_randomizable: form.optionOrderRandomizable
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

  async function uploadQuestionAsset(file: File | null, usage: string): Promise<QuestionAssetDraft | null> {
    if (!file) {
      return null;
    }
    try {
      if (api.uploadFile) {
        const payload = new FormData();
        payload.append("file", file);
        payload.append("usage", usage);
        return createAssetDraftFromFileAsset(await api.uploadFile(payload));
      }
      return createAssetDraftFromURL(await readFileAsDataURL(file), file.type.startsWith("image/") ? "image" : "file");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "图片上传失败");
      return null;
    }
  }

  async function addStemAsset(file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_stem");
    if (!asset) {
      return;
    }
    setForm((current) => ({ ...current, stem: { ...current.stem, assets: [...current.stem.assets, asset] } }));
  }

  async function addOptionGroupAsset(file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_option_group");
    if (!asset) {
      return;
    }
    setForm((current) => ({ ...current, optionGroup: { ...current.optionGroup, assets: [...current.optionGroup.assets, asset] } }));
  }

  async function addOptionAsset(index: number, file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_option");
    if (!asset) {
      return;
    }
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, assets: [...option.assets, asset] } : option
      )
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
                <ContentDraftFields
                  idPrefix="editor_stem"
                  label="题干"
                  draft={form.stem}
                  onTextChange={(text) => setForm((current) => ({ ...current, stem: { ...current.stem, text } }))}
                  onAssetAdd={(file) => void addStemAsset(file)}
                  onAssetRemove={(assetID) => setForm((current) => ({ ...current, stem: removeContentAsset(current.stem, assetID) }))}
                />
                <ContentDraftFields
                  idPrefix="editor_option_group"
                  label="选项整体图片/说明"
                  draft={form.optionGroup}
                  onTextChange={(text) => setForm((current) => ({ ...current, optionGroup: { ...current.optionGroup, text } }))}
                  onAssetAdd={(file) => void addOptionGroupAsset(file)}
                  onAssetRemove={(assetID) => setForm((current) => ({ ...current, optionGroup: removeContentAsset(current.optionGroup, assetID) }))}
                />
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
                          <AssetDraftList
                            assets={option.assets}
                            onRemove={(assetID) =>
                              setForm((current) => ({
                                ...current,
                                options: current.options.map((currentOption, optionIndex) =>
                                  optionIndex === index ? removeOptionAsset(currentOption, assetID) : currentOption
                                )
                              }))
                            }
                          />
                          <input
                            id={`${optionInputID}_file`}
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              void addOptionAsset(index, event.target.files?.[0] ?? null);
                              event.currentTarget.value = "";
                            }}
                          />
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
                <div className="ui-admin-form__field">
                  <label className="ui-inline-checkbox" htmlFor="editor_option_randomizable">
                    <input
                      id="editor_option_randomizable"
                      type="checkbox"
                      checked={form.optionOrderRandomizable}
                      onChange={(event) => setForm((current) => ({ ...current, optionOrderRandomizable: event.target.checked }))}
                    />
                    <span>选项允许随机排序</span>
                  </label>
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
                  <p>{form.stem.text || (form.stem.assets.length > 0 ? "已上传题干图片" : "请输入题干")}</p>
                </article>
                {form.options.map((option, index) => (
                  <article key={option.draft_id} className="ui-admin-mini-item">
                    <strong>{`选项 ${getOptionKey(index)}`}</strong>
                    <p>{option.text || (option.assets.length > 0 ? "已上传选项图片" : "未填写")}</p>
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
  const content = version.content as {
    stem?: { text?: string | null; assets?: QuestionAssetDraft[] | null };
    option_group?: { text?: string | null; assets?: QuestionAssetDraft[] | null };
    options?: Array<{ key?: string; text?: string | null; assets?: QuestionAssetDraft[] | null }>;
    option_order_randomizable?: boolean;
  };
  const options = content.options ?? [];
  const answer = version.answer as { correct_keys?: string[] };
  const optionDrafts = options.length > 0 ? options.map((item) => createOptionDraftFromOption(item)) : createDefaultOptionDrafts("", "");

  return {
    stem: createContentDraftFromBlock(content.stem),
    optionGroup: createContentDraftFromBlock(content.option_group),
    options: optionDrafts,
    correctKey: normalizeCorrectKey(answer.correct_keys?.[0] ?? "A", optionDrafts),
    optionOrderRandomizable: content.option_order_randomizable ?? true,
    changeSummary: version.change_summary ?? ""
  };
}

interface ContentDraftFieldsProps {
  idPrefix: string;
  label: string;
  draft: QuestionContentDraft;
  onTextChange(text: string): void;
  onAssetAdd(file: File | null): void;
  onAssetRemove(assetID: string): void;
}

function ContentDraftFields({ idPrefix, label, draft, onTextChange, onAssetAdd, onAssetRemove }: ContentDraftFieldsProps) {
  return (
    <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
      <label htmlFor={`${idPrefix}_text`}>{label}</label>
      <textarea id={`${idPrefix}_text`} value={draft.text} onChange={(event) => onTextChange(event.target.value)} />
      <AssetDraftList assets={draft.assets} onRemove={onAssetRemove} />
      <input
        id={`${idPrefix}_file`}
        type="file"
        accept="image/*"
        onChange={(event) => {
          onAssetAdd(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function AssetDraftList({ assets, onRemove }: { assets: QuestionAssetDraft[]; onRemove(assetID: string): void }) {
  const visibleAssets = assets.filter((asset) => asset.url.trim() !== "");
  if (visibleAssets.length === 0) {
    return null;
  }
  return (
    <div style={assetListStyle}>
      {visibleAssets.map((asset) => (
        <span key={asset.draft_id} style={assetPreviewStyle}>
          {asset.type === "image" ? <img src={asset.url} alt="" style={assetImageStyle} /> : null}
          <span style={assetNameStyle}>{asset.filename || "图片"}</span>
          <button type="button" className="ui-button ui-button--ghost" onClick={() => onRemove(asset.draft_id)}>
            移除
          </button>
        </span>
      ))}
    </div>
  );
}

function removeContentAsset(draft: QuestionContentDraft, assetID: string): QuestionContentDraft {
  return {
    ...draft,
    assets: draft.assets.filter((asset) => asset.draft_id !== assetID)
  };
}

function removeOptionAsset(option: QuestionOptionDraft, assetID: string): QuestionOptionDraft {
  return {
    ...option,
    assets: option.assets.filter((asset) => asset.draft_id !== assetID)
  };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
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

const assetListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8
};

const assetPreviewStyle: CSSProperties = {
  display: "inline-grid",
  gridTemplateColumns: "40px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 8,
  maxWidth: "100%",
  padding: 6,
  border: "1px solid var(--ui-color-border)",
  borderRadius: 6,
  background: "var(--ui-color-bg-elevated)"
};

const assetImageStyle: CSSProperties = {
  width: 40,
  height: 40,
  objectFit: "cover",
  borderRadius: 4,
  border: "1px solid var(--ui-color-border)"
};

const assetNameStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
