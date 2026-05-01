import { useEffect, useState, type FormEvent } from "react";

import type {
  NextPracticeQuestionResult,
  PracticeAnswerInput,
  PracticeAnswerResult,
  PracticeSessionDetail,
  PracticeSessionInput,
  PracticeSessionSummary,
  UserQuestionState,
  UserQuestionStateListQuery
} from "@aios/api-sdk";

import { buildQuestionFeedbackPath } from "./question-feedback-page";

export interface PracticePanelApi {
  createPracticeSession(body: PracticeSessionInput): Promise<PracticeSessionDetail>;
  getPracticeSession(id: number): Promise<PracticeSessionDetail>;
  nextPracticeQuestion(id: number): Promise<NextPracticeQuestionResult>;
  submitPracticeAnswer(id: number, body: PracticeAnswerInput): Promise<PracticeAnswerResult>;
  finishPracticeSession(id: number): Promise<PracticeSessionSummary>;
  markPracticeQuestionMastered(id: number, body: { value: boolean }): Promise<UserQuestionState>;
  markPracticeQuestionConfused(id: number, body: { value: boolean }): Promise<UserQuestionState>;
  listUserQuestionStates(query?: UserQuestionStateListQuery): Promise<{ items: UserQuestionState[]; page: number; page_size: number; total: number }>;
}

interface PracticePanelProps {
  api: PracticePanelApi;
  initialSession?: PracticeSessionDetail | null;
  onInitialSessionConsumed?: () => void;
  onFinished?: (summary: PracticeSessionSummary) => void;
  onNavigate?: (path: string) => void;
}

const defaultForm = {
  sourceMode: "bank",
  bankIds: "",
  courseId: "",
  flowMode: "fixed_count",
  practiceMode: "random",
  questionCount: "10",
  excludeMastered: true
};

