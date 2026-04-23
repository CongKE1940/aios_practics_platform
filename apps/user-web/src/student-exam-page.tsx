import { useEffect, useState } from "react";

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
  saveExamAttemptAnswer(attemptId: number, body: ExamAttemptAnswerInput): Promise<ExamAttemptAnswer>;
  submitExamAttempt(attemptId: number): Promise<ExamAttemptResult>;
  getExamAttemptResult(attemptId: number): Promise<ExamAttemptResult>;
}

interface StudentExamPageProps {
  api: StudentExamApi;
}

export function StudentExamPage({ api }: StudentExamPageProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [attemptDetail, setAttemptDetail] = useState<ExamAttemptDetail | null>(null);
  const [result, setResult] = useState<ExamAttemptResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在加载考试...");

  const currentQuestion = attemptDetail?.questions[currentIndex] ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("正在加载考试...");

    void api
      .listExams({ page: 1, page_size: 20, status: "published" })
      .then((data) => {
        if (!active) {
          return;
        }
        setExams(data.items ?? []);
        setMessage(data.items.length > 0 ? "" : "暂无可参加考试。");
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

  async function handleStart(examId: number) {
    setMessage("正在进入考试...");
    const detail = await api.startExamAttempt(examId);
    setAttemptDetail(detail);
    setResult(null);
    setCurrentIndex(0);
    setSelectedKeys(selectedKeysFor(detail.answers, detail.questions[0]?.display_order));
    setMessage("");
  }

  async function handleSaveAnswer() {
    if (!attemptDetail || !currentQuestion) {
      return;
    }
    await api.saveExamAttemptAnswer(attemptDetail.attempt.id, {
      display_order: currentQuestion.display_order,
      answer: { selected_keys: selectedKeys }
    });
    setAttemptDetail((current) => mergeSavedAnswer(current, currentQuestion, selectedKeys));
    setMessage("答案已保存。");
  }

  async function handleSubmit() {
    if (!attemptDetail) {
      return;
    }
    const submitted = await api.submitExamAttempt(attemptDetail.attempt.id);
    setResult(submitted);
    setAttemptDetail(null);
    setMessage("");
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
                  <button type="button" onClick={() => void handleStart(exam.id)}>
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
          <button type="button" onClick={() => void handleSubmit()}>
            交卷
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
