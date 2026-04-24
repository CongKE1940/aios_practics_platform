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
  const [result, setResult] = useState<PracticeAnswerResult | null>(null);
  const [questionState, setQuestionState] = useState<UserQuestionState | null>(null);
  const currentQuestion = session?.questions[currentIndex] ?? null;

  useEffect(() => {
    if (!initialSession) {
      return;
    }
    setSession(initialSession);
    setCurrentIndex(0);
    setSelectedKeys([]);
    setResult(null);
    setQuestionState(null);
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
    setResult(null);
    setQuestionState(null);
  }

  async function handleSubmit() {
    if (!session || !currentQuestion) {
      return;
    }
    const answered = await api.submitPracticeAnswer(session.id, {
      session_question_id: currentQuestion.session_question_id,
      answer: { selected_keys: selectedKeys }
    });
    setResult(answered);
    setQuestionState(answered.state);
  }

  async function handleNext() {
    if (!session) {
      return;
    }
    if (form.flowMode === "continuous") {
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
    } else {
      setCurrentIndex((current) => Math.min(current + 1, (session.questions.length || 1) - 1));
    }
    setSelectedKeys([]);
    setResult(null);
    setQuestionState(null);
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
    setResult(null);
    setQuestionState(null);
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
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

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
    <section aria-label="练题中心面板">
      <h2>练题中心</h2>

      <form onSubmit={(event) => void handleStart(event)}>
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
          <option value="bank">bank</option>
          <option value="course">course</option>
        </select>

        {form.sourceMode === "course" ? (
          <>
            <label htmlFor="practice_course_id">课程ID</label>
            <input
              id="practice_course_id"
              inputMode="numeric"
              value={form.courseId}
              onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))}
            />
          </>
        ) : (
          <>
            <label htmlFor="practice_bank_ids">题库ID</label>
            <input
              id="practice_bank_ids"
              value={form.bankIds}
              onChange={(event) => setForm((current) => ({ ...current, bankIds: event.target.value }))}
            />
          </>
        )}

        <label htmlFor="practice_flow_mode">练题流</label>
        <select
          id="practice_flow_mode"
          value={form.flowMode}
          onChange={(event) => setForm((current) => ({ ...current, flowMode: event.target.value }))}
        >
          <option value="fixed_count">fixed_count</option>
          <option value="continuous">continuous</option>
        </select>

        <label htmlFor="practice_mode">练题模式</label>
        <select
          id="practice_mode"
          value={form.practiceMode}
          onChange={(event) => setForm((current) => ({ ...current, practiceMode: event.target.value }))}
        >
          <option value="random">random</option>
          <option value="sequential">sequential</option>
        </select>

        {form.flowMode === "fixed_count" ? (
          <>
            <label htmlFor="practice_question_count">题量</label>
            <input
              id="practice_question_count"
              inputMode="numeric"
              value={form.questionCount}
              onChange={(event) => setForm((current) => ({ ...current, questionCount: event.target.value }))}
            />
          </>
        ) : null}

        <label>
          <input
            type="checkbox"
            checked={form.excludeMastered}
            onChange={(event) => setForm((current) => ({ ...current, excludeMastered: event.target.checked }))}
          />
          排除熟题
        </label>
        <button type="submit">开始练题</button>
      </form>

      {currentQuestion ? (
        <section aria-label="当前题目">
          <p>{questionText(currentQuestion.content)}</p>
          <ul>
            {questionOptions(currentQuestion).map((option) => (
              <li key={option.key}>
                <label aria-label={`选项 ${option.key}`}>
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(option.key)}
                    onChange={() => toggleKey(option.key)}
                  />
                  {option.key}. {option.text}
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void handleSubmit()}>
            提交答案
          </button>
          <button type="button" onClick={() => void handleMarkMastered(!(questionState?.is_mastered ?? false))}>
            {questionState?.is_mastered ? "取消标熟" : "标熟"}
          </button>
          <button type="button" onClick={() => void handleMarkConfused(!(questionState?.is_confused ?? false))}>
            {questionState?.is_confused ? "取消疑惑" : "标疑惑"}
          </button>
          <button type="button" onClick={handleQuestionFeedback}>
            评论与质疑
          </button>
          <button type="button" onClick={() => void handleNext()}>
            下一题
          </button>
          <button type="button" onClick={() => void handleFinish()}>
            退出练题
          </button>
        </section>
      ) : null}

      {result ? <p>{result.is_correct ? "回答正确" : "回答错误"}</p> : null}
      {questionState ? (
        <p>
          状态：{questionState.is_mastered ? "已标熟" : "未标熟"} / {questionState.is_confused ? "已标疑惑" : "未标疑惑"}
        </p>
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
