import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Exam,
  ExamAttemptAnswer,
  ExamAttemptAnswerInput,
  ExamAttemptDetail,
  ExamAttemptQuestion,
  ExamAttemptResult,
  ExamListQuery,
  PageResult
} from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

export interface StudentExamApi {
  listExams(query?: ExamListQuery): Promise<PageResult<Exam>>;
  startExamAttempt(examId: number): Promise<ExamAttemptDetail>;
  getExamAttempt(attemptId: number): Promise<ExamAttemptDetail>;
  saveExamAttemptAnswer(attemptId: number, body: ExamAttemptAnswerInput): Promise<ExamAttemptAnswer>;
  submitExamAttempt(attemptId: number): Promise<ExamAttemptResult>;
  getExamAttemptResult(attemptId: number): Promise<ExamAttemptResult>;
}

interface StudentExamPageProps {
  api: StudentExamApi;
}

const recoveryStorageKey = "aios.student_exam.recovery.v1";
const defaultPageSize = 10;

const columns: Array<FixedActionListColumn<Exam>> = [
  {
    key: "name",
    title: "考试名称",
    render: (exam) => exam.name
  },
  {
    key: "exam_mode",
    title: "考试类型",
    width: 130,
    render: (exam) => formatExamMode(exam.exam_mode)
  },
  {
    key: "status",
    title: "状态",
    width: 120,
    render: (exam) => <span className={examStatusClassName(exam.status)}>{formatExamStatus(exam.status)}</span>
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

export function StudentExamPage({ api }: StudentExamPageProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<ExamAttemptDetail | null>(null);
  const [result, setResult] = useState<ExamAttemptResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [status, setStatus] = useState("published");
  const [keyword, setKeyword] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetID, setTargetID] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [detailExam, setDetailExam] = useState<Exam | null>(null);
  const autoSubmittedRef = useRef(false);
  const didLoadRef = useRef(false);

  const currentQuestion = attemptDetail?.questions[currentIndex] ?? null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentQuestionAnswerCount = useMemo(() => attemptDetail?.answers.length ?? 0, [attemptDetail]);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadExams(buildExamQuery("published", "", "", "", 1, defaultPageSize), true);
  }, [api]);

  const submitCurrentAttempt = useCallback(
    async (requireConfirm: boolean) => {
      if (!attemptDetail || submitting) {
        return;
      }
      if (requireConfirm && !window.confirm("确认交卷吗？交卷后不能继续修改答案。")) {
        return;
      }

      setSubmitting(true);
      setErrorMessage("");
      try {
        const submitted = await api.submitExamAttempt(attemptDetail.attempt.id);
        setResult(submitted);
        setAttemptDetail(null);
        setActiveExam(null);
        setRemainingSeconds(null);
        clearExamRecovery();
      } catch (error) {
        setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "交卷失败，请检查网络后重试。");
      } finally {
        setSubmitting(false);
      }
    },
    [api, attemptDetail, submitting]
  );

  useEffect(() => {
    if (!attemptDetail || !activeExam) {
      setRemainingSeconds(null);
      return;
    }

    const currentAttemptDetail = attemptDetail;
    const currentActiveExam = activeExam;

    function refreshCountdown() {
      const next = calculateRemainingSeconds(currentAttemptDetail, currentActiveExam);
      setRemainingSeconds(next);
      if (next <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void submitCurrentAttempt(false);
      }
    }

    refreshCountdown();
    const timer = window.setInterval(refreshCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [activeExam, attemptDetail, submitCurrentAttempt]);

  useEffect(() => {
    if (!attemptDetail) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [attemptDetail]);

  async function loadExams(query: ExamListQuery = buildExamQuery(status, keyword, targetType, targetID, page, pageSize), restore = false) {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api.listExams(query);
      const items = data.items ?? [];
      setExams(items);
      setTotal(data.total);
      setPage(data.page || query.page || 1);
      setPageSize(data.page_size || query.page_size || defaultPageSize);

      if (restore) {
        const recovered = await restoreAttemptIfPossible(api, items);
        if (recovered) {
          autoSubmittedRef.current = false;
          setActiveExam(recovered.exam);
          setAttemptDetail(recovered.detail);
          setResult(null);
          setCurrentIndex(0);
          setSelectedKeys(selectedKeysFor(recovered.detail.answers, recovered.detail.questions[0]?.display_order));
        }
      }
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
    await loadExams(buildExamQuery(status, keyword, targetType, targetID, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("published");
    setTargetType("");
    setTargetID("");
    setSelectedIDs([]);
    await loadExams(buildExamQuery("published", "", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadExams(buildExamQuery(status, keyword, targetType, targetID, nextPage, pageSize));
  }

  async function handleStart(exam: Exam) {
    setErrorMessage("");
    try {
      const detail = await api.startExamAttempt(exam.id);
      const normalizedDetail = normalizeAttemptStartTime(detail);
      autoSubmittedRef.current = false;
      setActiveExam(exam);
      setAttemptDetail(normalizedDetail);
      setResult(null);
      setDetailExam(null);
      setCurrentIndex(0);
      setSelectedKeys(selectedKeysFor(normalizedDetail.answers, normalizedDetail.questions[0]?.display_order));
      saveExamRecovery(exam.id, normalizedDetail.attempt.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "进入考试失败，请稍后重试。");
    }
  }

  async function handleSaveAnswer() {
    if (!attemptDetail || !currentQuestion) {
      return;
    }
    setErrorMessage("");
    try {
      await api.saveExamAttemptAnswer(attemptDetail.attempt.id, {
        display_order: currentQuestion.display_order,
        answer: { selected_keys: selectedKeys }
      });
      setAttemptDetail((current) => mergeSavedAnswer(current, currentQuestion, selectedKeys));
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "答案保存失败，请重试。");
    }
  }

  function handleMove(nextIndex: number) {
    if (!attemptDetail) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(nextIndex, attemptDetail.questions.length - 1));
    setCurrentIndex(boundedIndex);
    setSelectedKeys(selectedKeysFor(attemptDetail.answers, attemptDetail.questions[boundedIndex]?.display_order));
    setErrorMessage("");
  }

  function toggleKey(key: string) {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function handleExport() {
    downloadCsv(
      "student_exams.csv",
      [
        { key: "name", title: "考试名称" },
        { key: "exam_mode_label", title: "考试类型" },
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

  return (
    <section aria-label="考试中心" className="ui-admin-page ui-user-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="考试数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="考试数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="student_exam_keyword">关键字 keyword</label>
            <input
              id="student_exam_keyword"
              placeholder="输入考试名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_exam_status">状态 status</label>
            <select id="student_exam_status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="published">已发布</option>
              <option value="draft">草稿</option>
              <option value="closed">已结束</option>
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_exam_target_type">对象 target_type</label>
            <select id="student_exam_target_type" value={targetType} onChange={(event) => setTargetType(event.target.value)}>
              <option value="">全部对象</option>
              <option value="class">班级</option>
              <option value="course">课程</option>
              <option value="user">用户</option>
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_exam_target_id">对象 ID target_id</label>
            <input
              id="student_exam_target_id"
              inputMode="numeric"
              placeholder="输入对象 ID"
              value={targetID}
              onChange={(event) => setTargetID(event.target.value)}
            />
          </div>
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
          onExport={handleExport}
          onDetail={(exam) => setDetailExam(exam)}
          onEdit={(exam) => void handleStart(exam)}
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
          editLabel="开始考试"
          rowCheckboxLabel={(exam) => `选择考试-${exam.name}`}
        />
      </section>

      {detailExam ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="考试详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>考试详情</h3>
                <p>{detailExam.name}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setDetailExam(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>考试名称</dt>
                  <dd>{detailExam.name}</dd>
                </div>
                <div>
                  <dt>考试类型</dt>
                  <dd>{formatExamMode(detailExam.exam_mode)}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{formatExamStatus(detailExam.status)}</dd>
                </div>
                <div>
                  <dt>考试时间</dt>
                  <dd>{`${formatDateTime(detailExam.start_time)} - ${formatDateTime(detailExam.end_time)}`}</dd>
                </div>
                <div>
                  <dt>考试时长</dt>
                  <dd>{detailExam.duration_minutes ?? 0} 分钟</dd>
                </div>
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => void handleStart(detailExam)}>
                开始考试
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {currentQuestion && attemptDetail && activeExam ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal ui-admin-modal--wide" aria-label="考试作答区">
            <div className="ui-admin-modal__header">
              <div>
                <h3>{activeExam.name}</h3>
                <p>
                  第 {currentIndex + 1} / {attemptDetail.questions.length} 题，已保存 {currentQuestionAnswerCount} 题
                </p>
              </div>
              {remainingSeconds !== null ? <span className="ui-admin-tag">剩余时间：{formatDuration(remainingSeconds)}</span> : null}
            </div>
            <div className="ui-admin-modal__body">
              {attemptDetail.questions.length > 1 ? (
                <nav className="ui-admin-actions-bar__group" aria-label="考试题号导航">
                  {attemptDetail.questions.map((question, index) => (
                    <button
                      key={question.display_order}
                      type="button"
                      className={index === currentIndex ? "ui-button ui-button--primary" : "ui-button ui-button--ghost"}
                      aria-pressed={index === currentIndex}
                      onClick={() => handleMove(index)}
                    >
                      第 {index + 1} 题
                    </button>
                  ))}
                </nav>
              ) : null}
              <section className="ui-admin-card" aria-label="当前题目">
                <div className="ui-admin-card__header">
                  <div>
                    <h3>{`${formatQuestionType(currentQuestion.question_type)} · ${currentQuestion.score} 分`}</h3>
                  </div>
                </div>
                <p className="ui-admin-subtle">{questionText(currentQuestion) || "本题暂无题干文本。"}</p>
                <div className="ui-admin-tree">
                  {questionOptions(currentQuestion).map((option) => (
                    <label key={option.key} className="ui-admin-tree__leaf" aria-label={`选项 ${option.key}`}>
                      <input
                        type="checkbox"
                        className="ui-admin-table__checkbox"
                        checked={selectedKeys.includes(option.key)}
                        onChange={() => toggleKey(option.key)}
                      />
                      <strong>{option.key}</strong>
                      <span>{option.text}</span>
                    </label>
                  ))}
                  {questionOptions(currentQuestion).length === 0 ? <div className="ui-admin-empty-inline">暂无选项数据</div> : null}
                </div>
              </section>
            </div>
            <div className="ui-admin-modal__footer">
              <div className="ui-admin-actions-bar__group">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleSaveAnswer()}>
                  保存答案
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  disabled={currentIndex === 0}
                  onClick={() => handleMove(currentIndex - 1)}
                >
                  上一题
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  disabled={currentIndex >= attemptDetail.questions.length - 1}
                  onClick={() => handleMove(currentIndex + 1)}
                >
                  下一题
                </button>
                <button type="button" className="ui-button ui-button--primary" disabled={submitting} onClick={() => void submitCurrentAttempt(true)}>
                  {submitting ? "交卷中..." : "交卷"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {attemptDetail && !currentQuestion ? (
        <ToastNotice tone="warning" title="考试暂无题目" description="本场考试暂无可作答题目，请联系老师。" />
      ) : null}

      {result ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="考试结果弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>考试结果</h3>
                <p>本次考试已交卷</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setResult(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>最终得分</dt>
                  <dd>{formatScore(result.final_score)}</dd>
                </div>
                <div>
                  <dt>客观题得分</dt>
                  <dd>{formatScore(result.objective_score)}</dd>
                </div>
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setResult(null)}>
                返回考试列表
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildExamQuery(
  status: string,
  keyword: string,
  targetType: string,
  targetID: string,
  page: number,
  pageSize: number
): ExamListQuery {
  return {
    status: status || undefined,
    keyword: keyword.trim() || undefined,
    target_type: targetType || undefined,
    target_id: targetID ? Number(targetID) : undefined,
    page,
    page_size: pageSize
  };
}

function selectedKeysFor(answers: ExamAttemptAnswer[], displayOrder?: number): string[] {
  const answer = answers.find((item) => item.display_order === displayOrder)?.answer;
  const selected = answer?.selected_keys;
  return Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : [];
}

async function restoreAttemptIfPossible(
  api: StudentExamApi,
  exams: Exam[]
): Promise<{ exam: Exam; detail: ExamAttemptDetail } | null> {
  const recovery = readExamRecovery();
  if (!recovery) {
    return null;
  }
  const exam = exams.find((item) => item.id === recovery.exam_id);
  if (!exam) {
    clearExamRecovery();
    return null;
  }
  try {
    const detail = await api.getExamAttempt(recovery.attempt_id);
    if (detail.attempt.status !== "in_progress") {
      clearExamRecovery();
      return null;
    }
    saveExamRecovery(exam.id, detail.attempt.id);
    return { exam, detail: normalizeAttemptStartTime(detail) };
  } catch {
    clearExamRecovery();
    return null;
  }
}

function normalizeAttemptStartTime(detail: ExamAttemptDetail): ExamAttemptDetail {
  if (detail.attempt.start_at) {
    return detail;
  }
  return {
    ...detail,
    attempt: {
      ...detail.attempt,
      start_at: new Date().toISOString()
    }
  };
}

function readExamRecovery(): { exam_id: number; attempt_id: number } | null {
  try {
    const raw = window.localStorage.getItem(recoveryStorageKey);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as { exam_id?: unknown; attempt_id?: unknown };
    if (typeof value.exam_id !== "number" || typeof value.attempt_id !== "number") {
      clearExamRecovery();
      return null;
    }
    return { exam_id: value.exam_id, attempt_id: value.attempt_id };
  } catch {
    clearExamRecovery();
    return null;
  }
}

function saveExamRecovery(examId: number, attemptId: number) {
  try {
    window.localStorage.setItem(recoveryStorageKey, JSON.stringify({ exam_id: examId, attempt_id: attemptId }));
  } catch {
    // 本地存储不可用时不阻断考试主流程。
  }
}

function clearExamRecovery() {
  try {
    window.localStorage.removeItem(recoveryStorageKey);
  } catch {
    // 本地存储不可用时无需额外处理。
  }
}

function calculateRemainingSeconds(attemptDetail: ExamAttemptDetail, exam: Exam): number {
  const durationMinutes = exam.duration_minutes ?? 0;
  if (durationMinutes <= 0) {
    return 0;
  }

  const startAt = attemptDetail.attempt.start_at ? Date.parse(attemptDetail.attempt.start_at) : Date.now();
  if (!Number.isFinite(startAt)) {
    return 0;
  }

  const deadline = startAt + durationMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function mergeSavedAnswer(
  detail: ExamAttemptDetail | null,
  question: ExamAttemptQuestion,
  selectedKeys: string[]
): ExamAttemptDetail | null {
  if (!detail) {
    return detail;
  }

  const nextAnswer: ExamAttemptAnswer = {
    attempt_id: detail.attempt.id,
    question_id: question.question_id,
    question_version_id: question.question_version_id,
    display_order: question.display_order,
    answer: { selected_keys: selectedKeys },
    score: 0
  };
  const answers = detail.answers.filter((item) => item.display_order !== question.display_order);
  return { ...detail, answers: [...answers, nextAnswer] };
}

function questionText(question: ExamAttemptQuestion): string {
  const stem = (question.content as { stem?: { text?: string } } | undefined)?.stem;
  return stem?.text ?? "";
}

function questionOptions(question: ExamAttemptQuestion): Array<{ key: string; text: string }> {
  const content = question.content as { options?: Array<{ key?: string; text?: string }> } | undefined;
  const options = content?.options ?? [];
  if (options.length > 0) {
    return options.map((option) => ({
      key: option.key ?? "",
      text: option.text ?? ""
    }));
  }
  if (question.question_type === "true_false") {
    return [
      { key: "true", text: "正确" },
      { key: "false", text: "错误" }
    ];
  }
  return [];
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found|资源不存在/i.test(message)) {
    return "考试接口暂不可用或考试不存在，请检查后端 /api/v1/exams 服务。";
  }
  if (/403|forbidden|无权限访问/i.test(message)) {
    return "当前账号无权访问该考试。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "考试请求参数错误，请检查状态、对象或作答内容。";
  }
  return message || "考试数据加载失败";
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
      return questionType || "题目";
  }
}

function formatExamMode(value: string): string {
  if (value === "random_assembly") {
    return "随机组卷";
  }
  return "固定试卷";
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
      return value || "-";
  }
}

function examStatusClassName(value?: string | null): string {
  switch (value) {
    case "published":
      return "ui-admin-status ui-admin-status--active";
    case "draft":
      return "ui-admin-status ui-admin-status--draft";
    case "closed":
      return "ui-admin-status ui-admin-status--disabled";
    default:
      return "ui-admin-status ui-admin-status--draft";
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function formatScore(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function downloadCsv<TRecord extends Record<string, unknown>>(
  filename: string,
  columns: Array<{ key: keyof TRecord; title: string }>,
  rows: TRecord[]
) {
  const header = columns.map((column) => escapeCsvValue(column.title)).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(String(row[column.key] ?? ""))).join(","))
    .join("\n");
  const content = [header, body].filter(Boolean).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string): string {
  if ([",", "\"", "\n"].some((token) => value.includes(token))) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
  gridTemplateColumns: "minmax(180px, 260px) minmax(160px, 220px) minmax(160px, 220px) minmax(150px, 210px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
