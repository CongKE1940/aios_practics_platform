import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Course,
  CourseListQuery,
  PageResult,
  Question,
  QuestionBank,
  QuestionBankListQuery,
  QuestionContentInput,
  QuestionInput,
  QuestionListQuery,
  QuestionUpdateInput,
  QuestionVersion,
  QuestionVersionInput
} from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface QuestionPanelApi {
  listQuestions(query?: QuestionListQuery): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
  updateQuestion(id: number, body: QuestionUpdateInput): Promise<Question>;
  listQuestionVersions(id: number): Promise<QuestionVersion[]>;
  createQuestionVersion(id: number, body: QuestionVersionInput): Promise<QuestionVersion>;
  listQuestionBanks?(query?: QuestionBankListQuery): Promise<PageResult<QuestionBank>>;
  listCourses?(query?: CourseListQuery): Promise<PageResult<Course>>;
}

const defaultPageSize = 10;

const defaultQuestionForm = {
  question_type: "single_choice",
  difficulty: "medium",
  bank_id: "",
  stem: "",
  option_a: "",
  option_b: "",
  correct_key: "B"
};

const defaultEditForm = {
  difficulty: "",
  status: ""
};

const defaultVersionForm = {
  stem: "",
  correct_key: "B",
  change_summary: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; item: Question }
  | { type: "edit"; item: Question }
  | null;

