import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Course,
  CourseListQuery,
  Exam,
  ExamDetail,
  ExamFixedQuestion,
  ExamInput,
  ExamListQuery,
  ExamOverviewResult,
  ExamOverviewSummary,
  ExamPaper,
  ExamPaperDetail,
  ExamPaperInput,
  ExamPaperListQuery,
  ExamPaperRule,
  ExamTarget,
  PageResult,
  Question,
  QuestionBank,
  QuestionBankListQuery,
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

import { downloadCsv } from "./list-page-utils";

export interface ExamPanelApi {
  listExams(query?: ExamListQuery): Promise<PageResult<Exam>>;
  createExam(body: ExamInput): Promise<ExamDetail>;
  getExam(id: number): Promise<ExamDetail>;
  updateExam(id: number, body: ExamInput): Promise<ExamDetail>;
  publishExam(id: number): Promise<ExamDetail>;
  listExamPapers?(query?: ExamPaperListQuery): Promise<PageResult<ExamPaper>>;
  createExamPaper?(body: ExamPaperInput): Promise<ExamPaperDetail>;
  getExamPaper?(id: number): Promise<ExamPaperDetail>;
  updateExamPaper?(id: number, body: ExamPaperInput): Promise<ExamPaperDetail>;
  publishExamPaper?(id: number): Promise<ExamPaperDetail>;
  listQuestions?(query?: QuestionListQuery): Promise<PageResult<Question>>;
  listQuestionBanks?(query?: QuestionBankListQuery): Promise<PageResult<QuestionBank>>;
  listCourses?(query?: CourseListQuery): Promise<PageResult<Course>>;
  getExamOverview(query: { exam_id: number; page?: number; page_size?: number }): Promise<ExamOverviewResult>;
}

interface ExamPanelProps {
  api: ExamPanelApi;
  onNavigate(path: string): void;
}

const defaultPageSize = 10;

const defaultExamForm = {
  name: "",
  exam_mode: "fixed",
  paper_id: "",
  start_time: "",
  end_time: "",
  duration_minutes: "60",
  targets_text: "",
  fixed_questions_text: "",
  paper_rules_text: ""
};

type ExamFormState = typeof defaultExamForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; exam: Exam }
  | { type: "edit"; exam: Exam }
  | null;

const columns: Array<FixedActionListColumn<Exam>> = [
  {
    key: "name",
    title: "考试名称",
    render: (exam) => exam.name
  },
  {
    key: "exam_mode",
    title: "组卷方式",
    width: 130,
    render: (exam) => formatExamMode(exam.exam_mode)
  },
  {
    key: "status",
    title: "状态",
    width: 120,
    render: (exam) => <span className={statusClassName(exam.status)}>{formatExamStatus(exam.status)}</span>
  },
  {
    key: "start_time",
    title: "开始时间",
    width: 170,
    render: (exam) => formatDateTime(exam.start_time)
  },
  {
    key: "end_time",
    title: "结束时间",
    width: 170,
    render: (exam) => formatDateTime(exam.end_time)
  },
  {
    key: "duration_minutes",
    title: "时长",
    width: 100,
    render: (exam) => `${exam.duration_minutes ?? 0} 分钟`
  }
];

