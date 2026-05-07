import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Course,
  CourseListQuery,
  FileAsset,
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

export interface QuestionPanelApi {
  listQuestions(query?: QuestionListQuery): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
  updateQuestion(id: number, body: QuestionUpdateInput): Promise<Question>;
  listQuestionVersions(id: number): Promise<QuestionVersion[]>;
  createQuestionVersion(id: number, body: QuestionVersionInput): Promise<QuestionVersion>;
  listQuestionBanks?(query?: QuestionBankListQuery): Promise<PageResult<QuestionBank>>;
  listCourses?(query?: CourseListQuery): Promise<PageResult<Course>>;
  uploadFile?(body: FormData): Promise<FileAsset>;
}

const defaultPageSize = 10;

interface QuestionForm {
  question_type: string;
  difficulty: string;
  bank_id: string;
  course_id: string;
  stem: QuestionContentDraft;
  option_group: QuestionContentDraft;
  options: QuestionOptionDraft[];
  correct_key: string;
  option_order_randomizable: boolean;
}

interface VersionForm {
  stem: QuestionContentDraft;
  option_group: QuestionContentDraft;
  options: QuestionOptionDraft[];
  correct_key: string;
  option_order_randomizable: boolean;
  change_summary: string;
}

function createDefaultQuestionForm(): QuestionForm {
  return {
    question_type: "single_choice",
    difficulty: "medium",
    bank_id: "",
    course_id: "",
    stem: createContentDraft(),
    option_group: createContentDraft(),
    options: createDefaultOptionDrafts("", ""),
    correct_key: "B",
    option_order_randomizable: true
  };
}

const defaultEditForm = {
  difficulty: "",
  status: "",
  bank_id: "",
  course_id: ""
};

function createDefaultVersionForm(): VersionForm {
  return {
    stem: createContentDraft(),
    option_group: createContentDraft(),
    options: createDefaultOptionDrafts("1", "2"),
    correct_key: "B",
    option_order_randomizable: true,
    change_summary: ""
  };
}

const questionTypeOptions = [
  { value: "single_choice", label: "单选题" },
  { value: "multiple_choice", label: "多选题" },
  { value: "true_false", label: "判断题" },
  { value: "fill_blank", label: "填空题" },
  { value: "short_answer", label: "简答题" }
];

