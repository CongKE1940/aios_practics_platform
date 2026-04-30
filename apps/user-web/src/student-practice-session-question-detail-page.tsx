import { useEffect, useMemo, useState } from "react";

import type {
  StudentPracticeSessionQuestionDetailQuery,
  StudentPracticeSessionQuestionDetailResult,
  StudentPracticeSessionQuestionItem,
  StudentPracticeSessionQuestionReviewInput
} from "@aios/api-sdk";

import { buildQuestionFeedbackPath } from "./question-feedback-page";

export interface StudentPracticeSessionQuestionDetailApi {
  getStudentPracticeSessionQuestionDetail(
    query: StudentPracticeSessionQuestionDetailQuery
  ): Promise<StudentPracticeSessionQuestionDetailResult>;
  upsertStudentPracticeSessionQuestionReview(
    body: StudentPracticeSessionQuestionReviewInput
  ): Promise<{
    review_id: number;
    reviewer_user_id: number;
    review_comment: string;
    updated_at?: string | null;
  }>;
}

interface StudentPracticeSessionQuestionDetailPageProps {
  api: StudentPracticeSessionQuestionDetailApi;
  path: string;
  onNavigate(path: string): void;
}

type ParsedStudentPracticeSessionQuestionDetailPath =
  | {
      ok: false;
    }
  | {
      ok: true;
      class_id: number;
      course_id: number;
      student_user_id: number;
      session_id: number;
      session_question_id: number;
      start_at?: string;
      end_at?: string;
      query: StudentPracticeSessionQuestionDetailQuery;
      fetchKey: string;
    };

