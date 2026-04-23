import { useEffect, useMemo, useState } from "react";

import type {
  StudentPracticeSessionDetailQuery,
  StudentPracticeSessionDetailResult,
  StudentPracticeSessionQuestionItem
} from "@aios/api-sdk";

export interface StudentPracticeSessionDetailApi {
  getStudentPracticeSessionDetail(query: StudentPracticeSessionDetailQuery): Promise<StudentPracticeSessionDetailResult>;
}

interface StudentPracticeSessionDetailPageProps {
  api: StudentPracticeSessionDetailApi;
  path: string;
  onNavigate(path: string): void;
}

type ParsedStudentPracticeSessionDetailPath =
  | {
      ok: false;
    }
  | {
      ok: true;
      class_id: number;
      course_id: number;
      student_user_id: number;
      session_id: number;
      start_at?: string;
      end_at?: string;
      query: StudentPracticeSessionDetailQuery;
      fetchKey: string;
    };

export function StudentPracticeSessionDetailPage({ api, path, onNavigate }: StudentPracticeSessionDetailPageProps) {
  const parsed = useMemo(() => parseStudentPracticeSessionDetailPath(path), [path]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<StudentPracticeSessionDetailResult | null>(null);

  useEffect(() => {
    if (!parsed.ok) {
      setLoading(false);
      setMessage("");
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setMessage("正在加载练习详情...");

    void api
      .getStudentPracticeSessionDetail(parsed.query)
      .then((data) => {
        if (!active) {
          return;
        }
        setResult(data);
        setMessage("");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setResult(null);
        setMessage("练习详情加载失败，请稍后重试。");
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
      <section aria-label="学生单次练题详情页">
        <h2>单次练题详情</h2>
        <p>练习详情参数无效。</p>
      </section>
    );
  }

  const student = result?.student_summary;
  const session = result?.session;
  const questions = result?.questions ?? [];

  return (
    <section aria-label="学生单次练题详情页">
      <button type="button" onClick={() => onNavigate(buildStudentDetailPath(parsed))}>
        返回
      </button>

      <h2>{student ? `${student.student_name} 本次练习` : "单次练题详情"}</h2>

      {student && session ? (
        <section aria-label="练习概览">
          <p>学号：{student.student_no ?? "-"}</p>
          <p>
            班级/课程：{student.class_name} / {student.course_name}
          </p>
          <p>状态：{session.status}</p>
          <p>
            题量：{session.total_count}，已答：{session.answered_count}，正确：{session.correct_count}，错误：
            {session.wrong_count}
          </p>
          <p>正确率：{formatPercent(session.accuracy)}</p>
          <p>开始时间：{session.started_at ?? "-"}</p>
          <p>结束时间：{session.finished_at ?? "-"}</p>
        </section>
      ) : null}

      {loading ? <p>正在刷新...</p> : null}
      {message ? <p>{message}</p> : null}

      {result ? (
        <section aria-label="题目明细">
          {questions.length === 0 ? (
            <p>本次练习暂无题目。</p>
          ) : (
            <ul>
              {questions.map((item) => (
                <li key={item.session_question_id}>
                  <p>
                    第 {item.display_order} 题（{item.question_type}）
                  </p>
                  <p>题干：{extractStem(item.content)}</p>
                  <p>学生答案：{formatObject(item.student_answer)}</p>
                  <p>正确答案：{formatObject(item.correct_answer)}</p>
                  <p>结果：{formatResult(item)}</p>
                  <p>作答时间：{item.answered_at ?? "-"}</p>
                  <p>解析：{extractAnalysis(item.analysis)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  );
}

function parseStudentPracticeSessionDetailPath(path: string): ParsedStudentPracticeSessionDetailPath {
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
  if (!class_id || !course_id || !student_user_id || !session_id) {
    return { ok: false };
  }

  const start_at = url.searchParams.get("start_at") || undefined;
  const end_at = url.searchParams.get("end_at") || undefined;
  const query: StudentPracticeSessionDetailQuery = {
    class_id,
    course_id,
    student_user_id,
    session_id
  };
  const fetchKey = [class_id, course_id, student_user_id, session_id].join("|");

  return {
    ok: true,
    class_id,
    course_id,
    student_user_id,
    session_id,
    start_at,
    end_at,
    query,
    fetchKey
  };
}

function buildStudentDetailPath(parsed: Extract<ParsedStudentPracticeSessionDetailPath, { ok: true }>): string {
  const search = new URLSearchParams();
  search.set("class_id", String(parsed.class_id));
  search.set("course_id", String(parsed.course_id));
  search.set("student_user_id", String(parsed.student_user_id));
  search.set("tab", "sessions");
  if (parsed.start_at) {
    search.set("start_at", parsed.start_at);
  }
  if (parsed.end_at) {
    search.set("end_at", parsed.end_at);
  }
  return `/app/class-learning/student?${search.toString()}`;
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