const difficultyOptions = [
  { value: "easy", label: "简单" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "困难" }
];

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "disabled", label: "禁用" }
];

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
  const [questionForm, setQuestionForm] = useState<QuestionForm>(() => createDefaultQuestionForm());
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [versionForm, setVersionForm] = useState<VersionForm>(() => createDefaultVersionForm());
  const [modal, setModal] = useState<ModalState>(null);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const bankNameMap = useMemo(() => new Map(banks.map((bank) => [bank.id, bank.name])), [banks]);
  const courseNameMap = useMemo(() => new Map(courses.map((course) => [course.id, course.name])), [courses]);
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
        key: "course_ids",
        title: "绑定课程",
        render: (item) => formatCourseNames(item.course_ids, courseNameMap)
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
    [bankNameMap, courseNameMap]
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
      content: buildChoiceContent(questionForm.stem, questionForm.option_group, questionForm.options, questionForm.option_order_randomizable),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [normalizeCorrectKey(questionForm.correct_key, questionForm.options)]
      },
      analysis: {},
      bank_ids: questionForm.bank_id ? [Number(questionForm.bank_id)] : [],
      course_ids: questionForm.course_id ? [Number(questionForm.course_id)] : []
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
      status: editForm.status || undefined,
      bank_ids: editForm.bank_id ? [Number(editForm.bank_id)] : [],
      course_ids: editForm.course_id ? [Number(editForm.course_id)] : []
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
      content: buildChoiceContent(versionForm.stem, versionForm.option_group, versionForm.options, versionForm.option_order_randomizable),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [normalizeCorrectKey(versionForm.correct_key, versionForm.options)]
      },
      analysis: {},
      change_summary: versionForm.change_summary || undefined
    });
    setVersionForm(createDefaultVersionForm());
    setVersions(await api.listQuestionVersions(modal.item.id));
    await loadPage();
  }

  async function openDetailModal(item: Question) {
    setModal({ type: "detail", item });
    try {
      const nextVersions = await api.listQuestionVersions(item.id);
      setVersions(nextVersions);
      const latestVersion = versionsFromLatest(nextVersions);
      if (latestVersion) {
        setVersionForm(buildVersionFormFromVersion(latestVersion));
      }
    } catch (error) {
      setVersions([]);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "题目版本加载失败");
    }
  }

  async function uploadQuestionAsset(file: File | null, usage: string): Promise<QuestionAssetDraft | null> {
    try {
      return await uploadAssetFile(api, file, usage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "图片上传失败");
      return null;
    }
  }

  function openEditModal(item: Question) {
    setEditForm({
      difficulty: item.difficulty ?? "",
      status: item.status,
      bank_id: item.bank_ids?.[0] ? String(item.bank_ids[0]) : "",
      course_id: item.course_ids?.[0] ? String(item.course_ids[0]) : ""
    });
    setModal({ type: "edit", item });
  }

  function updateQuestionOption(index: number, text: string) {
    setQuestionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, text } : option))
    }));
  }

  async function addQuestionStemAsset(file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_stem");
    if (!asset) {
      return;
    }
    setQuestionForm((current) => ({ ...current, stem: { ...current.stem, assets: [...current.stem.assets, asset] } }));
  }

  function removeQuestionStemAsset(assetID: string) {
    setQuestionForm((current) => ({ ...current, stem: removeContentAsset(current.stem, assetID) }));
  }

  async function addQuestionOptionGroupAsset(file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_option_group");
    if (!asset) {
      return;
    }
    setQuestionForm((current) => ({ ...current, option_group: { ...current.option_group, assets: [...current.option_group.assets, asset] } }));
  }

  function removeQuestionOptionGroupAsset(assetID: string) {
    setQuestionForm((current) => ({ ...current, option_group: removeContentAsset(current.option_group, assetID) }));
  }

  async function addQuestionOptionAsset(index: number, file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_option");
    if (!asset) {
      return;
    }
    setQuestionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, assets: [...option.assets, asset] } : option
      )
    }));
  }

  function removeQuestionOptionAsset(index: number, assetID: string) {
    setQuestionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? removeOptionAsset(option, assetID) : option))
    }));
  }

  function addQuestionOption() {
    setQuestionForm((current) => ({
      ...current,
      options: [...current.options, createOptionDraft()]
    }));
  }

  function removeQuestionOption(index: number) {
    setQuestionForm((current) => {
      if (current.options.length <= 1) {
        return current;
      }
      const options = current.options.filter((_, optionIndex) => optionIndex !== index);
      return {
        ...current,
        options,
        correct_key: normalizeCorrectKey(current.correct_key, options)
      };
    });
  }

  function updateVersionOption(index: number, text: string) {
    setVersionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, text } : option))
    }));
  }

  async function addVersionStemAsset(file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_stem");
    if (!asset) {
      return;
    }
    setVersionForm((current) => ({ ...current, stem: { ...current.stem, assets: [...current.stem.assets, asset] } }));
  }

  function removeVersionStemAsset(assetID: string) {
    setVersionForm((current) => ({ ...current, stem: removeContentAsset(current.stem, assetID) }));
  }

  async function addVersionOptionGroupAsset(file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_option_group");
    if (!asset) {
      return;
    }
    setVersionForm((current) => ({ ...current, option_group: { ...current.option_group, assets: [...current.option_group.assets, asset] } }));
  }

  function removeVersionOptionGroupAsset(assetID: string) {
    setVersionForm((current) => ({ ...current, option_group: removeContentAsset(current.option_group, assetID) }));
  }

  async function addVersionOptionAsset(index: number, file: File | null) {
    const asset = await uploadQuestionAsset(file, "question_option");
    if (!asset) {
      return;
    }
    setVersionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, assets: [...option.assets, asset] } : option
      )
    }));
  }

  function removeVersionOptionAsset(index: number, assetID: string) {
    setVersionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? removeOptionAsset(option, assetID) : option))
    }));
  }

  function addVersionOption() {
    setVersionForm((current) => ({
      ...current,
      options: [...current.options, createOptionDraft()]
    }));
  }

  function removeVersionOption(index: number) {
    setVersionForm((current) => {
      if (current.options.length <= 1) {
        return current;
      }
      const options = current.options.filter((_, optionIndex) => optionIndex !== index);
      return {
        ...current,
        options,
        correct_key: normalizeCorrectKey(current.correct_key, options)
      };
    });
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
        { key: "course_names", title: "绑定课程" },
        { key: "source_type_label", title: "来源" },
        { key: "updated_at_label", title: "更新时间" }
      ],
      items.map((item) => ({
        ...item,
        question_type_label: formatQuestionType(item.question_type),
        difficulty_label: formatDifficulty(item.difficulty),
        status_label: formatStatusLabel(item.status),
        bank_names: formatBankNames(item.bank_ids, bankNameMap),
        course_names: formatCourseNames(item.course_ids, courseNameMap),
        source_type_label: formatSourceType(item.source_type),
        updated_at_label: formatDateTime(item.updated_at)
      }))
    );
  }

  function closeModal() {
    setModal(null);
    setQuestionForm(createDefaultQuestionForm());
    setEditForm(defaultEditForm);
    setVersionForm(createDefaultVersionForm());
    setVersions([]);
  }

  return (
    <section aria-label="题目管理面板" className="ui-admin-page" style={pageStyle}>
      <h2 style={visuallyHiddenStyle}>题目管理</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="题目数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="题目数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="question_keyword" label="关键字" placeholder="输入题目关键字" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="question_type_filter" label="题型" placeholder="请选择题型" value={questionType} onChange={setQuestionType}>
            {questionTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
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
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
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
                          {questionTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_difficulty">难度</label>
                        <select
                          id="question_difficulty"
                          value={questionForm.difficulty}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, difficulty: event.target.value }))}
                        >
                          {difficultyOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
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
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_course_id">绑定课程</label>
                        <select
                          id="question_course_id"
                          value={questionForm.course_id}
                          onChange={(event) => setQuestionForm((current) => ({ ...current, course_id: event.target.value }))}
                        >
                          <option value="">不绑定课程</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <ContentDraftFields
                        idPrefix="question_stem"
                        label="题干"
                        draft={questionForm.stem}
                        onTextChange={(text) => setQuestionForm((current) => ({ ...current, stem: { ...current.stem, text } }))}
                        onAssetAdd={(file) => void addQuestionStemAsset(file)}
                        onAssetRemove={removeQuestionStemAsset}
                      />
                      <ContentDraftFields
                        idPrefix="question_option_group"
                        label="选项整体图片/说明"
                        draft={questionForm.option_group}
                        onTextChange={(text) => setQuestionForm((current) => ({ ...current, option_group: { ...current.option_group, text } }))}
                        onAssetAdd={(file) => void addQuestionOptionGroupAsset(file)}
                        onAssetRemove={removeQuestionOptionGroupAsset}
                      />
                      <OptionDraftFields
                        idPrefix="question"
                        options={questionForm.options}
                        correctKey={questionForm.correct_key}
                        correctKeyLabel="正确答案"
                        onOptionChange={updateQuestionOption}
                        onOptionAssetAdd={(index, file) => void addQuestionOptionAsset(index, file)}
                        onOptionAssetRemove={removeQuestionOptionAsset}
                        onAddOption={addQuestionOption}
                        onRemoveOption={removeQuestionOption}
                        onCorrectKeyChange={(correctKey) => setQuestionForm((current) => ({ ...current, correct_key: correctKey }))}
                      />
                      <div className="ui-admin-form__field">
                        <label className="ui-inline-checkbox" htmlFor="question_option_randomizable">
                          <input
                            id="question_option_randomizable"
                            type="checkbox"
                            checked={questionForm.option_order_randomizable}
                            onChange={(event) => setQuestionForm((current) => ({ ...current, option_order_randomizable: event.target.checked }))}
                          />
                          <span>选项允许随机排序</span>
                        </label>
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
                          {difficultyOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
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
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_edit_bank_id">所属题库</label>
                        <select
                          id="question_edit_bank_id"
                          value={editForm.bank_id}
                          onChange={(event) => setEditForm((current) => ({ ...current, bank_id: event.target.value }))}
                        >
                          <option value="">不绑定题库</option>
                          {banks.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_edit_course_id">绑定课程</label>
                        <select
                          id="question_edit_course_id"
                          value={editForm.course_id}
                          onChange={(event) => setEditForm((current) => ({ ...current, course_id: event.target.value }))}
                        >
                          <option value="">不绑定课程</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name}
                            </option>
                          ))}
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
                    <div>
                      <dt>绑定课程</dt>
                      <dd>{formatCourseNames(modal.item.course_ids, courseNameMap)}</dd>
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
                      <ContentDraftFields
                        idPrefix="question_version_stem"
                        label="版本题干"
                        draft={versionForm.stem}
                        onTextChange={(text) => setVersionForm((current) => ({ ...current, stem: { ...current.stem, text } }))}
                        onAssetAdd={(file) => void addVersionStemAsset(file)}
                        onAssetRemove={removeVersionStemAsset}
                      />
                      <ContentDraftFields
                        idPrefix="question_version_option_group"
                        label="版本选项整体图片/说明"
                        draft={versionForm.option_group}
                        onTextChange={(text) => setVersionForm((current) => ({ ...current, option_group: { ...current.option_group, text } }))}
                        onAssetAdd={(file) => void addVersionOptionGroupAsset(file)}
                        onAssetRemove={removeVersionOptionGroupAsset}
                      />
                      <OptionDraftFields
                        idPrefix="question_version"
                        options={versionForm.options}
                        correctKey={versionForm.correct_key}
                        correctKeyLabel="版本正确答案"
                        onOptionChange={updateVersionOption}
                        onOptionAssetAdd={(index, file) => void addVersionOptionAsset(index, file)}
                        onOptionAssetRemove={removeVersionOptionAsset}
                        onAddOption={addVersionOption}
                        onRemoveOption={removeVersionOption}
                        onCorrectKeyChange={(correctKey) => setVersionForm((current) => ({ ...current, correct_key: correctKey }))}
                      />
                      <div className="ui-admin-form__field">
                        <label className="ui-inline-checkbox" htmlFor="question_version_option_randomizable">
                          <input
                            id="question_version_option_randomizable"
                            type="checkbox"
                            checked={versionForm.option_order_randomizable}
                            onChange={(event) => setVersionForm((current) => ({ ...current, option_order_randomizable: event.target.checked }))}
                          />
                          <span>版本选项允许随机排序</span>
                        </label>
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