export function StudentPracticeSessionQuestionDetailPage({
  api,
  path,
  onNavigate
}: StudentPracticeSessionQuestionDetailPageProps) {
  const parsed = useMemo(() => parseStudentPracticeSessionQuestionDetailPath(path), [path]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<StudentPracticeSessionQuestionDetailResult | null>(null);
  const [reviewDraft, setReviewDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!parsed.ok) {
      setLoading(false);
      setMessage("");
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setMessage("正在加载题目详情...");

    void api
      .getStudentPracticeSessionQuestionDetail(parsed.query)
      .then((data) => {
        if (!active) {
          return;
        }
        setResult(data);
        setReviewDraft(data.teacher_review?.review_comment ?? "");
        setMessage("");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setResult(null);
        setReviewDraft("");
        setMessage("题目详情加载失败，请稍后重试。");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, parsed.ok ? parsed.fetchKey : "invalid"]);

  if (!parsed.ok) {
    return (
      <section aria-label="学生单题详情页">
        <h2>单题详情</h2>
        <p>题目详情参数无效。</p>
      </section>
    );
  }

  const student = result?.student_summary;
  const session = result?.session;
  const question = result?.question_detail;

  async function handleSaveReview() {
    if (!parsed.ok) {
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      const review = await api.upsertStudentPracticeSessionQuestionReview({
        ...parsed.query,
        review_comment: reviewDraft
      });
      setResult((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          teacher_review: review
        };
      });
      setReviewDraft(review.review_comment);
      setSaveMessage("讲评已保存。");
    } catch {
      setSaveMessage("讲评保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="学生单题详情页">
      <button type="button" onClick={() => onNavigate(buildSessionDetailPath(parsed))}>
        返回
      </button>

      <h2>{student && question ? `${student.student_name} 第 ${question.display_order} 题` : "单题详情"}</h2>

      {student && session ? (
        <section aria-label="题目概览">
          <p>学号：{student.student_no ?? "-"}</p>
          <p>
            班级/课程：{student.class_name} / {student.course_name}
          </p>
          <p>练习状态：{session.status}</p>
          <p>
            本次练习题量：{session.total_count}，已答：{session.answered_count}，正确：{session.correct_count}，错误：
            {session.wrong_count}
          </p>
          <p>本次练习正确率：{formatPercent(session.accuracy)}</p>
        </section>
      ) : null}

      {loading ? <p>正在刷新...</p> : null}
      {message ? <p>{message}</p> : null}

      {question ? (
        <section aria-label="题目内容">
          <p>
            第 {question.display_order} 题（{question.question_type}）
          </p>
          <p>题干：{extractStem(question.content)}</p>
          <p>学生答案：{formatObject(question.student_answer)}</p>
          <p>正确答案：{formatObject(question.correct_answer)}</p>
          <p>结果：{formatResult(question)}</p>
          <p>作答时间：{question.answered_at ?? "-"}</p>
          <p>解析：{extractAnalysis(question.analysis)}</p>
          <button
            type="button"
            onClick={() =>
              onNavigate(
                buildQuestionFeedbackPath({
                  question_id: question.question_id,
                  question_version_id: question.question_version_id,
                  question_type: question.question_type,
                  stem: extractStem(question.content),
                  from: path
                })
              )
            }
          >
            评论与质疑
          </button>
          <label>
            老师讲评
            <textarea value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value)} />
          </label>
          <button type="button" onClick={handleSaveReview} disabled={saving}>
            保存讲评
          </button>
          {saveMessage ? <p>{saveMessage}</p> : null}
        </section>
      ) : null}
    </section>
  );
}

function parseStudentPracticeSessionQuestionDetailPath(path: string): ParsedStudentPracticeSessionQuestionDetailPath {
  let url: URL;
  try {
    url = new URL(path, "http://localhost");
  } catch {
    return { ok: false };
  }

  const class_id = parsePositiveInt(url.searchParams.get("class_id"));
  const course_id = parsePositiveInt(url.searchParams.get("course_id"));
  const student_user_id = parsePositiveInt(url.searchParams.get("student_user_id"));
  const session_id = parsePositiveInt(url.searchParams.get("session_id"));
  const session_question_id = parsePositiveInt(url.searchParams.get("session_question_id"));
  if (!class_id || !course_id || !student_user_id || !session_id || !session_question_id) {
    return { ok: false };
  }

  const start_at = url.searchParams.get("start_at") || undefined;
  const end_at = url.searchParams.get("end_at") || undefined;
  const query: StudentPracticeSessionQuestionDetailQuery = {
    class_id,
    course_id,
    student_user_id,
    session_id,
    session_question_id
  };
  const fetchKey = [class_id, course_id, student_user_id, session_id, session_question_id].join("|");

  return {
    ok: true,
    class_id,
    course_id,
    student_user_id,
    session_id,
    session_question_id,
    start_at,
    end_at,
    query,
    fetchKey
  };
}

function buildSessionDetailPath(parsed: Extract<ParsedStudentPracticeSessionQuestionDetailPath, { ok: true }>): string {
  const search = new URLSearchParams();
  search.set("class_id", String(parsed.class_id));
  search.set("course_id", String(parsed.course_id));
  search.set("student_user_id", String(parsed.student_user_id));
  search.set("session_id", String(parsed.session_id));
  if (parsed.start_at) {
    search.set("start_at", parsed.start_at);
  }
  if (parsed.end_at) {
    search.set("end_at", parsed.end_at);
  }
  return `/app/class-learning/student/session?${search.toString()}`;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function extractStem(content: Record<string, unknown>): string {
  const stem = content.stem;
  if (typeof stem !== "object" || stem === null) {
    return "-";
  }
  const text = (stem as { text?: unknown }).text;
  if (typeof text !== "string" || text.trim() === "") {
    return "-";
  }
  return text;
}

function extractAnalysis(analysis?: Record<string, unknown>): string {
  if (!analysis) {
    return "-";
  }
  const text = analysis.text;
  if (typeof text === "string" && text.trim() !== "") {
    return text;
  }
  return formatObject(analysis);
}

function formatObject(value?: Record<string, unknown>): string {
  if (!value || Object.keys(value).length === 0) {
    return "-";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "-";
  }
}

function formatResult(item: StudentPracticeSessionQuestionItem): string {
  if (!item.is_answered) {
    return "未作答";
  }
  if (item.is_correct === true) {
    return "正确";
  }
  if (item.is_correct === false) {
    return "错误";
  }
  return "已作答";
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}
