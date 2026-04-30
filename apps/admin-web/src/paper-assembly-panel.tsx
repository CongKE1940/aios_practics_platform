import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Course,
  CourseListQuery,
  ExamFixedQuestion,
  ExamPaper,
  ExamPaperDetail,
  ExamPaperInput,
  ExamPaperListQuery,
  ExamPaperRule,
  PageResult,
  Question,
  QuestionBank,
  QuestionBankListQuery,
  QuestionContentInput,
  QuestionListQuery
} from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

export interface PaperManagementApi {
  listExamPapers(query?: ExamPaperListQuery): Promise<PageResult<ExamPaper>>;
  createExamPaper(body: ExamPaperInput): Promise<ExamPaperDetail>;
  getExamPaper(id: number): Promise<ExamPaperDetail>;
  updateExamPaper(id: number, body: ExamPaperInput): Promise<ExamPaperDetail>;
  publishExamPaper(id: number): Promise<ExamPaperDetail>;
  listQuestions(query?: QuestionListQuery): Promise<PageResult<Question>>;
  listQuestionBanks(query?: QuestionBankListQuery): Promise<PageResult<QuestionBank>>;
  listCourses(query?: CourseListQuery): Promise<PageResult<Course>>;
}

interface PaperManagementPanelProps {
  api: PaperManagementApi;
}

type PaperType = "fixed" | "random_rule";

interface TypePlan {
  question_type: string;
  count: string;
  score: string;
  use_banks: boolean;
  bank_ids: number[];
  use_course: boolean;
  course_id: string;
}

interface SelectedQuestion {
  question_id: number;
  question_version_id: number;
  question_type: string;
  score: number;
  display_order: number;
  difficulty?: string | null;
  bank_ids?: number[];
  course_ids?: number[];
  stem?: string;
}

interface FormState {
  paper_name: string;
  paper_type: PaperType;
  fixed_plans: TypePlan[];
  random_plans: TypePlan[];
  selected_questions: SelectedQuestion[];
}

interface SelectorFilter {
  question_type: string;
  bank_id: string;
  course_id: string;
  keyword: string;
}

type ModalState = { type: "create" } | { type: "edit"; item: ExamPaper } | { type: "detail"; item: ExamPaper } | null;

const defaultPageSize = 10;
const questionTypeOptions = [
  { value: "single_choice", label: "单选题", defaultScore: "2" },
  { value: "multiple_choice", label: "多选题", defaultScore: "3" },
  { value: "true_false", label: "判断题", defaultScore: "1" }
];

const defaultSelectorFilter: SelectorFilter = {
  question_type: "",
  bank_id: "",
  course_id: "",
  keyword: ""
};

const columns: Array<FixedActionListColumn<ExamPaper>> = [
  {
    key: "paper_name",
    title: "试卷名称",
    render: (item) => item.paper_name
  },
  {
    key: "paper_type",
    title: "试卷类型",
    width: 130,
    render: (item) => formatPaperType(item.paper_type)
  },
  {
    key: "status",
    title: "状态",
    width: 110,
    render: (item) => <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
  },
  {
    key: "question_count",
    title: "题量",
    width: 90,
    render: (item) => `${item.question_count ?? 0} 题`
  },
  {
    key: "total_score",
    title: "总分",
    width: 90,
    render: (item) => `${formatScore(item.total_score)} 分`
  },
  {
    key: "updated_at",
    title: "更新时间",
    width: 170,
    render: (item) => formatDateTime(item.updated_at ?? item.created_at)
  }
];