interface OptionDraftFieldsProps {
  idPrefix: string;
  options: QuestionOptionDraft[];
  correctKey: string;
  correctKeyLabel: string;
  onOptionChange(index: number, text: string): void;
  onOptionAssetAdd(index: number, file: File | null): void;
  onOptionAssetRemove(index: number, assetID: string): void;
  onAddOption(): void;
  onRemoveOption(index: number): void;
  onCorrectKeyChange(correctKey: string): void;
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

function OptionDraftFields({
  idPrefix,
  options,
  correctKey,
  correctKeyLabel,
  onOptionChange,
  onOptionAssetAdd,
  onOptionAssetRemove,
  onAddOption,
  onRemoveOption,
  onCorrectKeyChange
}: OptionDraftFieldsProps) {
  return (
    <>
      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
        <div style={optionSectionHeaderStyle}>
          <span style={optionSectionTitleStyle}>选项</span>
          <button type="button" className="ui-button ui-button--ghost" onClick={onAddOption}>
            增加选项
          </button>
        </div>
        <div style={optionListStyle}>
          {options.map((option, index) => {
            const optionKey = getOptionKey(index);
            const optionInputID = `${idPrefix}_option_${option.draft_id}`;
            return (
              <div key={option.draft_id} style={optionRowStyle}>
                <label htmlFor={optionInputID}>{`选项 ${optionKey}`}</label>
                <div style={optionInputRowStyle}>
                  <input
                    id={optionInputID}
                    value={option.text}
                    onChange={(event) => onOptionChange(index, event.target.value)}
                  />
                  <button
                    type="button"
                    className="ui-button ui-button--ghost"
                    onClick={() => onRemoveOption(index)}
                    disabled={options.length <= 1}
                  >
                    删除
                  </button>
                </div>
                <AssetDraftList assets={option.assets} onRemove={(assetID) => onOptionAssetRemove(index, assetID)} />
                <input
                  id={`${optionInputID}_file`}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    onOptionAssetAdd(index, event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ui-admin-form__field">
        <label htmlFor={`${idPrefix}_correct_key`}>{correctKeyLabel}</label>
        <select id={`${idPrefix}_correct_key`} value={normalizeCorrectKey(correctKey, options)} onChange={(event) => onCorrectKeyChange(event.target.value)}>
          {options.map((_, index) => {
            const optionKey = getOptionKey(index);
            return (
              <option key={optionKey} value={optionKey}>
                {optionKey}
              </option>
            );
          })}
        </select>
      </div>
    </>
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

function buildChoiceContent(
  stem: QuestionContentDraft,
  optionGroup: QuestionContentDraft,
  options: QuestionOptionDraft[],
  optionOrderRandomizable: boolean
): QuestionContentInput {
  const content: QuestionContentInput = {
    stem: buildQuestionContentBlock(stem),
    options: buildTextQuestionOptions(options),
    option_order_randomizable: optionOrderRandomizable,
    ext: {}
  };
  if (hasContentDraftValue(optionGroup)) {
    content.option_group = buildQuestionContentBlock(optionGroup);
  }
  return content;
}

function versionsFromLatest(versions: QuestionVersion[]): QuestionVersion | null {
  if (versions.length === 0) {
    return null;
  }
  return versions.reduce((latest, version) => (version.version_no > latest.version_no ? version : latest), versions[0]);
}

function buildVersionFormFromVersion(version: QuestionVersion): VersionForm {
  const content = version.content as {
    stem?: { text?: string | null; assets?: QuestionAssetDraft[] | null };
    option_group?: { text?: string | null; assets?: QuestionAssetDraft[] | null };
    options?: Array<{ text?: string | null; assets?: QuestionAssetDraft[] | null }>;
    option_order_randomizable?: boolean;
  };
  const options = content.options ?? [];
  const optionDrafts = options.length > 0 ? options.map((option) => createOptionDraftFromOption(option)) : createDefaultOptionDrafts("", "");
  const answer = version.answer as { correct_keys?: string[] };
  return {
    stem: createContentDraftFromBlock(content.stem),
    option_group: createContentDraftFromBlock(content.option_group),
    options: optionDrafts,
    correct_key: normalizeCorrectKey(answer.correct_keys?.[0] ?? "A", optionDrafts),
    option_order_randomizable: content.option_order_randomizable ?? true,
    change_summary: version.change_summary ?? ""
  };
}

async function uploadAssetFile(api: QuestionPanelApi, file: File | null, usage: string): Promise<QuestionAssetDraft | null> {
  if (!file) {
    return null;
  }
  if (api.uploadFile) {
    const payload = new FormData();
    payload.append("file", file);
    payload.append("usage", usage);
    return createAssetDraftFromFileAsset(await api.uploadFile(payload));
  }
  return createAssetDraftFromURL(await readFileAsDataURL(file), file.type.startsWith("image/") ? "image" : "file");
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

function formatCourseNames(courseIDs: number[] | undefined, courseNameMap: Map<number, string>): string {
  if (!courseIDs || courseIDs.length === 0) {
    return "-";
  }
  return courseIDs.map((id) => courseNameMap.get(id) ?? `课程-${id}`).join("、");
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

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0
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
  gridTemplateColumns: "minmax(160px, 240px) minmax(140px, 200px) minmax(160px, 220px) minmax(160px, 220px) minmax(120px, 170px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};

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