export function ExamPanel({ api, onNavigate }: ExamPanelProps) {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetID, setTargetID] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const [overview, setOverview] = useState<ExamOverviewResult | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<ExamFormState>(defaultExamForm);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentDetailSummary = useMemo(
    () => overview?.summary ?? (detail ? emptySummary(detail) : null),
    [detail, overview]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadExams(buildExamQuery("", "", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadExams(query: ExamListQuery = buildExamQuery(keyword, status, targetType, targetID, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [result, paperResult] = await Promise.all([
        api.listExams(query),
        api.listExamPapers
          ? api.listExamPapers({ status: "published", page: 1, page_size: 100 })
          : Promise.resolve<PageResult<ExamPaper>>({ items: [], page: 1, page_size: 100, total: 0 })
      ]);
      setExams(result.items);
      setPapers(paperResult.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setExams([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "考试数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadExams(buildExamQuery(keyword, status, targetType, targetID, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setTargetType("");
    setTargetID("");
    setSelectedIDs([]);
    await loadExams(buildExamQuery("", "", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadExams(buildExamQuery(keyword, status, targetType, targetID, nextPage, pageSize));
  }

  function openCreateModal() {
    setDetail(null);
    setOverview(null);
    setForm(defaultExamForm);
    setModal({ type: "create" });
  }

  async function openDetailModal(exam: Exam) {
    setModal({ type: "detail", exam });
    await loadExamDetail(exam.id);
  }

  async function openEditModal(exam: Exam) {
    setModal({ type: "edit", exam });
    const examDetail = await loadExamDetail(exam.id);
    if (examDetail) {
      setForm(buildFormFromDetail(examDetail));
    }
  }

  async function loadExamDetail(examID: number): Promise<ExamDetail | null> {
    setDetailLoading(true);
    setErrorMessage("");
    try {
      const [detailResult, overviewResult] = await Promise.all([
        api.getExam(examID),
        api.getExamOverview({ exam_id: examID, page: 1, page_size: 8 })
      ]);
      setDetail(detailResult);
      setOverview(overviewResult);
      return detailResult;
    } catch (error) {
      setDetail(null);
      setOverview(null);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "考试详情加载失败");
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildExamPayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }

    if (modal?.type === "edit") {
      await api.updateExam(modal.exam.id, payload);
    } else {
      await api.createExam(payload);
    }

    closeModal();
    await loadExams();
  }

  async function handlePublish(examID: number) {
    await api.publishExam(examID);
    await loadExams();
    if (detail?.id === examID) {
      await loadExamDetail(examID);
    }
  }

  function handleExport() {
    downloadCsv(
      "exams.csv",
      [
        { key: "name", title: "考试名称" },
        { key: "exam_mode_label", title: "组卷方式" },
        { key: "status_label", title: "状态" },
        { key: "start_time_label", title: "开始时间" },
        { key: "end_time_label", title: "结束时间" },
        { key: "duration_minutes", title: "时长" }
      ],
      exams.map((exam) => ({
        ...exam,
        exam_mode_label: formatExamMode(exam.exam_mode),
        status_label: formatExamStatus(exam.status),
        start_time_label: formatDateTime(exam.start_time),
        end_time_label: formatDateTime(exam.end_time)
      }))
    );
  }

  function closeModal() {
    setModal(null);
    setDetail(null);
    setOverview(null);
    setForm(defaultExamForm);
  }

  return (
    <section aria-label="考试管理面板" className="ui-admin-page" style={pageStyle}>
      <h2 style={visuallyHiddenStyle}>考试管理</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="考试数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="考试数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="admin_exam_keyword" label="关键字" placeholder="考试名称" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="admin_exam_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="closed">已结束</option>
          </ClearableFilterSelect>
          <ClearableFilterSelect id="admin_exam_target_type" label="发布对象" placeholder="请选择发布对象" value={targetType} onChange={setTargetType}>
              <option value="class">班级</option>
              <option value="course">课程</option>
              <option value="user">用户</option>
          </ClearableFilterSelect>
          <ClearableFilterInput id="admin_exam_target_id" label="对象编号" inputMode="numeric" placeholder="输入对象编号" value={targetID} onChange={setTargetID} />
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
          rows={exams}
          columns={columns}
          getRowId={(exam) => exam.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onExport={handleExport}
          onDetail={(exam) => void openDetailModal(exam)}
          onEdit={(exam) => void openEditModal(exam)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无考试数据"}
          ariaLabel="考试列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(exam) => `选择考试-${exam.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="考试管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>考试详情</h3>
                    <p>{detail?.name ?? modal.exam.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  {detailLoading ? <div className="ui-admin-empty-inline">考试详情加载中...</div> : null}
                  {!detailLoading && detail ? (
                    <>
                      <dl className="ui-admin-meta-list">
                        <div>
                          <dt>考试名称</dt>
                          <dd>{detail.name}</dd>
                        </div>
                        <div>
                          <dt>组卷方式</dt>
                          <dd>{formatExamMode(detail.exam_mode)}</dd>
                        </div>
                        <div>
                          <dt>状态</dt>
                          <dd>{formatExamStatus(detail.status)}</dd>
                        </div>
                        <div>
                          <dt>考试时间</dt>
                          <dd>{`${formatDateTime(detail.start_time)} - ${formatDateTime(detail.end_time)}`}</dd>
                        </div>
                        <div>
                          <dt>时长</dt>
                          <dd>{detail.duration_minutes} 分钟</dd>
                        </div>
                        <div>
                          <dt>发布范围</dt>
                          <dd>{formatTargets(detail.targets)}</dd>
                        </div>
                      </dl>

                      {currentDetailSummary ? (
                        <div className="ui-admin-kpis">
                          <article className="ui-admin-kpi ui-admin-metrics-card">
                            <span>应参与人数</span>
                            <strong>{currentDetailSummary.student_count}</strong>
                          </article>
                          <article className="ui-admin-kpi ui-admin-metrics-card">
                            <span>已交卷</span>
                            <strong>{currentDetailSummary.submitted_count}</strong>
                          </article>
                          <article className="ui-admin-kpi ui-admin-metrics-card">
                            <span>平均分</span>
                            <strong>{formatScore(currentDetailSummary.average_score)}</strong>
                          </article>
                        </div>
                      ) : null}

                      <div className="ui-admin-mini-list">
                      <article className="ui-admin-mini-item">
                          <strong>选用试卷</strong>
                          <p>{detail.paper?.paper_name ?? formatPaperName(detail.paper_id, papers)}</p>
                        </article>
                        <article className="ui-admin-mini-item">
                          <strong>固定题目</strong>
                          <p>{formatFixedQuestions(detail.fixed_questions)}</p>
                        </article>
                        <article className="ui-admin-mini-item">
                          <strong>抽题规则</strong>
                          <p>{formatPaperRules(detail.paper_rules ?? [])}</p>
                        </article>
                      </div>
                    </>
                  ) : null}
                  {!detailLoading && !detail ? <div className="ui-admin-empty-inline">考试详情暂无数据</div> : null}
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate("/admin/exams/assembly")}>
                      进入试卷管理
                    </button>
                    {detail?.status === "draft" ? (
                      <button type="button" className="ui-button ui-button--ghost" onClick={() => void handlePublish(detail.id)}>
                        发布考试
                      </button>
                    ) : null}
                    {detail ? (
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
                    <h3>{modal.type === "create" ? "新增考试" : "编辑考试"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    {detailLoading ? <div className="ui-admin-empty-inline">考试草稿加载中...</div> : null}
                    <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                      <div className="ui-admin-form__field">
                        <label htmlFor="exam_name">考试名称</label>
                        <input
                          id="exam_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="exam_mode">组卷方式</label>
                        <select
                          id="exam_mode"
                          value={form.exam_mode}
                          onChange={(event) => setForm((current) => ({ ...current, exam_mode: event.target.value }))}
                        >
                          <option value="paper">选择已有试卷</option>
                          <option value="fixed">固定试卷</option>
                          <option value="random_assembly">现场随机组卷</option>
                        </select>
                      </div>
                      {form.exam_mode === "paper" ? (
                        <div className="ui-admin-form__field">
                          <label htmlFor="exam_paper_id">选择试卷</label>
                          <select
                            id="exam_paper_id"
                            value={form.paper_id}
                            onChange={(event) => setForm((current) => ({ ...current, paper_id: event.target.value }))}
                          >
                            <option value="">请选择已发布试卷</option>
                            {papers.map((paper) => (
                              <option key={paper.id} value={paper.id}>
                                {paper.paper_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <div className="ui-admin-form__field">
                        <label htmlFor="exam_duration">考试时长</label>
                        <input
                          id="exam_duration"
                          inputMode="numeric"
                          value={form.duration_minutes}
                          onChange={(event) => setForm((current) => ({ ...current, duration_minutes: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="exam_start_time">开始时间</label>
                        <input
                          id="exam_start_time"
                          type="datetime-local"
                          value={form.start_time}
                          onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="exam_end_time">结束时间</label>
                        <input
                          id="exam_end_time"
                          type="datetime-local"
                          value={form.end_time}
                          onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="exam_targets">发布范围</label>
                        <textarea
                          id="exam_targets"
                          placeholder="class:301 或 course:10"
                          value={form.targets_text}
                          onChange={(event) => setForm((current) => ({ ...current, targets_text: event.target.value }))}
                        />
                      </div>
                      {form.exam_mode === "paper" ? (
                        <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="exam_selected_paper">试卷说明</label>
                          <input id="exam_selected_paper" value={formatSelectedPaperSummary(form.paper_id, papers)} readOnly />
                        </div>
                      ) : form.exam_mode === "fixed" ? (
                        <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="exam_fixed_questions">固定题目</label>
                          <textarea
                            id="exam_fixed_questions"
                            placeholder="question_id:version_id:score:order"
                            value={form.fixed_questions_text}
                            onChange={(event) => setForm((current) => ({ ...current, fixed_questions_text: event.target.value }))}
                          />
                        </div>
                      ) : (
                        <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="exam_paper_rules">抽题规则</label>
                          <textarea
                            id="exam_paper_rules"
                            placeholder="type:score:count:bank_id"
                            value={form.paper_rules_text}
                            onChange={(event) => setForm((current) => ({ ...current, paper_rules_text: event.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary" disabled={detailLoading}>
                      {modal.type === "create" ? "新增考试" : "保存修改"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildExamQuery(
  keyword: string,
  status: string,
  targetType: string,
  targetID: string,
  page: number,
  pageSize: number
): ExamListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    target_type: targetType || undefined,
    target_id: targetID ? Number(targetID) : undefined,
    page,
    page_size: pageSize
  };
}

function buildExamPayload(form: ExamFormState): ExamInput | string {
  const name = form.name.trim();
  const durationMinutes = parsePositiveInteger(form.duration_minutes);
  const targets = parseTargets(form.targets_text);

  if (!name) {
    return "请填写考试名称。";
  }
  if (!form.start_time || !form.end_time) {
    return "请填写考试开始和结束时间。";
  }
  if (!durationMinutes) {
    return "请填写有效的考试时长。";
  }
  if (targets.length === 0) {
    return "请填写发布范围。";
  }

  const base = {
    name,
    exam_mode: form.exam_mode,
    paper_id: form.exam_mode === "paper" && form.paper_id ? Number(form.paper_id) : undefined,
    start_time: toApiDateTime(form.start_time),
    end_time: toApiDateTime(form.end_time),
    duration_minutes: durationMinutes,
    targets
  };

  if (form.exam_mode === "paper") {
    if (!form.paper_id) {
      return "请选择已存在的试卷。";
    }
    return {
      ...base,
      fixed_questions: [],
      paper_rules: []
    };
  }

  if (form.exam_mode === "fixed") {
    const fixedQuestions = parseFixedQuestions(form.fixed_questions_text);
    if (fixedQuestions.length === 0) {
      return "请填写固定题目。";
    }
    return {
      ...base,
      fixed_questions: fixedQuestions,
      paper_rules: []
    };
  }

  const paperRules = parsePaperRules(form.paper_rules_text);
  if (paperRules.length === 0) {
    return "请填写抽题规则。";
  }
  return {
    ...base,
    fixed_questions: [],
    paper_rules: paperRules
  };
}

function buildFormFromDetail(detail: ExamDetail): ExamFormState {
  return {
    name: detail.name,
    exam_mode: detail.exam_mode,
    paper_id: detail.paper_id ? String(detail.paper_id) : "",
    start_time: toDateTimeLocalValue(detail.start_time),
    end_time: toDateTimeLocalValue(detail.end_time),
    duration_minutes: String(detail.duration_minutes ?? 60),
    targets_text: detail.targets.map((item) => `${item.target_type}:${item.target_id}`).join("\n"),
    fixed_questions_text: (detail.fixed_questions ?? [])
      .slice()
      .sort((left, right) => left.display_order - right.display_order)
      .map((item) => `${item.question_id}:${item.question_version_id}:${formatScore(item.score)}:${item.display_order}`)
      .join("\n"),
    paper_rules_text: (detail.paper_rules ?? [])
      .map((item) =>
        [item.question_type, formatScore(item.score_per_question), item.question_count, item.bank_ids?.join("|") ?? "", item.course_id ?? ""].join(":")
      )
      .join("\n")
  };
}

function parseTargets(value: string): ExamInput["targets"] {
  return value
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [targetType, targetID] = line.split(":").map((part) => part.trim());
      return {
        target_type: targetType,
        target_id: Number(targetID)
      };
    })
    .filter((item) => item.target_type && Number.isFinite(item.target_id) && item.target_id > 0);
}

function parseFixedQuestions(value: string): ExamFixedQuestion[] {
  return value
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [questionID, questionVersionID, score, displayOrder] = line.split(":").map((part) => part.trim());
      return {
        question_id: Number(questionID),
        question_version_id: Number(questionVersionID),
        score: Number(score),
        display_order: Number(displayOrder)
      };
    })
    .filter(
      (item) =>
        Number.isFinite(item.question_id) &&
        Number.isFinite(item.question_version_id) &&
        Number.isFinite(item.score) &&
        Number.isFinite(item.display_order) &&
        item.question_id > 0 &&
        item.question_version_id > 0 &&
        item.score > 0 &&
        item.display_order > 0
    );
}

function parsePaperRules(value: string): ExamPaperRule[] {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [questionType, scorePerQuestion, questionCount, bankIDText, courseIDText] = line.split(":").map((part) => part.trim());
      const bankIDs = bankIDText
        ? bankIDText
            .split("|")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isFinite(item) && item > 0)
        : [];
      return {
        question_type: questionType,
        score_per_question: Number(scorePerQuestion),
        question_count: Number(questionCount),
        bank_ids: bankIDs,
        course_id: parsePositiveInteger(courseIDText ?? "") ?? undefined
      };
    })
    .filter(
      (item) =>
        item.question_type &&
        Number.isFinite(item.score_per_question) &&
        Number.isFinite(item.question_count) &&
        item.score_per_question > 0 &&
        item.question_count > 0
    );
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function toApiDateTime(value: string): string {
  return new Date(value).toISOString();
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function emptySummary(exam: ExamDetail): ExamOverviewSummary {
  return {
    exam_id: exam.id,
    exam_name: exam.name,
    exam_mode: exam.exam_mode,
    status: exam.status,
    start_time: exam.start_time,
    end_time: exam.end_time,
    duration_minutes: exam.duration_minutes ?? 0,
    total_score: 0,
    student_count: 0,
    participated_student_count: 0,
    submitted_count: 0,
    in_progress_count: 0,
    absent_count: 0,
    average_score: 0,
    highest_score: 0,
    lowest_score: 0
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "考试列表接口暂不可用，请检查后端 /api/v1/exams 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "考试请求参数错误，请检查时间、发布范围或组卷规则。";
  }
  return message || "考试数据加载失败";
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

function formatExamMode(value: string): string {
  if (value === "paper") {
    return "已有试卷";
  }
  if (value === "random_assembly") {
    return "现场随机组卷";
  }
  return "固定试卷";
}

function formatPaperName(paperID: number | null | undefined, papers: ExamPaper[]): string {
  if (!paperID) {
    return "未选择试卷";
  }
  return papers.find((paper) => paper.id === paperID)?.paper_name ?? `试卷-${paperID}`;
}

function formatSelectedPaperSummary(paperID: string, papers: ExamPaper[]): string {
  if (!paperID) {
    return "未选择试卷";
  }
  const paper = papers.find((item) => item.id === Number(paperID));
  if (!paper) {
    return `试卷-${paperID}`;
  }
  return `${paper.paper_name} / ${paper.question_count} 题 / ${formatScore(paper.total_score)} 分`;
}

function formatExamStatus(value: string): string {
  switch (value) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    case "closed":
      return "已结束";
    default:
      return value;
  }
}

function formatTargets(targets: ExamTarget[]): string {
  return targets.map((item) => `${formatTargetType(item.target_type)}:${item.target_id}`).join("、") || "未设置";
}

function formatTargetType(targetType: string): string {
  switch (targetType) {
    case "class":
      return "班级";
    case "course":
      return "课程";
    case "user":
      return "用户";
    default:
      return targetType;
  }
}

function formatFixedQuestions(items: ExamFixedQuestion[]): string {
  if (!items || items.length === 0) {
    return "暂无固定题目";
  }
  return items
    .slice()
    .sort((left, right) => left.display_order - right.display_order)
    .map((item) => `第 ${item.display_order} 题：题目 ${item.question_id} / ${formatScore(item.score)} 分`)
    .join("；");
}

function formatPaperRules(items: ExamPaperRule[]): string {
  if (!items || items.length === 0) {
    return "暂无抽题规则";
  }
  return items
    .map((item, index) => `规则 ${index + 1}：${item.question_type} × ${item.question_count}，每题 ${formatScore(item.score_per_question)} 分`)
    .join("；");
}

function formatScore(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function statusClassName(value?: string | null): string {
  switch (value) {
    case "active":
    case "published":
    case "reviewed":
    case "submitted":
      return "ui-admin-status ui-admin-status--active";
    case "draft":
    case "pending":
    case "in_progress":
      return "ui-admin-status ui-admin-status--pending";
    case "closed":
    case "inactive":
      return "ui-admin-status ui-admin-status--inactive";
    case "rejected":
      return "ui-admin-status ui-admin-status--danger";
    default:
      return "ui-admin-status ui-admin-status--draft";
  }
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
  gridTemplateColumns: "minmax(200px, 300px) minmax(160px, 220px) minmax(180px, 240px) minmax(160px, 220px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
