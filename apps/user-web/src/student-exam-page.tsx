import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Exam,
  ExamAttemptAnswer,
  ExamAttemptAnswerInput,
  ExamAttemptDetail,
  ExamAttemptQuestion,
  ExamAttemptResult,
  PageResult
} from "@aios/api-sdk";

export interface StudentExamApi {
  listExams(query?: { page?: number; page_size?: number; status?: string }): Promise<PageResult<Exam>>;
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
  const [message, setMessage] = useState("正在加载考试...");
  const autoSubmittedRef = useRef(false);

  const currentQuestion = attemptDetail?.questions[currentIndex] ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("正在加载考试...");

    void api
      .listExams({ page: 1, page_size: 20, status: "published" })
      .then(async (data) => {
        if (!active) {
          return;
        }
        const items = data.items ?? [];
        setExams(items);
        const recovered = await restoreAttemptIfPossible(api, items);
        if (!active) {
          return;
        }
        if (recovered) {
          autoSubmittedRef.current = false;
          setActiveExam(recovered.exam);
          setAttemptDetail(recovered.detail);
          setResult(null);
          setCurrentIndex(0);
          setSelectedKeys(selectedKeysFor(recovered.detail.answers, recovered.detail.questions[0]?.display_order));
          setMessage("已恢复未完成考试。");
          return;
        }
        setMessage(items.length > 0 ? "" : "暂无可参加考试。");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setExams([]);
        setMessage("考试加载失败，请稍后重试。");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
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
      try {
        const submitted = await api.submitExamAttempt(attemptDetail.attempt.id);
        setResult(submitted);
        setAttemptDetail(null);
        setActiveExam(null);
        setRemainingSeconds(null);
        clearExamRecovery();
        setMessage("");
      } catch {
        setMessage("交卷失败，请检查网络后重试。");
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

  async function handleStart(exam: Exam) {
    setMessage("正在进入考试...");
    try {
      const detail = await api.startExamAttempt(exam.id);
      const normalizedDetail = normalizeAttemptStartTime(detail);
      autoSubmittedRef.current = false;
      setActiveExam(exam);
      setAttemptDetail(normalizedDetail);
      setResult(null);
      setCurrentIndex(0);
      setSelectedKeys(selectedKeysFor(normalizedDetail.answers, normalizedDetail.questions[0]?.display_order));
      saveExamRecovery(exam.id, normalizedDetail.attempt.id);
      setMessage("");
    } catch {
      setMessage("进入考试失败，请稍后重试。");
    }
  }

  async function handleSaveAnswer() {
    if (!attemptDetail || !currentQuestion) {
      return;
    }
    try {
      await api.saveExamAttemptAnswer(attemptDetail.attempt.id, {
        display_order: currentQuestion.display_order,
        answer: { selected_keys: selectedKeys }
      });
      setAttemptDetail((current) => mergeSavedAnswer(current, currentQuestion, selectedKeys));
      setMessage("答案已保存。");
    } catch {
      setMessage("答案保存失败，请重试。");
    }
  }

  function handleMove(nextIndex: number) {
    if (!attemptDetail) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(nextIndex, attemptDetail.questions.length - 1));
    setCurrentIndex(boundedIndex);
    setSelectedKeys(selectedKeysFor(attemptDetail.answers, attemptDetail.questions[boundedIndex]?.display_order));
    setMessage("");
  }

  function toggleKey(key: string) {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  if (result) {
    return (
      <section aria-label="考试结果页">
        <h2>考试结果</h2>
        <p>得分：{result.final_score}</p>
        <p>客观题：{result.objective_score}</p>
      </section>
    );
  }

  return (
    <section aria-label="学生考试页">
      <h2>考试入口</h2>

      {!attemptDetail ? (
        <>
          {loading ? <p>正在刷新...</p> : null}
          {message ? <p>{message}</p> : null}
          {exams.length > 0 ? (
            <ul>
              {exams.map((exam) => (
                <li key={exam.id}>
                  <p>{exam.name}</p>
                  <p>
                    {formatTime(exam.start_time)} 至 {formatTime(exam.end_time)}
                  </p>
                  <p>时长：{exam.duration_minutes ?? "-"} 分钟</p>
                  <button type="button" onClick={() => void handleStart(exam)}>
                    开始考试
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {currentQuestion ? (
        <section aria-label="考试作答区">
          {remainingSeconds !== null ? <p>剩余时间：{formatDuration(remainingSeconds)}</p> : null}
          {attemptDetail && attemptDetail.questions.length > 1 ? (
            <nav aria-label="考试题号导航">
              {attemptDetail.questions.map((question, index) => (
                <button
                  key={question.display_order}
                  type="button"
                  aria-pressed={index === currentIndex}
                  onClick={() => handleMove(index)}
                >
                  第 {index + 1} 题
                </button>
              ))}
            </nav>
          ) : null}
          <p>
            第 {currentIndex + 1} / {attemptDetail?.questions.length ?? 0} 题，{currentQuestion.score} 分
          </p>
          <p>{questionText(currentQuestion)}</p>
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
          <button type="button" onClick={() => void handleSaveAnswer()}>
            保存答案
          </button>
          <button type="button" disabled={currentIndex === 0} onClick={() => handleMove(currentIndex - 1)}>
            上一题
          </button>
          <button
            type="button"
            disabled={!attemptDetail || currentIndex >= attemptDetail.questions.length - 1}
            onClick={() => handleMove(currentIndex + 1)}
          >
            下一题
          </button>
          <button type="button" disabled={submitting} onClick={() => void submitCurrentAttempt(true)}>
            {submitting ? "交卷中..." : "交卷"}
          </button>
        </section>
      ) : null}

      {attemptDetail && !currentQuestion ? <p>本场考试暂无题目。</p> : null}
      {attemptDetail && message ? <p>{message}</p> : null}
    </section>
  );
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

function formatTime(value?: string | null): string {
  return value ?? "-";
}