export function PaperManagementPanel({ api }: PaperManagementPanelProps) {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<ExamPaper[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [candidates, setCandidates] = useState<SelectedQuestion[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [detail, setDetail] = useState<ExamPaperDetail | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorFilter, setSelectorFilter] = useState<SelectorFilter>(defaultSelectorFilter);
  const [form, setForm] = useState<FormState>(() => createDefaultForm());
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const bankNameMap = useMemo(() => new Map(banks.map((bank) => [bank.id, bank.name])), [banks]);
  const courseNameMap = useMemo(() => new Map(courses.map((course) => [course.id, course.name])), [courses]);
  const selectedCounts = useMemo(() => countQuestionsByType(form.selected_questions), [form.selected_questions]);
  const fixedTargets = useMemo(() => countTargetsByType(form.fixed_plans), [form.fixed_plans]);
  const currentSummary = useMemo(() => summarizeForm(form), [form]);
  const fixedGaps = useMemo(() => fixedSelectionGaps(form.fixed_plans, selectedCounts), [form.fixed_plans, selectedCounts]);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildQuery("", "", 1, defaultPageSize));
    void loadOptions();
  }, [api]);

  async function loadOptions() {
    try {
      const [bankResult, courseResult] = await Promise.all([
        api.listQuestionBanks({ status: "active", page: 1, page_size: 500 }),
        api.listCourses({ status: "active", page: 1, page_size: 500 })
      ]);
      setBanks(bankResult.items);
      setCourses(courseResult.items);
    } catch (error) {
      setBanks([]);
      setCourses([]);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "题库或课程选项加载失败");
    }
  }

  async function loadPage(query: ExamPaperListQuery = buildQuery(keyword, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listExamPapers(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "试卷数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidates(filter: SelectorFilter = selectorFilter) {
    setCandidateLoading(true);
    setErrorMessage("");
    try {
      const baseQuery: QuestionListQuery = {
        question_type: filter.question_type || undefined,
        bank_id: positiveNumberOrUndefined(filter.bank_id),
        course_id: positiveNumberOrUndefined(filter.course_id),
        keyword: filter.keyword.trim() || undefined,
        status: "active",
        page: 1
      };
      const firstPage = await api.listQuestions({ ...baseQuery, page_size: 1 });
      const result = firstPage.total > 1 ? await api.listQuestions({ ...baseQuery, page_size: firstPage.total }) : firstPage;
      setCandidateTotal(result.total);
      setCandidates(
        result.items
          .filter((item) => Boolean(item.current_version_id))
          .map((item) => toSelectedQuestion(item, scoreForType(form.fixed_plans, item.question_type)))
      );
    } catch (error) {
      setCandidates([]);
      setCandidateTotal(0);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "题目数据加载失败");
    } finally {
      setCandidateLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildQuery(keyword, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildQuery("", "", 1, defaultPageSize));
  }

  function openCreateModal() {
    setDetail(null);
    setSelectorOpen(false);
    setCandidates([]);
    setForm(createDefaultForm());
    setModal({ type: "create" });
  }

  async function openDetailModal(item: ExamPaper) {
    setModal({ type: "detail", item });
    setDetailLoading(true);
    setErrorMessage("");
    try {
      setDetail(await api.getExamPaper(item.id));
    } catch (error) {
      setDetail(null);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "试卷详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEditModal(item: ExamPaper) {
    setModal({ type: "edit", item });
    setDetailLoading(true);
    setSelectorOpen(false);
    try {
      const data = await api.getExamPaper(item.id);
      setDetail(data);
      setForm(buildFormFromDetail(data));
    } catch (error) {
      setDetail(null);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "试卷详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }
    if (modal?.type === "edit") {
      await api.updateExamPaper(modal.item.id, payload);
    } else {
      await api.createExamPaper(payload);
    }
    closeModal();
    await loadPage();
  }

  async function handlePublish(item: ExamPaper) {
    await api.publishExamPaper(item.id);
    await loadPage();
    if (detail?.id === item.id) {
      setDetail(await api.getExamPaper(item.id));
    }
  }

  function closeModal() {
    setModal(null);
    setSelectorOpen(false);
    setCandidates([]);
    setDetail(null);
    setForm(createDefaultForm());
  }

  function updateFixedPlan(questionType: string, patch: Partial<TypePlan>) {
    setForm((current) => ({
      ...current,
      fixed_plans: current.fixed_plans.map((plan) => (plan.question_type === questionType ? { ...plan, ...patch } : plan))
    }));
  }

  function updateRandomPlan(questionType: string, patch: Partial<TypePlan>) {
    setForm((current) => ({
      ...current,
      random_plans: current.random_plans.map((plan) => (plan.question_type === questionType ? { ...plan, ...patch } : plan))
    }));
  }

  function toggleRandomBank(questionType: string, bankID: number) {
    setForm((current) => ({
      ...current,
      random_plans: current.random_plans.map((plan) =>
        plan.question_type === questionType ? { ...plan, bank_ids: toggleID(plan.bank_ids, bankID) } : plan
      )
    }));
  }

  function openQuestionSelector() {
    if (fixedTargetTotal(form.fixed_plans) <= 0) {
      setErrorMessage("请先填写固定试卷中至少一种题型的题目数量。");
      return;
    }
    setSelectorOpen(true);
    void loadCandidates(selectorFilter);
  }

  function toggleCandidate(candidate: SelectedQuestion) {
    const selected = form.selected_questions.some((item) => item.question_id === candidate.question_id);
    if (!selected && !canSelectCandidate(candidate, selectedCounts, fixedTargets)) {
      return;
    }
    setForm((current) => {
      const exists = current.selected_questions.some((item) => item.question_id === candidate.question_id);
      if (exists) {
        return {
          ...current,
          selected_questions: current.selected_questions.filter((item) => item.question_id !== candidate.question_id)
        };
      }
      return {
        ...current,
        selected_questions: [
          ...current.selected_questions,
          {
            ...candidate,
            score: scoreForType(current.fixed_plans, candidate.question_type),
            display_order: current.selected_questions.length + 1
          }
        ]
      };
    });
  }

  function removeSelectedQuestion(questionID: number) {
    setForm((current) => ({
      ...current,
      selected_questions: current.selected_questions.filter((item) => item.question_id !== questionID)
    }));
  }

  return (
    <section aria-label="试卷管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="试卷处理失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="试卷数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="paper_keyword" label="关键字" placeholder="输入试卷名称" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="paper_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
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
          onCreate={openCreateModal}
          onDetail={(item) => void openDetailModal(item)}
          onEdit={(item) => void openEditModal(item)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void loadPage(buildQuery(keyword, status, nextPage, pageSize))}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无试卷数据"}
          ariaLabel="试卷列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(item) => `选择试卷-${item.paper_name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="试卷管理弹层" style={modalStyle}>
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>试卷详情</h3>
                    <p>{detail?.paper_name ?? modal.item.paper_name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  {detailLoading ? <div className="ui-admin-empty-inline">试卷详情加载中...</div> : null}
                  {!detailLoading && detail ? (
                    <>
                      <dl className="ui-admin-meta-list">
                        <div>
                          <dt>试卷类型</dt>
                          <dd>{formatPaperType(detail.paper_type)}</dd>
                        </div>
                        <div>
                          <dt>状态</dt>
                          <dd>{formatStatus(detail.status)}</dd>
                        </div>
                        <div>
                          <dt>题量</dt>
                          <dd>{detail.question_count} 题</dd>
                        </div>
                        <div>
                          <dt>总分</dt>
                          <dd>{formatScore(detail.total_score)} 分</dd>
                        </div>
                      </dl>
                      <div className="ui-admin-mini-list">
                        <article className="ui-admin-mini-item">
                          <strong>题目清单</strong>
                          <p>{formatQuestions(detail.questions)}</p>
                        </article>
                        <article className="ui-admin-mini-item">
                          <strong>抽题范围</strong>
                          <p>{formatRules(detail.paper_rules, bankNameMap, courseNameMap)}</p>
                        </article>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    {detail?.status === "draft" ? (
                      <button type="button" className="ui-button ui-button--ghost" onClick={() => void handlePublish(detail)}>
                        发布试卷
                      </button>
                    ) : null}
                    {detail?.status === "draft" ? (
                      <button type="button" className="ui-button ui-button--primary" onClick={() => void openEditModal(detail)}>
                        编辑
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增试卷" : "编辑试卷"}</h3>
                    <p>
                      {currentSummary.questionCount} 题 / {formatScore(currentSummary.totalScore)} 分
                    </p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    {detailLoading ? <div className="ui-admin-empty-inline">试卷草稿加载中...</div> : null}
                    <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                      <div className="ui-admin-form__field">
                        <label htmlFor="paper_name">试卷名称</label>
                        <input
                          id="paper_name"
                          value={form.paper_name}
                          onChange={(event) => setForm((current) => ({ ...current, paper_name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="paper_type">试卷类型</label>
                        <select
                          id="paper_type"
                          value={form.paper_type}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, paper_type: event.target.value as PaperType }))
                          }
                        >
                          <option value="fixed">固定试卷</option>
                          <option value="random_rule">随机试卷</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="paper_summary">试卷摘要</label>
                        <input
                          id="paper_summary"
                          value={`${currentSummary.questionCount} 题 / ${formatScore(currentSummary.totalScore)} 分`}
                          readOnly
                        />
                      </div>
                    </div>

                    {form.paper_type === "fixed" ? (
                      <FixedPaperBuilder
                        form={form}
                        selectedCounts={selectedCounts}
                        gaps={fixedGaps}
                        bankNameMap={bankNameMap}
                        courseNameMap={courseNameMap}
                        onUpdatePlan={updateFixedPlan}
                        onOpenSelector={openQuestionSelector}
                        onRemoveSelected={removeSelectedQuestion}
                      />
                    ) : (
                      <RandomPaperBuilder
                        plans={form.random_plans}
                        banks={banks}
                        courses={courses}
                        onUpdatePlan={updateRandomPlan}
                        onToggleBank={toggleRandomBank}
                      />
                    )}
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary" disabled={detailLoading}>
                      {modal.type === "create" ? "新增试卷" : "保存修改"}
                    </button>
                  </div>
                </form>

                {selectorOpen ? (
                  <QuestionSelectorDialog
                    filter={selectorFilter}
                    candidates={candidates}
                    candidateTotal={candidateTotal}
                    loading={candidateLoading}
                    selectedQuestions={form.selected_questions}
                    selectedCounts={selectedCounts}
                    fixedTargets={fixedTargets}
                    banks={banks}
                    courses={courses}
                    bankNameMap={bankNameMap}
                    courseNameMap={courseNameMap}
                    onFilterChange={setSelectorFilter}
                    onQuery={(nextFilter) => void loadCandidates(nextFilter)}
                    onToggleCandidate={toggleCandidate}
                    onClose={() => setSelectorOpen(false)}
                  />
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function FixedPaperBuilder({
  form,
  selectedCounts,
  gaps,
  bankNameMap,
  courseNameMap,
  onUpdatePlan,
  onOpenSelector,
  onRemoveSelected
}: {
  form: FormState;
  selectedCounts: Map<string, number>;
  gaps: string[];
  bankNameMap: Map<number, string>;
  courseNameMap: Map<number, string>;
  onUpdatePlan(questionType: string, patch: Partial<TypePlan>): void;
  onOpenSelector(): void;
  onRemoveSelected(questionID: number): void;
}) {
  return (
    <section aria-label="固定试卷配置" style={builderSectionStyle}>
      <div style={sectionHeaderStyle}>
        <strong>固定试卷配置</strong>
        <button type="button" className="ui-button ui-button--primary" onClick={onOpenSelector}>
          选择题目
        </button>
      </div>
      <div style={typePlanGridStyle}>
        {form.fixed_plans.map((plan) => {
          const selected = selectedCounts.get(plan.question_type) ?? 0;
          const target = parsePositiveInt(plan.count);
          return (
            <article key={plan.question_type} style={typePlanCardStyle}>
              <strong>{formatQuestionType(plan.question_type)}</strong>
              <div className="ui-admin-form__grid" style={compactGridStyle}>
                <div className="ui-admin-form__field">
                  <label htmlFor={`fixed_count_${plan.question_type}`}>题目数量</label>
                  <input
                    id={`fixed_count_${plan.question_type}`}
                    type="number"
                    min="0"
                    value={plan.count}
                    onChange={(event) => onUpdatePlan(plan.question_type, { count: event.target.value })}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor={`fixed_score_${plan.question_type}`}>每题分值</label>
                  <input
                    id={`fixed_score_${plan.question_type}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={plan.score}
                    onChange={(event) => onUpdatePlan(plan.question_type, { score: event.target.value })}
                  />
                </div>
              </div>
              <span style={target === selected && target > 0 ? readyTextStyle : mutedTextStyle}>
                已选 {selected} / {target} 题
              </span>
            </article>
          );
        })}
      </div>
      <div style={selectedPanelStyle}>
        <div style={sectionHeaderStyle}>
          <strong>已选题目</strong>
          <span style={gaps.length === 0 && form.selected_questions.length > 0 ? readyTextStyle : mutedTextStyle}>
            {gaps.length === 0 && form.selected_questions.length > 0 ? "题量已满足" : gaps.join("，") || "尚未选择题目"}
          </span>
        </div>
        <div style={selectedQuestionListStyle}>
          {form.selected_questions.length === 0 ? (
            <div className="ui-admin-empty-inline">暂无已选题目</div>
          ) : (
            form.selected_questions.map((question, index) => (
              <article key={question.question_id} style={selectedQuestionItemStyle}>
                <div>
                  <strong>
                    {index + 1}. {question.stem || `题目 ${question.question_id}`}
                  </strong>
                  <p style={mutedParagraphStyle}>
                    {formatQuestionType(question.question_type)} / {formatDifficulty(question.difficulty)} /{" "}
                    {formatIDNames(question.bank_ids, bankNameMap, "题库")} /{" "}
                    {formatIDNames(question.course_ids, courseNameMap, "课程")}
                  </p>
                </div>
                <button type="button" className="ui-button ui-button--ghost" onClick={() => onRemoveSelected(question.question_id)}>
                  移除
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function RandomPaperBuilder({
  plans,
  banks,
  courses,
  onUpdatePlan,
  onToggleBank
}: {
  plans: TypePlan[];
  banks: QuestionBank[];
  courses: Course[];
  onUpdatePlan(questionType: string, patch: Partial<TypePlan>): void;
  onToggleBank(questionType: string, bankID: number): void;
}) {
  return (
    <section aria-label="随机试卷配置" style={builderSectionStyle}>
      <strong>随机试卷配置</strong>
      <div style={typePlanGridStyle}>
        {plans.map((plan) => (
          <article key={plan.question_type} style={typePlanCardStyle}>
            <strong>{formatQuestionType(plan.question_type)}</strong>
            <div className="ui-admin-form__grid" style={compactGridStyle}>
              <div className="ui-admin-form__field">
                <label htmlFor={`random_count_${plan.question_type}`}>题目数量</label>
                <input
                  id={`random_count_${plan.question_type}`}
                  type="number"
                  min="0"
                  value={plan.count}
                  onChange={(event) => onUpdatePlan(plan.question_type, { count: event.target.value })}
                />
              </div>
              <div className="ui-admin-form__field">
                <label htmlFor={`random_score_${plan.question_type}`}>每题分值</label>
                <input
                  id={`random_score_${plan.question_type}`}
                  type="number"
                  min="0"
                  step="0.5"
                  value={plan.score}
                  onChange={(event) => onUpdatePlan(plan.question_type, { score: event.target.value })}
                />
              </div>
            </div>
            <label style={inlineCheckStyle}>
              <input
                type="checkbox"
                checked={plan.use_banks}
                onChange={(event) =>
                  onUpdatePlan(plan.question_type, {
                    use_banks: event.target.checked,
                    bank_ids: event.target.checked ? plan.bank_ids : []
                  })
                }
              />
              指定题库
            </label>
            {plan.use_banks ? (
              <div style={checkboxGroupStyle}>
                {banks.map((bank) => (
                  <label key={bank.id} style={checkboxItemStyle}>
                    <input
                      type="checkbox"
                      checked={plan.bank_ids.includes(bank.id)}
                      onChange={() => onToggleBank(plan.question_type, bank.id)}
                    />
                    {bank.name}
                  </label>
                ))}
              </div>
            ) : null}
            <label style={inlineCheckStyle}>
              <input
                type="checkbox"
                checked={plan.use_course}
                onChange={(event) =>
                  onUpdatePlan(plan.question_type, {
                    use_course: event.target.checked,
                    course_id: event.target.checked ? plan.course_id : ""
                  })
                }
              />
              指定课程
            </label>
            {plan.use_course ? (
              <div className="ui-admin-form__field">
                <select
                  aria-label={`${formatQuestionType(plan.question_type)}指定课程`}
                  value={plan.course_id}
                  onChange={(event) => onUpdatePlan(plan.question_type, { course_id: event.target.value })}
                >
                  <option value="">请选择课程</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function QuestionSelectorDialog({
  filter,
  candidates,
  candidateTotal,
  loading,
  selectedQuestions,
  selectedCounts,
  fixedTargets,
  banks,
  courses,
  bankNameMap,
  courseNameMap,
  onFilterChange,
  onQuery,
  onToggleCandidate,
  onClose
}: {
  filter: SelectorFilter;
  candidates: SelectedQuestion[];
  candidateTotal: number;
  loading: boolean;
  selectedQuestions: SelectedQuestion[];
  selectedCounts: Map<string, number>;
  fixedTargets: Map<string, number>;
  banks: QuestionBank[];
  courses: Course[];
  bankNameMap: Map<number, string>;
  courseNameMap: Map<number, string>;
  onFilterChange(filter: SelectorFilter): void;
  onQuery(filter: SelectorFilter): void;
  onToggleCandidate(candidate: SelectedQuestion): void;
  onClose(): void;
}) {
  const selectedIDs = new Set(selectedQuestions.map((item) => item.question_id));

  function updateFilter(patch: Partial<SelectorFilter>) {
    onFilterChange({ ...filter, ...patch });
  }

  return (
    <div style={selectorBackdropStyle}>
      <section aria-label="题目选择弹窗" style={selectorModalStyle}>
        <div className="ui-admin-modal__header">
          <div>
            <h3>选择固定试卷题目</h3>
            <p>
              已选 {selectedQuestions.length} 题，当前条件 {candidateTotal} 题
            </p>
          </div>
          <button type="button" className="ui-button ui-button--ghost" onClick={onClose}>
            完成
          </button>
        </div>
        <div className="ui-admin-modal__body" style={selectorBodyStyle}>
          <div style={selectorFilterStyle}>
            <div className="ui-admin-form__field">
              <label htmlFor="selector_question_type">题型</label>
              <select id="selector_question_type" value={filter.question_type} onChange={(event) => updateFilter({ question_type: event.target.value })}>
                <option value="">全部题型</option>
                {questionTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="selector_bank">题库</label>
              <select id="selector_bank" value={filter.bank_id} onChange={(event) => updateFilter({ bank_id: event.target.value })}>
                <option value="">全部题库</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="selector_course">课程</label>
              <select id="selector_course" value={filter.course_id} onChange={(event) => updateFilter({ course_id: event.target.value })}>
                <option value="">全部课程</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="selector_keyword">关键字</label>
              <input id="selector_keyword" value={filter.keyword} onChange={(event) => updateFilter({ keyword: event.target.value })} />
            </div>
            <button type="button" className="ui-button ui-button--primary" onClick={() => onQuery(filter)} disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
          </div>
          <div style={candidateListStyle}>
            {loading ? <div className="ui-admin-empty-inline">题目加载中...</div> : null}
            {!loading && candidates.length === 0 ? <div className="ui-admin-empty-inline">暂无符合条件的题目</div> : null}
            {candidates.map((candidate) => {
              const selected = selectedIDs.has(candidate.question_id);
              const disabled = !selected && !canSelectCandidate(candidate, selectedCounts, fixedTargets);
              return (
                <article key={candidate.question_id} style={candidateItemStyle}>
                  <label style={candidateCheckStyle}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => onToggleCandidate(candidate)}
                    />
                    <span>
                      <strong>{candidate.stem || `题目 ${candidate.question_id}`}</strong>
                      <span style={candidateMetaStyle}>
                        {formatQuestionType(candidate.question_type)} / {formatDifficulty(candidate.difficulty)} /{" "}
                        {formatIDNames(candidate.bank_ids, bankNameMap, "题库")} /{" "}
                        {formatIDNames(candidate.course_ids, courseNameMap, "课程")}
                      </span>
                    </span>
                  </label>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export function PaperAssemblyPanel({ api }: PaperManagementPanelProps) {
  return <PaperManagementPanel api={api} />;
}

function createDefaultForm(): FormState {
  return {
    paper_name: "",
    paper_type: "fixed",
    fixed_plans: createTypePlans(),
    random_plans: createTypePlans(),
    selected_questions: []
  };
}

function createTypePlans(): TypePlan[] {
  return questionTypeOptions.map((item) => ({
    question_type: item.value,
    count: "",
    score: item.defaultScore,
    use_banks: false,
    bank_ids: [],
    use_course: false,
    course_id: ""
  }));
}

function buildQuery(keyword: string, status: string, page: number, pageSize: number): ExamPaperListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function buildPayload(form: FormState): ExamPaperInput | string {
  const paperName = form.paper_name.trim();
  if (!paperName) {
    return "请填写试卷名称。";
  }
  if (form.paper_type === "fixed") {
    if (form.selected_questions.length === 0) {
      return "请先选择固定试卷题目。";
    }
    const gaps = fixedSelectionGaps(form.fixed_plans, countQuestionsByType(form.selected_questions));
    if (fixedTargetTotal(form.fixed_plans) > 0 && gaps.length > 0) {
      return `固定试卷题量未满足：${gaps.join("，")}。`;
    }
    const fixedQuestions = form.selected_questions
      .slice()
      .sort((left, right) => questionTypeOrder(left.question_type) - questionTypeOrder(right.question_type) || left.question_id - right.question_id)
      .map((item, index) => ({
        question_id: item.question_id,
        question_version_id: item.question_version_id,
        score: scoreForType(form.fixed_plans, item.question_type) || item.score,
        display_order: index + 1
      }));
    return { paper_name: paperName, paper_type: "fixed", fixed_questions: fixedQuestions, paper_rules: [] };
  }

  const rules: ExamPaperRule[] = [];
  for (const plan of form.random_plans) {
    const count = parsePositiveInt(plan.count);
    if (count <= 0) {
      continue;
    }
    const score = parsePositiveFloat(plan.score);
    if (score <= 0) {
      return `${formatQuestionType(plan.question_type)} 每题分值必须大于 0。`;
    }
    if (plan.use_banks && plan.bank_ids.length === 0) {
      return `${formatQuestionType(plan.question_type)} 已勾选指定题库，请至少选择一个题库。`;
    }
    if (plan.use_course && !positiveNumberOrUndefined(plan.course_id)) {
      return `${formatQuestionType(plan.question_type)} 已勾选指定课程，请选择课程。`;
    }
    rules.push({
      question_type: plan.question_type,
      score_per_question: score,
      question_count: count,
      bank_ids: plan.use_banks ? plan.bank_ids : [],
      course_id: plan.use_course ? positiveNumberOrUndefined(plan.course_id) : undefined
    });
  }
  if (rules.length === 0) {
    return "请至少填写一种题型的题目数量。";
  }
  return { paper_name: paperName, paper_type: "random_rule", fixed_questions: [], paper_rules: rules };
}

function buildFormFromDetail(detail: ExamPaperDetail): FormState {
  const form = createDefaultForm();
  form.paper_name = detail.paper_name;
  form.paper_type = detail.paper_type === "random_rule" ? "random_rule" : "fixed";
  form.selected_questions = detail.questions.map((item) => {
    const typed = item as ExamFixedQuestion & { question_type?: string; stem?: string };
    return {
      question_id: item.question_id,
      question_version_id: item.question_version_id,
      question_type: typed.question_type ?? "",
      score: item.score,
      display_order: item.display_order,
      stem: typed.stem
    };
  });
  for (const rule of detail.paper_rules) {
    form.random_plans = form.random_plans.map((plan) =>
      plan.question_type === rule.question_type
        ? {
            ...plan,
            count: String(rule.question_count),
            score: formatScore(rule.score_per_question),
            use_banks: Boolean(rule.bank_ids && rule.bank_ids.length > 0),
            bank_ids: rule.bank_ids ?? [],
            use_course: Boolean(rule.course_id),
            course_id: rule.course_id ? String(rule.course_id) : ""
          }
        : plan
    );
  }
  return form;
}

function summarizeForm(form: FormState): { questionCount: number; totalScore: number } {
  if (form.paper_type === "fixed") {
    return {
      questionCount: form.selected_questions.length,
      totalScore: form.selected_questions.reduce((sum, item) => sum + (scoreForType(form.fixed_plans, item.question_type) || item.score), 0)
    };
  }
  const rules = form.random_plans
    .map((plan) => ({ count: parsePositiveInt(plan.count), score: parsePositiveFloat(plan.score) }))
    .filter((item) => item.count > 0 && item.score > 0);
  return {
    questionCount: rules.reduce((sum, item) => sum + item.count, 0),
    totalScore: rules.reduce((sum, item) => sum + item.count * item.score, 0)
  };
}

function toSelectedQuestion(question: Question, score: number): SelectedQuestion {
  return {
    question_id: question.id,
    question_version_id: question.current_version_id ?? 0,
    question_type: question.question_type,
    score,
    display_order: 0,
    difficulty: question.difficulty,
    bank_ids: question.bank_ids ?? [],
    course_ids: question.course_ids ?? [],
    stem: extractQuestionStem(question.current_content)
  };
}

function canSelectCandidate(candidate: SelectedQuestion, selectedCounts: Map<string, number>, fixedTargets: Map<string, number>): boolean {
  if (!candidate.question_version_id || !candidate.question_type) {
    return false;
  }
  const target = fixedTargets.get(candidate.question_type) ?? 0;
  if (target <= 0) {
    return false;
  }
  return (selectedCounts.get(candidate.question_type) ?? 0) < target;
}

function fixedSelectionGaps(plans: TypePlan[], selectedCounts: Map<string, number>): string[] {
  const gaps: string[] = [];
  for (const plan of plans) {
    const target = parsePositiveInt(plan.count);
    if (target <= 0) {
      continue;
    }
    const selected = selectedCounts.get(plan.question_type) ?? 0;
    if (selected < target) {
      gaps.push(`${formatQuestionType(plan.question_type)}差 ${target - selected} 题`);
    }
    if (selected > target) {
      gaps.push(`${formatQuestionType(plan.question_type)}多 ${selected - target} 题`);
    }
  }
  return gaps;
}

function fixedTargetTotal(plans: TypePlan[]): number {
  return plans.reduce((sum, plan) => sum + parsePositiveInt(plan.count), 0);
}

function countQuestionsByType(questions: SelectedQuestion[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const question of questions) {
    if (!question.question_type) {
      continue;
    }
    result.set(question.question_type, (result.get(question.question_type) ?? 0) + 1);
  }
  return result;
}

function countTargetsByType(plans: TypePlan[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const plan of plans) {
    result.set(plan.question_type, parsePositiveInt(plan.count));
  }
  return result;
}

function scoreForType(plans: TypePlan[], questionType: string): number {
  const plan = plans.find((item) => item.question_type === questionType);
  return parsePositiveFloat(plan?.score ?? "") || 0;
}

function questionTypeOrder(questionType: string): number {
  const index = questionTypeOptions.findIndex((item) => item.value === questionType);
  return index >= 0 ? index : questionTypeOptions.length;
}

function toggleID(values: number[], target: number): number[] {
  return values.includes(target) ? values.filter((item) => item !== target) : [...values, target];
}

function positiveNumberOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePositiveInt(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parsePositiveFloat(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function extractQuestionStem(content?: QuestionContentInput | Record<string, unknown>): string {
  if (!content) {
    return "";
  }
  const stem = (content as { stem?: { text?: unknown } }).stem;
  if (stem && typeof stem.text === "string" && stem.text.trim()) {
    return stem.text.trim();
  }
  const text = (content as { text?: unknown }).text;
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }
  return "";
}

function formatQuestions(items: ExamFixedQuestion[]): string {
  if (!items || items.length === 0) {
    return "暂无题目";
  }
  return items
    .slice()
    .sort((left, right) => left.display_order - right.display_order)
    .map((item) => `第 ${item.display_order} 题：题目 ${item.question_id} / ${formatScore(item.score)} 分`)
    .join("；");
}

function formatRules(items: ExamPaperRule[], bankNameMap: Map<number, string>, courseNameMap: Map<number, string>): string {
  if (!items || items.length === 0) {
    return "暂无抽题范围";
  }
  return items
    .map((item, index) => {
      const banks = formatIDNames(item.bank_ids, bankNameMap, "题库");
      const course = item.course_id ? courseNameMap.get(item.course_id) ?? `课程-${item.course_id}` : "不限课程";
      return `规则 ${index + 1}：${formatQuestionType(item.question_type)} × ${item.question_count}，每题 ${formatScore(
        item.score_per_question
      )} 分，${banks}，${course}`;
    })
    .join("；");
}

function formatPaperType(value: string): string {
  switch (value) {
    case "random_rule":
      return "随机试卷";
    case "fixed":
      return "固定试卷";
    default:
      return value || "-";
  }
}

function formatQuestionType(value: string): string {
  return questionTypeOptions.find((item) => item.value === value)?.label ?? (value || "题目");
}

function formatDifficulty(value?: string | null): string {
  switch (value) {
    case "easy":
      return "容易";
    case "medium":
      return "中等";
    case "hard":
      return "困难";
    default:
      return value || "-";
  }
}

function formatStatus(value: string): string {
  switch (value) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    default:
      return value || "-";
  }
}

function statusClassName(value: string): string {
  if (value === "published") {
    return "ui-admin-status ui-admin-status--active";
  }
  return "ui-admin-status ui-admin-status--pending";
}

function formatScore(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatIDNames(values: number[] | undefined, names: Map<number, string>, fallbackPrefix: string): string {
  if (!values || values.length === 0) {
    return `不限${fallbackPrefix}`;
  }
  return values.map((value) => names.get(value) ?? `${fallbackPrefix}-${value}`).join("、");
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

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "试卷或题目接口暂不可用，请检查后端服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "请求参数错误，请检查题型数量、分值和选题范围。";
  }
  if (/question pool insufficient/i.test(message)) {
    return "随机试卷题量不足，请减少数量或放宽题库、课程范围。";
  }
  return message || "试卷数据加载失败";
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
  gridTemplateColumns: "minmax(220px, 320px) minmax(160px, 220px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};

const modalStyle: CSSProperties = {
  width: "min(1120px, calc(100vw - 48px))"
};

const builderSectionStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  marginTop: 18
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12
};

const typePlanGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12
};

const typePlanCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  border: "1px solid var(--ui-border-subtle)",
  borderRadius: 8,
  padding: 14,
  background: "var(--ui-surface)"
};

const compactGridStyle: CSSProperties = {
  gridTemplateColumns: "1fr 1fr",
  gap: 10
};

const selectedPanelStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  border: "1px solid var(--ui-border-subtle)",
  borderRadius: 8,
  padding: 14
};

const selectedQuestionListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 260,
  overflow: "auto"
};

const selectedQuestionItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid var(--ui-border-subtle)",
  paddingBottom: 8
};

const inlineCheckStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8
};

const checkboxGroupStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  maxHeight: 120,
  overflow: "auto",
  padding: 10,
  border: "1px solid var(--ui-border-subtle)",
  borderRadius: 8
};

const checkboxItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8
};

const selectorBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  display: "grid",
  placeItems: "center",
  background: "rgba(15, 23, 42, 0.42)"
};

const selectorModalStyle: CSSProperties = {
  width: "min(980px, calc(100vw - 48px))",
  maxHeight: "min(820px, calc(100vh - 48px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  background: "var(--ui-surface)",
  borderRadius: 12,
  overflow: "hidden"
};

const selectorBodyStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: 0
};

const selectorFilterStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(130px, 1fr)) auto",
  gap: 10,
  alignItems: "end"
};

const candidateListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  minHeight: 0,
  overflow: "auto"
};

const candidateItemStyle: CSSProperties = {
  border: "1px solid var(--ui-border-subtle)",
  borderRadius: 8,
  padding: 12
};

const candidateCheckStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: 10,
  alignItems: "start"
};

const candidateMetaStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "var(--ui-text-muted)",
  fontSize: 13
};

const mutedTextStyle: CSSProperties = {
  color: "var(--ui-text-muted)"
};

const readyTextStyle: CSSProperties = {
  color: "var(--ui-success)"
};

const mutedParagraphStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "var(--ui-text-muted)"
};
