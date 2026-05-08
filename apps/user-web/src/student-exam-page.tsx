import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Exam,
  ExamAttemptAnswer,
  ExamAttemptAnswerInput,
  ExamAttemptDetail,
  ExamAttemptQuestion,
  ExamAttemptResult,
  ExamDetail,
  ExamInput,
  ExamListQuery,
  PageResult
} from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import {
  QuestionContentBlockView,
  QuestionOptionBody,
  extractQuestionOptions,
  getOptionGroupBlock,
  getStemBlock,
  type RenderableOption
} from "./question-content-render";

export interface StudentExamApi {
  listExams(query?: ExamListQuery): Promise<PageResult<Exam>>;
  createExam(body: ExamInput): Promise<ExamDetail>;
  publishExam(examId: number): Promise<ExamDetail>;
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
const defaultSelfTestForm = {
  name: "",
  durationMinutes: "60",
  questionType: "single_choice",
  questionCount: "5",
  scorePerQuestion: "2",
  bankIds: ""
};

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
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string[]>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetID, setTargetID] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [detailExam, setDetailExam] = useState<Exam | null>(null);
  const [selfTestForm, setSelfTestForm] = useState(defaultSelfTestForm);
  const [selfTestSaving, setSelfTestSaving] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const autoSubmittedRef = useRef(false);
  const didLoadRef = useRef(false);

  const currentQuestion = attemptDetail?.questions[currentIndex] ?? null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const answeredDisplayOrders = useMemo(
    () => buildAnsweredDisplayOrders(attemptDetail?.answers ?? [], draftAnswers),
    [attemptDetail, draftAnswers]
  );
  const currentQuestionAnswerCount = answeredDisplayOrders.size;

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadExams(buildExamQuery("", "", "", "", 1, defaultPageSize), true);
  }, [api]);

  const submitCurrentAttempt = useCallback(
    async (requireConfirm: boolean) => {
      if (!attemptDetail || submitting) {
        return;
      }
      const unansweredQuestions = listUnansweredQuestions(attemptDetail.questions, answeredDisplayOrders);
      const confirmMessage =
        unansweredQuestions.length > 0
          ? `还有以下题目未作答：${unansweredQuestions.map((question) => `第 ${question.display_order} 题`).join("、")}。确认交卷吗？交卷后不能继续修改答案。`
          : "确认交卷吗？交卷后不能继续修改答案。";
      if (requireConfirm && !window.confirm(confirmMessage)) {
        return;
      }

      setSubmitting(true);
      setErrorMessage("");
      try {
        const savedDetail = await savePendingDraftAnswers(attemptDetail);
        const submitted = await api.submitExamAttempt(attemptDetail.attempt.id);
        setResult(submitted);
        setAttemptDetail(null);
        setActiveExam(null);
        setDraftAnswers({});
        setRemainingSeconds(null);
        clearExamRecovery();
        if (savedDetail) {
          setSelectedKeys([]);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "交卷失败，请检查网络后重试。");
      } finally {
        setSubmitting(false);
      }
    },
    [api, attemptDetail, submitting, answeredDisplayOrders, draftAnswers]
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

  useEffect(() => {
    if (!attemptDetail || !currentQuestion) {
      return;
    }
    const activeAttemptDetail = attemptDetail;
    const activeQuestion = currentQuestion;

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }

      const optionIndex = numberKeyIndex(event.key);
      if (optionIndex !== null) {
        const option = questionOptions(activeQuestion)[optionIndex];
        if (!option?.key) {
          return;
        }
        event.preventDefault();
        toggleKey(option.key);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (isCurrentAnswerSaved(activeAttemptDetail, activeQuestion, selectedKeys)) {
          handleMove(currentIndex + 1);
        } else {
          void handleSaveAnswer();
        }
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        handleMove(currentIndex + 1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        handleMove(currentIndex - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attemptDetail, currentQuestion, currentIndex, draftAnswers, selectedKeys]);

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
          setDraftAnswers(buildDraftAnswers(recovered.detail.answers));
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
    setStatus("");
    setTargetType("");
    setTargetID("");
    setSelectedIDs([]);
    await loadExams(buildExamQuery("", "", "", "", 1, defaultPageSize));
  }

  async function handleCreateSelfTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const questionCount = parsePositiveNumber(selfTestForm.questionCount);
    const scorePerQuestion = parsePositiveNumber(selfTestForm.scorePerQuestion);
    const durationMinutes = parsePositiveNumber(selfTestForm.durationMinutes);
    if (!questionCount || !scorePerQuestion || !durationMinutes) {
      setErrorMessage("请填写有效的自测题量、分值和时长。");
      return;
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const name = selfTestForm.name.trim() || `我的自测 ${formatDateTime(now.toISOString())}`;
    const payload: ExamInput = {
      name,
      exam_mode: "random_assembly",
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
      targets: [],
      fixed_questions: [],
      paper_rules: [
        {
          question_type: selfTestForm.questionType,
          score_per_question: scorePerQuestion,
          question_count: questionCount,
          bank_ids: parseNumberList(selfTestForm.bankIds)
        }
      ]
    };

    setSelfTestSaving(true);
    setErrorMessage("");
    setNoticeMessage("");
    try {
      const created = await api.createExam(payload);
      const published = await api.publishExam(created.id);
      setSelfTestForm(defaultSelfTestForm);
      setNoticeMessage(`自测考试已创建：${published.name}`);
      await loadExams(buildExamQuery(status, keyword, targetType, targetID, 1, pageSize));
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "自测考试创建失败，请稍后重试。");
    } finally {
      setSelfTestSaving(false);
    }
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
      setDraftAnswers(buildDraftAnswers(normalizedDetail.answers));
      setSelectedKeys(selectedKeysFor(normalizedDetail.answers, normalizedDetail.questions[0]?.display_order));
      saveExamRecovery(exam.id, normalizedDetail.attempt.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "进入考试失败，请稍后重试。");
    }
  }

  async function handleSaveAnswer(): Promise<boolean> {
    if (!attemptDetail || !currentQuestion) {
      return false;
    }
    setErrorMessage("");
    try {
      await api.saveExamAttemptAnswer(attemptDetail.attempt.id, {
        display_order: currentQuestion.display_order,
        answer: { selected_keys: selectedKeys }
      });
      setAttemptDetail((current) => mergeSavedAnswer(current, currentQuestion, selectedKeys));
      setDraftAnswers((current) => ({ ...current, [currentQuestion.display_order]: selectedKeys }));
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "答案保存失败，请重试。");
      return false;
    }
  }

  async function savePendingDraftAnswers(detail: ExamAttemptDetail): Promise<ExamAttemptDetail> {
    let nextDetail = detail;
    for (const question of detail.questions) {
      const selected = draftAnswers[question.display_order] ?? selectedKeysFor(nextDetail.answers, question.display_order);
      const saved = selectedKeysFor(nextDetail.answers, question.display_order);
      if (sameStringArray(selected, saved)) {
        continue;
      }
      await api.saveExamAttemptAnswer(detail.attempt.id, {
        display_order: question.display_order,
        answer: { selected_keys: selected }
      });
      nextDetail = mergeSavedAnswer(nextDetail, question, selected) ?? nextDetail;
    }
    setAttemptDetail(nextDetail);
    return nextDetail;
  }

  function handleMove(nextIndex: number) {
    if (!attemptDetail) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(nextIndex, attemptDetail.questions.length - 1));
    setCurrentIndex(boundedIndex);
    const displayOrder = attemptDetail.questions[boundedIndex]?.display_order;
    setSelectedKeys(displayOrder ? draftAnswers[displayOrder] ?? selectedKeysFor(attemptDetail.answers, displayOrder) : []);
    setErrorMessage("");
  }

  function toggleKey(key: string) {
    if (!currentQuestion) {
      return;
    }
    setSelectedKeys((current) => {
      const next = toggleOptionSelection(current, key, currentQuestion.question_type ?? "");
      setDraftAnswers((answers) => ({ ...answers, [currentQuestion.display_order]: next }));
      return next;
    });
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
      <h2 style={visuallyHiddenStyle}>考试中心</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="考试数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}
      {noticeMessage ? <ToastNotice tone="success" title="自测考试已就绪" description={noticeMessage} onClose={() => setNoticeMessage("")} /> : null}

      <section className="ui-admin-card" aria-label="学生自测创建区" style={selfTestCardStyle}>
        <div className="ui-admin-card__header">
          <div>
            <h3>创建自测考试</h3>
          </div>
        </div>
        <form className="ui-admin-form__grid ui-admin-form__grid--wide" onSubmit={(event) => void handleCreateSelfTest(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="student_self_exam_name">自测名称</label>
            <input
              id="student_self_exam_name"
              placeholder="留空自动生成"
              value={selfTestForm.name}
              onChange={(event) => setSelfTestForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_self_exam_question_type">题型</label>
            <select
              id="student_self_exam_question_type"
              value={selfTestForm.questionType}
              onChange={(event) => setSelfTestForm((current) => ({ ...current, questionType: event.target.value }))}
            >
              <option value="single_choice">单选题</option>
              <option value="multiple_choice">多选题</option>
              <option value="true_false">判断题</option>
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_self_exam_bank_ids">题库ID</label>
            <input
              id="student_self_exam_bank_ids"
              placeholder="可填多个，用英文逗号分隔"
              value={selfTestForm.bankIds}
              onChange={(event) => setSelfTestForm((current) => ({ ...current, bankIds: event.target.value }))}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_self_exam_question_count">题量</label>
            <input
              id="student_self_exam_question_count"
              inputMode="numeric"
              value={selfTestForm.questionCount}
              onChange={(event) => setSelfTestForm((current) => ({ ...current, questionCount: event.target.value }))}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_self_exam_score">每题分值</label>
            <input
              id="student_self_exam_score"
              inputMode="decimal"
              value={selfTestForm.scorePerQuestion}
              onChange={(event) => setSelfTestForm((current) => ({ ...current, scorePerQuestion: event.target.value }))}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="student_self_exam_duration">自测时长</label>
            <input
              id="student_self_exam_duration"
              inputMode="numeric"
              value={selfTestForm.durationMinutes}
              onChange={(event) => setSelfTestForm((current) => ({ ...current, durationMinutes: event.target.value }))}
            />
          </div>
          <div className="ui-admin-actions-bar__group" style={selfTestActionStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={selfTestSaving}>
              {selfTestSaving ? "创建中..." : "创建自测"}
            </button>
          </div>
        </form>
      </section>

      <section className="ui-admin-card" aria-label="考试数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="student_exam_keyword" label="关键字" placeholder="输入考试名称" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="student_exam_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="published">已发布</option>
              <option value="draft">草稿</option>
              <option value="closed">已结束</option>
          </ClearableFilterSelect>
          <ClearableFilterSelect id="student_exam_target_type" label="对象" placeholder="请选择对象" value={targetType} onChange={setTargetType}>
              <option value="class">班级</option>
              <option value="course">课程</option>
              <option value="user">用户</option>
          </ClearableFilterSelect>
          <ClearableFilterInput id="student_exam_target_id" label="对象编号" inputMode="numeric" placeholder="输入对象编号" value={targetID} onChange={setTargetID} />
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
                <section aria-label="考试题目序号面板" style={questionPanelStyle}>
                  <div style={questionPanelHeaderStyle}>
                    <strong>题目序号</strong>
                    <span>已答 {currentQuestionAnswerCount} / {attemptDetail.questions.length}</span>
                  </div>
                  <nav aria-label="考试题号导航" style={questionGridStyle}>
                    {attemptDetail.questions.map((question, index) => {
                      const answered = answeredDisplayOrders.has(question.display_order);
                      const current = index === currentIndex;
                      return (
                        <button
                          key={question.display_order}
                          type="button"
                          className="ui-button"
                          style={questionNumberButtonStyle(current, answered)}
                          aria-label={`第 ${question.display_order} 题，${answered ? "已作答" : "未作答"}`}
                          aria-pressed={current}
                          onClick={() => handleMove(index)}
                        >
                          {question.display_order}
                        </button>
                      );
                    })}
                  </nav>
                </section>
              ) : null}
              <section className="ui-admin-card" aria-label="当前题目">
                <div className="ui-admin-card__header">
                  <div>
                    <h3>{`${formatQuestionType(currentQuestion.question_type ?? "")} · ${currentQuestion.score} 分`}</h3>
                  </div>
                </div>
                <div className="ui-admin-subtle">
                  <QuestionContentBlockView block={getStemBlock(currentQuestion.content)} fallback="本题暂无题干文本。" />
                  <QuestionContentBlockView block={getOptionGroupBlock(currentQuestion.content)} compact />
                </div>
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
                      <QuestionOptionBody option={option} />
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

function parsePositiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNumberList(value: string): number[] | undefined {
  const items = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return items.length > 0 ? items : undefined;
}

function selectedKeysFor(answers: ExamAttemptAnswer[], displayOrder?: number): string[] {
  const answer = answers.find((item) => item.display_order === displayOrder)?.answer;
  const selected = answer?.selected_keys;
  return Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : [];
}

function buildDraftAnswers(answers: ExamAttemptAnswer[]): Record<number, string[]> {
  return answers.reduce<Record<number, string[]>>((result, answer) => {
    result[answer.display_order] = selectedKeysFor(answers, answer.display_order);
    return result;
  }, {});
}

function buildAnsweredDisplayOrders(answers: ExamAttemptAnswer[], draftAnswers: Record<number, string[]>): Set<number> {
  const merged = new Map<number, string[]>();
  answers.forEach((answer) => merged.set(answer.display_order, selectedKeysFor(answers, answer.display_order)));
  Object.entries(draftAnswers).forEach(([displayOrder, selected]) => {
    merged.set(Number(displayOrder), selected);
  });
  const result = new Set<number>();
  merged.forEach((selected, displayOrder) => {
    if (hasSelectedAnswer(selected)) {
      result.add(displayOrder);
    }
  });
  return result;
}

function listUnansweredQuestions(questions: ExamAttemptQuestion[], answeredDisplayOrders: Set<number>): ExamAttemptQuestion[] {
  return questions.filter((question) => !answeredDisplayOrders.has(question.display_order));
}

function isCurrentAnswerSaved(detail: ExamAttemptDetail, question: ExamAttemptQuestion, selectedKeys: string[]): boolean {
  return sameStringArray(selectedKeysFor(detail.answers, question.display_order), selectedKeys);
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalize = (values: string[]) => [...values].sort().join("\u0000");
  return normalize(left) === normalize(right);
}

function hasSelectedAnswer(selectedKeys: string[]): boolean {
  return selectedKeys.some((key) => key.trim() !== "");
}

function toggleOptionSelection(current: string[], key: string, questionType: string): string[] {
  if (current.includes(key)) {
    return current.filter((item) => item !== key);
  }
  if (isSingleSelectQuestion(questionType)) {
    return [key];
  }
  return [...current, key];
}

function isSingleSelectQuestion(questionType: string): boolean {
  return questionType === "single_choice" || questionType === "true_false";
}

function numberKeyIndex(key: string): number | null {
  if (!/^[1-9]$/.test(key)) {
    return null;
  }
  return Number(key) - 1;
}

function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
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

function questionOptions(question: ExamAttemptQuestion): RenderableOption[] {
  return extractQuestionOptions(question.content, question.question_type);
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

function questionNumberButtonStyle(current: boolean, answered: boolean): CSSProperties {
  return {
    width: 42,
    minWidth: 42,
    height: 36,
    padding: 0,
    borderRadius: 6,
    border: current ? "2px solid #1d4ed8" : answered ? "1px solid #16a34a" : "1px solid #cbd5e1",
    background: current ? "#dbeafe" : answered ? "#dcfce7" : "#f8fafc",
    color: current ? "#1d4ed8" : answered ? "#166534" : "#64748b",
    fontWeight: current ? 700 : 600
  };
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 14
};

const selfTestCardStyle: CSSProperties = {
  padding: 22
};

const selfTestActionStyle: CSSProperties = {
  alignItems: "end",
  paddingBottom: 1
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

const questionPanelStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 14
};

const questionPanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  color: "#475569"
};

const questionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(42px, 42px))",
  gap: 8,
  alignItems: "center"
};