export function PracticePanel({ api, initialSession, onInitialSessionConsumed, onFinished, onNavigate }: PracticePanelProps) {
  const [form, setForm] = useState(defaultForm);
  const [session, setSession] = useState<PracticeSessionDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string[]>>({});
  const [result, setResult] = useState<PracticeAnswerResult | null>(null);
  const [questionState, setQuestionState] = useState<UserQuestionState | null>(null);
  const [answering, setAnswering] = useState(false);
  const [answerMessage, setAnswerMessage] = useState("");
  const currentQuestion = session?.questions[currentIndex] ?? null;

  useEffect(() => {
    if (!initialSession) {
      return;
    }
    setSession(initialSession);
    setCurrentIndex(0);
    setSelectedKeys([]);
    setDraftAnswers({});
    setResult(null);
    setQuestionState(null);
    setAnswering(false);
    setAnswerMessage("");
    setForm((current) => ({
      ...current,
      flowMode: initialSession.flow_mode,
      practiceMode: initialSession.practice_mode,
      sourceMode: initialSession.source_mode === "course" ? "course" : "bank",
      questionCount: String(initialSession.question_count ?? current.questionCount),
      excludeMastered: initialSession.exclude_mastered,
      courseId: initialSession.course_id ? String(initialSession.course_id) : current.courseId
    }));
    onInitialSessionConsumed?.();
  }, [initialSession, onInitialSessionConsumed]);

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const courseId = parsePositiveNumber(form.courseId);
    const bankIds = parseBankIDs(form.bankIds);
    const created = await api.createPracticeSession({
      practice_mode: form.practiceMode,
      source_mode: form.sourceMode === "course" ? "course" : bankIds.length > 1 ? "multi_bank" : "single_bank",
      flow_mode: form.flowMode,
      course_id: form.sourceMode === "course" ? courseId : undefined,
      bank_ids: form.sourceMode === "course" ? [] : bankIds,
      exclude_mastered: form.excludeMastered,
      question_count: form.flowMode === "fixed_count" ? parsePositiveNumber(form.questionCount) ?? 10 : undefined
    });
    setSession(created);
    setCurrentIndex(0);
    setSelectedKeys([]);
    setDraftAnswers({});
    setResult(null);
    setQuestionState(null);
    setAnswering(false);
    setAnswerMessage("");
  }

  async function handleSubmit() {
    if (!session || !currentQuestion) {
      return;
    }
    if (currentQuestion.answered) {
      setAnswerMessage("本题已提交，请进入下一题。");
      return;
    }
    if (selectedKeys.length === 0) {
      setAnswerMessage("请先选择答案。");
      return;
    }

    setAnswering(true);
    setAnswerMessage("");
    try {
      const answered = await api.submitPracticeAnswer(session.id, {
        session_question_id: currentQuestion.session_question_id,
        answer: buildAnswerPayload(currentQuestion, selectedKeys)
      });
      setResult(answered);
      setQuestionState(answered.state);
      setSession((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((question) =>
                question.session_question_id === currentQuestion.session_question_id
                  ? { ...question, answered: true, is_correct: answered.is_correct }
                  : question
              )
            }
          : current
      );
    } catch {
      setAnswerMessage("答案提交失败，请稍后重试。");
    } finally {
      setAnswering(false);
    }
  }

  async function handleNext() {
    if (!session) {
      return;
    }
    if (form.flowMode === "continuous" && currentIndex >= session.questions.length - 1) {
      const next = await api.nextPracticeQuestion(session.id);
      setSession((current) =>
        current
          ? {
              ...current,
              questions: [...current.questions, next.question]
            }
          : current
      );
      setCurrentIndex((current) => current + 1);
      setSelectedKeys([]);
    } else {
      moveToQuestion(currentIndex + 1);
      return;
    }
    setResult(null);
    setQuestionState(null);
    setAnswerMessage("");
  }

  function moveToQuestion(nextIndex: number) {
    if (!session) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(nextIndex, session.questions.length - 1));
    const nextQuestion = session.questions[boundedIndex];
    setCurrentIndex(boundedIndex);
    setSelectedKeys(nextQuestion ? draftAnswers[nextQuestion.session_question_id] ?? [] : []);
    setResult(null);
    setQuestionState(null);
    setAnswerMessage("");
  }

  async function handleFinish() {
    if (!session) {
      return;
    }
    const summary = await api.finishPracticeSession(session.id);
    onFinished?.(summary);
    setSession(null);
    setCurrentIndex(0);
    setSelectedKeys([]);
    setDraftAnswers({});
    setResult(null);
    setQuestionState(null);
    setAnswering(false);
    setAnswerMessage("");
  }

  async function handleMarkMastered(value: boolean) {
    if (!currentQuestion) {
      return;
    }
    const state = await api.markPracticeQuestionMastered(currentQuestion.question_id, { value });
    setQuestionState(state);
  }

  async function handleMarkConfused(value: boolean) {
    if (!currentQuestion) {
      return;
    }
    const state = await api.markPracticeQuestionConfused(currentQuestion.question_id, { value });
    setQuestionState(state);
  }

  function toggleKey(key: string) {
    if (!currentQuestion) {
      return;
    }
    setSelectedKeys((current) => {
      const next = toggleOptionSelection(current, key, currentQuestion.question_type);
      setAnswerMessage("");
      setDraftAnswers((answers) => ({
        ...answers,
        [currentQuestion.session_question_id]: next
      }));
      return next;
    });
  }

  useEffect(() => {
    if (!session || !currentQuestion) {
      return;
    }
    const activeSession = session;
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
        if (result) {
          void handleNext();
        } else {
          void handleSubmit();
        }
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        if (currentIndex < activeSession.questions.length - 1) {
          event.preventDefault();
          moveToQuestion(currentIndex + 1);
        }
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        if (currentIndex > 0) {
          event.preventDefault();
          moveToQuestion(currentIndex - 1);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentQuestion, currentIndex, draftAnswers, result, selectedKeys, session]);

  function handleQuestionFeedback() {
    if (!currentQuestion) {
      return;
    }
    onNavigate?.(
      buildQuestionFeedbackPath({
        question_id: currentQuestion.question_id,
        question_version_id: currentQuestion.question_version_id,
        question_type: currentQuestion.question_type,
        stem: questionText(currentQuestion.content),
        from: "/app/practice"
      })
    );
  }

  return (
    <section aria-label="练题中心面板" className="ui-admin-page ui-user-page ui-practice-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">练题中心</span>
            <h2>练题中心</h2>
          </div>
        </div>
      </section>

      <section className="ui-admin-card ui-practice-setup-card">
        <div className="ui-admin-card__header">
          <div>
            <h3>开始练题</h3>
            <p className="ui-admin-subtle">选择来源、流转方式和题量后开始本轮练习。</p>
          </div>
        </div>

        <form className="ui-admin-form__grid ui-admin-form__grid--wide ui-practice-form" onSubmit={(event) => void handleStart(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="practice_source_mode">练题来源</label>
            <select
              id="practice_source_mode"
              value={form.sourceMode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sourceMode: event.target.value,
                  bankIds: "",
                  courseId: ""
                }))
              }
            >
              <option value="bank">题库</option>
              <option value="course">课程</option>
            </select>
          </div>

          {form.sourceMode === "course" ? (
            <div className="ui-admin-form__field">
              <label htmlFor="practice_course_id">课程ID</label>
              <input
                id="practice_course_id"
                inputMode="numeric"
                value={form.courseId}
                onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))}
              />
            </div>
          ) : (
            <div className="ui-admin-form__field">
              <label htmlFor="practice_bank_ids">题库ID</label>
              <input
                id="practice_bank_ids"
                value={form.bankIds}
                onChange={(event) => setForm((current) => ({ ...current, bankIds: event.target.value }))}
              />
            </div>
          )}

          <div className="ui-admin-form__field">
            <label htmlFor="practice_flow_mode">练题流</label>
            <select
              id="practice_flow_mode"
              value={form.flowMode}
              onChange={(event) => setForm((current) => ({ ...current, flowMode: event.target.value }))}
            >
              <option value="fixed_count">固定题量</option>
              <option value="continuous">连续练题</option>
            </select>
          </div>

          <div className="ui-admin-form__field">
            <label htmlFor="practice_mode">练题模式</label>
            <select
              id="practice_mode"
              value={form.practiceMode}
              onChange={(event) => setForm((current) => ({ ...current, practiceMode: event.target.value }))}
            >
              <option value="random">随机</option>
              <option value="sequential">顺序</option>
            </select>
          </div>

          {form.flowMode === "fixed_count" ? (
            <div className="ui-admin-form__field">
              <label htmlFor="practice_question_count">题量</label>
              <input
                id="practice_question_count"
                inputMode="numeric"
                value={form.questionCount}
                onChange={(event) => setForm((current) => ({ ...current, questionCount: event.target.value }))}
              />
            </div>
          ) : null}

          <div className="ui-practice-form__footer">
            <label className="ui-inline-checkbox">
              <input
                type="checkbox"
                checked={form.excludeMastered}
                onChange={(event) => setForm((current) => ({ ...current, excludeMastered: event.target.checked }))}
              />
              <span>排除熟题</span>
            </label>
            <button type="submit" className="ui-button ui-button--primary">
              开始练题
            </button>
          </div>
        </form>
      </section>

      {currentQuestion ? (
        <section aria-label="当前题目" className="ui-admin-card ui-practice-question-card">
          <div className="ui-admin-card__header">
            <div>
              <h3>{`第 ${currentIndex + 1} 题`}</h3>
              <p className="ui-admin-subtle">选择答案后提交，可继续标熟、标疑惑或进入互动反馈。</p>
            </div>
          </div>
          <p className="ui-practice-stem">{questionText(currentQuestion.content)}</p>
          <ul className="ui-practice-options">
            {questionOptions(currentQuestion).map((option) => (
              <li key={option.key}>
                <label className="ui-inline-checkbox" aria-label={`选项 ${option.key}`}>
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(option.key)}
                    disabled={currentQuestion.answered || answering}
                    onChange={() => toggleKey(option.key)}
                  />
                  <span>
                    {option.key}. {option.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="ui-admin-toolbar">
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => void handleSubmit()}
              disabled={currentQuestion.answered || answering}
            >
              {currentQuestion.answered ? "已提交" : answering ? "提交中..." : "提交答案"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleMarkMastered(!(questionState?.is_mastered ?? false))}>
              {questionState?.is_mastered ? "取消标熟" : "标熟"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleMarkConfused(!(questionState?.is_confused ?? false))}>
              {questionState?.is_confused ? "取消疑惑" : "标疑惑"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={handleQuestionFeedback}>
              评论与质疑
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleNext()}>
              下一题
            </button>
            <button type="button" className="ui-button" onClick={() => void handleFinish()}>
              退出练题
            </button>
          </div>
          {answerMessage ? <p className="ui-admin-inline-message">{answerMessage}</p> : null}
        </section>
      ) : null}

      {result ? <div className={result.is_correct ? "ui-status ui-status--success" : "ui-status ui-status--warning"}>{result.is_correct ? "回答正确" : "回答错误"}</div> : null}
      {questionState ? (
        <div className="ui-status ui-status--info">
          状态：{questionState.is_mastered ? "已标熟" : "未标熟"} / {questionState.is_confused ? "已标疑惑" : "未标疑惑"}
        </div>
      ) : null}
    </section>
  );
}

function parseBankIDs(value: string): number[] {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function parsePositiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function questionText(content: PracticeSessionDetail["questions"][number]["content"]): string {
  const stem = (content as { stem?: { text?: string } }).stem;
  return stem?.text ?? "";
}

function questionOptions(question: PracticeSessionDetail["questions"][number]): Array<{ key: string; text: string }> {
  const content = question.content as { options?: Array<{ key?: string; text?: string }> };
  const options = content.options ?? [];
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

function toggleOptionSelection(current: string[], key: string, questionType: string): string[] {
  if (current.includes(key)) {
    return current.filter((item) => item !== key);
  }
  if (isSingleSelectQuestion(questionType)) {
    return [key];
  }
  return [...current, key];
}

function buildAnswerPayload(question: PracticeSessionDetail["questions"][number], selectedKeys: string[]): Record<string, unknown> {
  if (question.question_type === "true_false") {
    return { value: selectedKeys[0] === "true" };
  }
  return { selected_keys: selectedKeys };
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