export function QuestionPanel({ api, onNavigate }: { api: QuestionPanelApi; onNavigate?: (path: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<Question[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [versions, setVersions] = useState<QuestionVersion[]>([]);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [keyword, setKeyword] = useState("");
  const [questionType, setQuestionType] = useState("");
  const [courseID, setCourseID] = useState("");
  const [bankID, setBankID] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [versionForm, setVersionForm] = useState(defaultVersionForm);
  const [modal, setModal] = useState<ModalState>(null);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const bankNameMap = useMemo(() => new Map(banks.map((bank) => [bank.id, bank.name])), [banks]);
  const columns = useMemo<Array<FixedActionListColumn<Question>>>(
    () => [
      {
        key: "question_type",
        title: "题型",
        render: (item) => formatQuestionType(item.question_type)
      },
      {
        key: "difficulty",
        title: "难度",
        width: 110,
        render: (item) => formatDifficulty(item.difficulty)
      },
      {
        key: "status",
        title: "状态",
        width: 110,
        render: (item) => <span className={statusClassName(item.status)}>{formatStatusLabel(item.status)}</span>
      },
      {
        key: "current_version_no",
        title: "当前版本",
        width: 110,
        render: (item) => item.current_version_no ?? "-"
      },
      {
        key: "bank_ids",
        title: "所属题库",
        render: (item) => formatBankNames(item.bank_ids, bankNameMap)
      },
      {
        key: "source_type",
        title: "来源",
        width: 110,
        render: (item) => formatSourceType(item.source_type)
      },
      {
        key: "updated_at",
        title: "更新时间",
        width: 160,
        render: (item) => formatDateTime(item.updated_at)
      }
    ],
    [bankNameMap]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildQuestionQuery("", "", "", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(
    query: QuestionListQuery = buildQuestionQuery(keyword, questionType, courseID, bankID, status, page, pageSize)
  ) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [bankResult, courseResult, questionResult] = await Promise.all([
        api.listQuestionBanks
          ? api.listQuestionBanks({ page: 1, page_size: 100 })
          : Promise.resolve<PageResult<QuestionBank>>({ items: [], page: 1, page_size: 100, total: 0 }),
        api.listCourses ? api.listCourses({ page: 1, page_size: 100 }) : Promise.resolve<PageResult<Course>>({ items: [], page: 1, page_size: 100, total: 0 }),
        api.listQuestions(query)
      ]);
      setBanks(bankResult.items);
      setCourses(courseResult.items);
      setItems(questionResult.items);
      setTotal(questionResult.total);
      setPage(questionResult.page || query.page || 1);
      setPageSize(questionResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "题目数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildQuestionQuery(keyword, questionType, courseID, bankID, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setQuestionType("");
    setCourseID("");
    setBankID("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildQuestionQuery("", "", "", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadPage(buildQuestionQuery(keyword, questionType, courseID, bankID, status, nextPage, pageSize));
  }

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
    await loadPage();
  }

  async function handleUpdateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.type !== "edit") {
      return;
    }

    await api.updateQuestion(modal.item.id, {
      difficulty: editForm.difficulty || undefined,
      status: editForm.status || undefined
    });
    closeModal();
    await loadPage();
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
    await loadPage();
  }

  async function openDetailModal(item: Question) {
    setModal({ type: "detail", item });
    try {
      setVersions(await api.listQuestionVersions(item.id));
    } catch (error) {
      setVersions([]);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "题目版本加载失败");
    }
  }

  function openEditModal(item: Question) {
    setEditForm({
      difficulty: item.difficulty ?? "",
      status: item.status
    });
    setModal({ type: "edit", item });
  }

  async function handleBatchDelete(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
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
    await loadPage();
  }

  function handleExport() {
    downloadCsv(
      "questions.csv",
      [
        { key: "question_type_label", title: "题型" },
        { key: "difficulty_label", title: "难度" },
        { key: "status_label", title: "状态" },
        { key: "current_version_no", title: "当前版本" },
        { key: "bank_names", title: "所属题库" },
        { key: "source_type_label", title: "来源" },
        { key: "updated_at_label", title: "更新时间" }
      ],
      items.map((item) => ({
        ...item,
        question_type_label: formatQuestionType(item.question_type),
        difficulty_label: formatDifficulty(item.difficulty),
        status_label: formatStatusLabel(item.status),
        bank_names: formatBankNames(item.bank_ids, bankNameMap),
        source_type_label: formatSourceType(item.source_type),
        updated_at_label: formatDateTime(item.updated_at)
      }))
    );
  }

  function closeModal() {
    setModal(null);
    setQuestionForm(defaultQuestionForm);
    setEditForm(defaultEditForm);
    setVersionForm(defaultVersionForm);
    setVersions([]);
  }

  return (
    <section aria-label="题目管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="题目数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="题目数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="question_keyword" label="关键字" placeholder="输入题目关键字" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="question_type_filter" label="题型" placeholder="请选择题型" value={questionType} onChange={setQuestionType}>
              <option value="single_choice">单选题</option>
              <option value="multiple_choice">多选题</option>
              <option value="true_false">判断题</option>
              <option value="fill_blank">填空题</option>
              <option value="short_answer">简答题</option>
          </ClearableFilterSelect>
          <ClearableFilterSelect id="question_course_id" label="课程" placeholder="请选择课程" value={courseID} onChange={setCourseID}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="question_bank_id_filter" label="题库" placeholder="请选择题库" value={bankID} onChange={setBankID}>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="question_status_filter" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
          </ClearableFilterSelect>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleReset()} disabled={loading}>
              重置
            </button>
          </div>
        </form>

        <FixedActionList
          rows={items}
          columns={columns}
          getRowId={(item) => item.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={() => setModal({ type: "create" })}
          onDelete={(rowIds) => void handleBatchDelete(rowIds)}
          onExport={handleExport}
          onDetail={(item) => void openDetailModal(item)}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无题目数据"}
          ariaLabel="题目列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(item) => `选择题目-${item.id}`}
        />
      </section>

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
                          <option value="single_choice">单选题</option>
                          <option value="multiple_choice">多选题</option>
                          <option value="true_false">判断题</option>
                          <option value="fill_blank">填空题</option>
                          <option value="short_answer">简答题</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_difficulty">难度</label>
                        <select
                          id="question_difficulty"
                          value={questionForm.difficulty}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, difficulty: event.target.value }))}
                        >
                          <option value="easy">简单</option>
                          <option value="medium">中等</option>
                          <option value="hard">困难</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_bank_id">所属题库</label>
                        <select
                          id="question_bank_id"
                          value={questionForm.bank_id}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, bank_id: event.target.value }))}
                        >
                          <option value="">不绑定题库</option>
                          {banks.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name}
                            </option>
                          ))}
                        </select>
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
                        <label htmlFor="question_option_a">选项 A</label>
                        <input
                          id="question_option_a"
                          value={questionForm.option_a}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, option_a: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_option_b">选项 B</label>
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
            ) : modal.type === "edit" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>编辑题目</h3>
                    <p>{`题目 #${modal.item.id}`}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleUpdateQuestion(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_edit_difficulty">难度</label>
                        <select
                          id="question_edit_difficulty"
                          value={editForm.difficulty}
                          onChange={(event) => setEditForm((current) => ({ ...current, difficulty: event.target.value }))}
                        >
                          <option value="">不修改</option>
                          <option value="easy">简单</option>
                          <option value="medium">中等</option>
                          <option value="hard">困难</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_edit_status">状态</label>
                        <select
                          id="question_edit_status"
                          value={editForm.status}
                          onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                        >
                          <option value="">不修改</option>
                          <option value="active">启用</option>
                          <option value="disabled">禁用</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    {onNavigate ? (
                      <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate("/admin/questions/editor")}>
                        进入题目编辑器
                      </button>
                    ) : null}
                    <button type="submit" className="ui-button ui-button--primary">
                      保存修改
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
                      <dd>{formatQuestionType(modal.item.question_type)}</dd>
                    </div>
                    <div>
                      <dt>难度</dt>
                      <dd>{formatDifficulty(modal.item.difficulty)}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.item.status)}</dd>
                    </div>
                    <div>
                      <dt>当前版本</dt>
                      <dd>{modal.item.current_version_no ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>所属题库</dt>
                      <dd>{formatBankNames(modal.item.bank_ids, bankNameMap)}</dd>
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
                        <button type="button" className="ui-button ui-button--ghost" onClick={() => openEditModal(modal.item)}>
                          编辑题目
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

function buildQuestionQuery(
  keyword: string,
  questionType: string,
  courseID: string,
  bankID: string,
  status: string,
  page: number,
  pageSize: number
): QuestionListQuery {
  return {
    keyword: keyword.trim() || undefined,
    question_type: questionType || undefined,
    course_id: courseID ? Number(courseID) : undefined,
    bank_id: bankID ? Number(bankID) : undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
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

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "题目列表接口暂不可用，请检查后端 /api/v1/questions 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "题目请求参数错误，请检查课程、题库或题目内容。";
  }
  return message || "题目数据加载失败";
}

function formatQuestionType(questionType: string): string {
  switch (questionType) {
    case "single_choice":
      return "单选题";
    case "multiple_choice":
      return "多选题";
    case "true_false":
      return "判断题";
    case "fill_blank":
      return "填空题";
    case "short_answer":
      return "简答题";
    default:
      return questionType || "-";
  }
}

function formatDifficulty(difficulty?: string | null): string {
  switch (difficulty) {
    case "easy":
      return "简单";
    case "medium":
      return "中等";
    case "hard":
      return "困难";
    default:
      return difficulty || "-";
  }
}

function statusClassName(status: string): string {
  if (["active", "published", "enabled"].includes(status)) {
    return "ui-admin-status ui-admin-status--active";
  }
  if (["disabled", "inactive"].includes(status)) {
    return "ui-admin-status ui-admin-status--disabled";
  }
  return "ui-admin-status ui-admin-status--draft";
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "禁用";
    default:
      return status || "-";
  }
}

function formatSourceType(sourceType: string): string {
  switch (sourceType) {
    case "manual":
      return "手动创建";
    case "import":
      return "导入";
    default:
      return sourceType || "-";
  }
}

function formatBankNames(bankIDs: number[] | undefined, bankNameMap: Map<number, string>): string {
  if (!bankIDs || bankIDs.length === 0) {
    return "-";
  }
  return bankIDs.map((id) => bankNameMap.get(id) ?? `题库-${id}`).join("、");
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
};

const dataRegionStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 260px) minmax(160px, 220px) minmax(180px, 240px) minmax(180px, 240px) minmax(140px, 190px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
