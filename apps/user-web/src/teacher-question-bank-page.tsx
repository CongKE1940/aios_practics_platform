import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  PageResult,
  Question,
  QuestionBank,
  QuestionBankInput,
  QuestionBankVisibilityGrant,
  QuestionInput,
  QuestionListQuery
} from "@aios/api-sdk";

export interface TeacherQuestionBankApi {
  listQuestionBanks(): Promise<PageResult<QuestionBank>>;
  createQuestionBank(body: QuestionBankInput): Promise<QuestionBank>;
  publishQuestionBank(id: number): Promise<QuestionBank>;
  listQuestions(query?: QuestionListQuery): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
}

interface TeacherQuestionBankPageProps {
  api: TeacherQuestionBankApi;
  userType?: string;
}

const defaultBankForm = {
  name: "",
  course_id: "",
  description: "",
  visible_to_students: true,
  visible_to_tenant_admins: false,
  share_to_teachers: false,
  share_teacher_ids: "",
  share_class_ids: "",
  share_student_ids: ""
};

const defaultQuestionForm = {
  bank_id: "",
  course_id: "",
  question_type: "single_choice",
  difficulty: "medium",
  stem: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_keys: "A",
  true_false_value: "true",
  analysis: ""
};

export function TeacherQuestionBankPage({ api, userType = "teacher" }: TeacherQuestionBankPageProps) {
  const [loading, setLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<QuestionBank[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [detailItem, setDetailItem] = useState<QuestionBank | null>(null);
  const [bankForm, setBankForm] = useState(defaultBankForm);
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    if (!selectedID && items.length > 0) {
      setSelectedID(items[0].id);
      setQuestionForm((current) => ({ ...current, bank_id: String(items[0].id), course_id: String(items[0].course_id ?? "") }));
    }
  }, [items, selectedID]);

  useEffect(() => {
    if (!selectedID) {
      setQuestions([]);
      return;
    }
    void loadQuestions(selectedID);
  }, [api, selectedID]);

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

  async function loadQuestions(bankID: number) {
    setQuestionLoading(true);
    try {
      const result = await api.listQuestions({ bank_id: bankID, page: 1, page_size: 50 });
      setQuestions(result.items);
    } catch (error) {
      setQuestions([]);
      setErrorMessage(error instanceof Error ? error.message : "加载题目失败");
    } finally {
      setQuestionLoading(false);
    }
  }

  async function handleCreateBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: QuestionBankInput = {
      name: bankForm.name,
      course_id: bankForm.course_id ? Number(bankForm.course_id) : undefined,
      description: bankForm.description || undefined,
      visibility_grants: buildVisibilityGrants(bankForm)
    };
    const created = await api.createQuestionBank(body);
    setBankForm(defaultBankForm);
    setSelectedID(created.id);
    setQuestionForm((current) => ({ ...current, bank_id: String(created.id), course_id: String(created.course_id ?? "") }));
    await loadAll();
  }

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bankID = Number(questionForm.bank_id || selectedID);
    if (!Number.isFinite(bankID) || bankID <= 0) {
      setErrorMessage("请先选择题库。");
      return;
    }

    const selectedBank = items.find((item) => item.id === bankID);
    const courseID = questionForm.course_id ? Number(questionForm.course_id) : selectedBank?.course_id ?? undefined;
    const body = buildQuestionPayload(questionForm, bankID, courseID);
    if (typeof body === "string") {
      setErrorMessage(body);
      return;
    }

    await api.createQuestion(body);
    setQuestionForm({
      ...defaultQuestionForm,
      bank_id: String(bankID),
      course_id: courseID ? String(courseID) : ""
    });
    await loadQuestions(bankID);
  }

  async function handlePublish(id: number) {
    await api.publishQuestionBank(id);
    await loadAll();
  }

  function openDetail(item: QuestionBank) {
    setSelectedID(item.id);
    setDetailItem(item);
    setQuestionForm((current) => ({ ...current, bank_id: String(item.id), course_id: String(item.course_id ?? "") }));
  }

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedID) ?? items[0] ?? null, [items, selectedID]);
  const title = userType === "student" ? "我的题库" : "我的题库";
  const ownerLabel = userType === "student" ? "学生自建" : "教师自建";

  return (
    <section aria-label="我的题库页" className="ui-admin-page ui-user-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">{ownerLabel}</span>
            <h2>{title}</h2>
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
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleCreateBank(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="user_bank_name">题库名称</label>
                  <input id="user_bank_name" value={bankForm.name} onChange={(event) => setBankForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="user_bank_course_id">课程 ID</label>
                  <input
                    id="user_bank_course_id"
                    value={bankForm.course_id}
                    onChange={(event) => setBankForm((current) => ({ ...current, course_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="user_bank_description">题库说明</label>
                  <textarea
                    id="user_bank_description"
                    value={bankForm.description}
                    onChange={(event) => setBankForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </div>
                <fieldset className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <legend>可见范围</legend>
                  <label className="ui-admin-checkbox">
                    <input
                      type="checkbox"
                      checked={bankForm.visible_to_students}
                      onChange={(event) => setBankForm((current) => ({ ...current, visible_to_students: event.target.checked }))}
                    />
                    学生可见
                  </label>
                  <label className="ui-admin-checkbox">
                    <input
                      type="checkbox"
                      checked={bankForm.visible_to_tenant_admins}
                      onChange={(event) => setBankForm((current) => ({ ...current, visible_to_tenant_admins: event.target.checked }))}
                    />
                    租户管理员可见
                  </label>
                </fieldset>
                <fieldset className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <legend>共享范围</legend>
                  <label className="ui-admin-checkbox">
                    <input
                      type="checkbox"
                      checked={bankForm.share_to_teachers}
                      onChange={(event) => setBankForm((current) => ({ ...current, share_to_teachers: event.target.checked }))}
                    />
                    共享给全部教师
                  </label>
                  <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                    <div className="ui-admin-form__field">
                      <label htmlFor="user_bank_share_teacher_ids">指定教师 ID</label>
                      <input
                        id="user_bank_share_teacher_ids"
                        placeholder="例如：101,102"
                        value={bankForm.share_teacher_ids}
                        onChange={(event) => setBankForm((current) => ({ ...current, share_teacher_ids: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="user_bank_share_class_ids">班级 ID</label>
                      <input
                        id="user_bank_share_class_ids"
                        placeholder="例如：301,302"
                        value={bankForm.share_class_ids}
                        onChange={(event) => setBankForm((current) => ({ ...current, share_class_ids: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="user_bank_share_student_ids">学生 ID</label>
                      <input
                        id="user_bank_share_student_ids"
                        placeholder="例如：501,502"
                        value={bankForm.share_student_ids}
                        onChange={(event) => setBankForm((current) => ({ ...current, share_student_ids: event.target.value }))}
                      />
                    </div>
                  </div>
                </fieldset>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新建题库
                  </button>
                </div>
              </form>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>创建题目</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleCreateQuestion(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="user_question_bank_id">所属题库</label>
                  <select
                    id="user_question_bank_id"
                    value={questionForm.bank_id}
                    onChange={(event) => {
                      const bank = items.find((item) => item.id === Number(event.target.value));
                      setSelectedID(bank?.id ?? null);
                      setQuestionForm((current) => ({ ...current, bank_id: event.target.value, course_id: String(bank?.course_id ?? "") }));
                    }}
                  >
                    <option value="">请选择题库</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="user_question_course_id">课程 ID</label>
                  <input
                    id="user_question_course_id"
                    value={questionForm.course_id}
                    onChange={(event) => setQuestionForm((current) => ({ ...current, course_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="user_question_type">题型</label>
                  <select
                    id="user_question_type"
                    value={questionForm.question_type}
                    onChange={(event) => setQuestionForm((current) => ({ ...current, question_type: event.target.value }))}
                  >
                    <option value="single_choice">单选题</option>
                    <option value="multiple_choice">多选题</option>
                    <option value="true_false">判断题</option>
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="user_question_difficulty">难度</label>
                  <select
                    id="user_question_difficulty"
                    value={questionForm.difficulty}
                    onChange={(event) => setQuestionForm((current) => ({ ...current, difficulty: event.target.value }))}
                  >
                    <option value="easy">简单</option>
                    <option value="medium">中等</option>
                    <option value="hard">困难</option>
                  </select>
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="user_question_stem">题干</label>
                  <textarea
                    id="user_question_stem"
                    value={questionForm.stem}
                    onChange={(event) => setQuestionForm((current) => ({ ...current, stem: event.target.value }))}
                  />
                </div>
                {questionForm.question_type !== "true_false" ? (
                  <div className="ui-admin-form__grid ui-admin-form__grid--wide" style={{ gridColumn: "1 / -1" }}>
                    {(["a", "b", "c", "d"] as const).map((key) => (
                      <div className="ui-admin-form__field" key={key}>
                        <label htmlFor={`user_question_option_${key}`}>选项 {key.toUpperCase()}</label>
                        <input
                          id={`user_question_option_${key}`}
                          value={questionForm[`option_${key}`]}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, [`option_${key}`]: event.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="ui-admin-form__field">
                      <label htmlFor="user_question_correct_keys">正确答案</label>
                      <input
                        id="user_question_correct_keys"
                        placeholder="单选填 A，多选填 A,C"
                        value={questionForm.correct_keys}
                        onChange={(event) => setQuestionForm((current) => ({ ...current, correct_keys: event.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="ui-admin-form__field">
                    <label htmlFor="user_question_true_false">正确答案</label>
                    <select
                      id="user_question_true_false"
                      value={questionForm.true_false_value}
                      onChange={(event) => setQuestionForm((current) => ({ ...current, true_false_value: event.target.value }))}
                    >
                      <option value="true">正确</option>
                      <option value="false">错误</option>
                    </select>
                  </div>
                )}
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="user_question_analysis">解析</label>
                  <textarea
                    id="user_question_analysis"
                    value={questionForm.analysis}
                    onChange={(event) => setQuestionForm((current) => ({ ...current, analysis: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary" disabled={items.length === 0}>
                    新建题目
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
                          <button type="button" className="ui-admin-link" onClick={() => openDetail(item)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handlePublish(item.id)}>
                            发布
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

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>题目列表</h3>
                </div>
              </div>
              {questionLoading ? <div className="ui-status ui-status--info">题目加载中...</div> : null}
              {!questionLoading && questions.length === 0 ? <div className="ui-admin-empty-inline">当前题库暂无题目</div> : null}
              {!questionLoading && questions.length > 0 ? (
                <div className="ui-admin-list">
                  {questions.map((question) => (
                    <article key={question.id} className="ui-admin-list__item">
                      <strong>{formatQuestionType(question.question_type)}</strong>
                      <p>{getQuestionStem(question)}</p>
                      <small>难度：{formatDifficulty(question.difficulty)}</small>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}

      {detailItem ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="我的题库详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>题库详情</h3>
                <p>{detailItem.name}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setDetailItem(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>名称</dt>
                  <dd>{detailItem.name}</dd>
                </div>
                <div>
                  <dt>课程 ID</dt>
                  <dd>{detailItem.course_id ?? "-"}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{detailItem.status === "active" ? "已发布" : "草稿"}</dd>
                </div>
                <div>
                  <dt>说明</dt>
                  <dd>{detailItem.description ?? "暂无说明"}</dd>
                </div>
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setDetailItem(null)}>
                我知道了
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildVisibilityGrants(form: typeof defaultBankForm): QuestionBankVisibilityGrant[] {
  const grants: QuestionBankVisibilityGrant[] = [];
  if (form.visible_to_students) {
    grants.push({
      grant_type: "visibility",
      target_type: "student",
      target_id: 0,
      permission_type: "view",
      inherit_to_children: true
    });
  }
  if (form.visible_to_tenant_admins) {
    grants.push({
      grant_type: "visibility",
      target_type: "tenant_admin",
      target_id: 0,
      permission_type: "view",
      inherit_to_children: true
    });
  }
  if (form.share_to_teachers) {
    grants.push({
      grant_type: "share",
      target_type: "teacher",
      target_id: 0,
      permission_type: "share",
      inherit_to_children: false
    });
  }
  parseIDList(form.share_teacher_ids).forEach((id) => {
    grants.push({ grant_type: "share", target_type: "teacher", target_id: id, permission_type: "share" });
  });
  parseIDList(form.share_class_ids).forEach((id) => {
    grants.push({ grant_type: "share", target_type: "class", target_id: id, permission_type: "practice", inherit_to_children: true });
  });
  parseIDList(form.share_student_ids).forEach((id) => {
    grants.push({ grant_type: "share", target_type: "student", target_id: id, permission_type: "practice" });
  });
  return grants;
}

function buildQuestionPayload(form: typeof defaultQuestionForm, bankID: number, courseID?: number | null): QuestionInput | string {
  const stem = form.stem.trim();
  if (!stem) {
    return "请输入题干。";
  }

  const bankIDs = [bankID];
  const courseIDs = courseID && Number.isFinite(courseID) && courseID > 0 ? [courseID] : [];
  if (form.question_type === "true_false") {
    return {
      question_type: "true_false",
      difficulty: form.difficulty,
      content: {
        stem: { content_type: "text", text: stem, assets: [] },
        options: [
          { key: "A", content_type: "text", text: "正确", assets: [] },
          { key: "B", content_type: "text", text: "错误", assets: [] }
        ],
        option_order_randomizable: false,
        ext: {}
      },
      answer: { judge_mode: "boolean", correct_value: form.true_false_value === "true" },
      analysis: form.analysis ? { text: form.analysis } : undefined,
      bank_ids: bankIDs,
      course_ids: courseIDs
    };
  }

  const options = [
    { key: "A", value: form.option_a },
    { key: "B", value: form.option_b },
    { key: "C", value: form.option_c },
    { key: "D", value: form.option_d }
  ]
    .map((option) => ({ ...option, value: option.value.trim() }))
    .filter((option) => option.value);
  const correctKeys = parseKeyList(form.correct_keys);
  if (options.length < 2) {
    return "请至少填写两个选项。";
  }
  if (correctKeys.length === 0) {
    return "请填写正确答案。";
  }
  if (form.question_type === "single_choice" && correctKeys.length !== 1) {
    return "单选题只能填写一个正确答案。";
  }

  return {
    question_type: form.question_type,
    difficulty: form.difficulty,
    content: {
      stem: { content_type: "text", text: stem, assets: [] },
      options: options.map((option) => ({ key: option.key, content_type: "text", text: option.value, assets: [] })),
      option_order_randomizable: true,
      ext: {}
    },
    answer: { judge_mode: "by_option_key", correct_keys: correctKeys },
    analysis: form.analysis ? { text: form.analysis } : undefined,
    bank_ids: bankIDs,
    course_ids: courseIDs
  };
}

function parseIDList(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function parseKeyList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function formatQuestionType(value: string): string {
  switch (value) {
    case "single_choice":
      return "单选题";
    case "multiple_choice":
      return "多选题";
    case "true_false":
      return "判断题";
    default:
      return value;
  }
}

function formatDifficulty(value?: string | null): string {
  switch (value) {
    case "easy":
      return "简单";
    case "medium":
      return "中等";
    case "hard":
      return "困难";
    default:
      return value || "-";
  }
}

function getQuestionStem(question: Question): string {
  const content = question.current_content;
  if (!content || typeof content !== "object" || !("stem" in content)) {
    return "暂无题干";
  }
  const stem = (content as { stem?: { text?: unknown } }).stem;
  return typeof stem?.text === "string" && stem.text ? stem.text : "暂无题干";
}
