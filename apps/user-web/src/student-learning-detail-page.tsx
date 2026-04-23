import { useEffect, useMemo, useState } from "react";

import type {
  StudentPracticeDetailQuery,
  StudentPracticeDetailResult,
  StudentPracticeDetailTab,
  StudentPracticeQuestionItem,
  StudentPracticeSessionItem
} from "@aios/api-sdk";

export interface StudentLearningDetailApi {
  getStudentPracticeDetail(query: StudentPracticeDetailQuery): Promise<StudentPracticeDetailResult>;
}

interface StudentLearningDetailPageProps {
  api: StudentLearningDetailApi;
  path: string;
  onNavigate(path: string): void;
}

type ParsedStudentPracticeQuery =
  | {
      ok: false;
    }
  | {
      ok: true;
      class_id: number;
      course_id: number;
      student_user_id: number;
      tab: StudentPracticeDetailTab;
      start_at?: string;
      end_at?: string;
      query: StudentPracticeDetailQuery;
      fetchKey: string;
    };

export function StudentLearningDetailPage({ api, path, onNavigate }: StudentLearningDetailPageProps) {
  const parsed = useMemo(() => parseStudentPracticeDetailPath(path), [path]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<StudentPracticeDetailResult | null>(null);

  useEffect(() => {
    if (!parsed.ok) {
      setLoading(false);
      setMessage("");
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setMessage("正在加载学生学习详情...");

    void api
      .getStudentPracticeDetail(parsed.query)
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
        setMessage("学生学习详情加载失败，请稍后重试。");
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
      <section aria-label="学生学习详情页">
        <h2>学生学习详情</h2>
        <p>学生学习详情参数无效。</p>
      </section>
    );
  }

  const summary = result?.student_summary;

  return (
    <section aria-label="学生学习详情页">
      <button
        type="button"
        onClick={() => {
          const backPath = buildClassLearningBackPath(parsed);
          onNavigate(backPath);
        }}
      >
        返回
      </button>

      <h2>{summary?.student_name ?? "学生学习详情"}</h2>
      {summary ? (
        <section aria-label="学生信息">
          <p>学号：{summary.student_no ?? "-"}</p>
          <p>
            班级/课程：{summary.class_name} / {summary.course_name}
          </p>
          <p>练习次数：{summary.session_count}</p>
          <p>答题数：{summary.answered_count}</p>
          <p>正确率：{formatPercent(summary.accuracy)}</p>
        </section>
      ) : null}

      <section aria-label="详情切换">
        <button
          type="button"
          aria-pressed={parsed.tab === "sessions"}
          onClick={() => onNavigate(buildStudentDetailPath({ ...parsed, tab: "sessions" }))}
        >
          练题记录
        </button>
        <button
          type="button"
          aria-pressed={parsed.tab === "wrong"}
          onClick={() => onNavigate(buildStudentDetailPath({ ...parsed, tab: "wrong" }))}
        >
          错题
        </button>
        <button
          type="button"
          aria-pressed={parsed.tab === "confused"}
          onClick={() => onNavigate(buildStudentDetailPath({ ...parsed, tab: "confused" }))}
        >
          疑惑题
        </button>
      </section>

      {loading ? <p>正在刷新...</p> : null}
      {message ? <p>{message}</p> : null}

      {result ? (
        <section aria-label="详情内容">
          {parsed.tab === "sessions" ? (
            <SessionList items={result.sessions.items} />
          ) : parsed.tab === "wrong" ? (
            <QuestionList items={result.wrong_questions.items} emptyText="暂无错题。" />
          ) : (
            <QuestionList items={result.confused_questions.items} emptyText="暂无疑惑题。" />
          )}
        </section>
      ) : null}
    </section>
  );
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || !Number.isInteger(numberValue) || numberValue <= 0) {
    return null;
  }
  return numberValue;
}

function isValidTab(value: string): value is StudentPracticeDetailTab {
  return value === "sessions" || value === "wrong" || value === "confused";
}

function parseStudentPracticeDetailPath(path: string): ParsedStudentPracticeQuery {
  let url: URL;
  try {
    url = new URL(path, "http://localhost");
  } catch {
    return { ok: false };
  }

  const class_id = parsePositiveInt(url.searchParams.get("class_id"));
  const course_id = parsePositiveInt(url.searchParams.get("course_id"));
  const student_user_id = parsePositiveInt(url.searchParams.get("student_user_id"));
  if (!class_id || !course_id || !student_user_id) {
    return { ok: false };
  }

  const tabValue = url.searchParams.get("tab");
  const tab = tabValue ? (isValidTab(tabValue) ? tabValue : null) : "sessions";
  if (!tab) {
    return { ok: false };
  }

  const start_at = url.searchParams.get("start_at") || undefined;
  const end_at = url.searchParams.get("end_at") || undefined;

  const query: StudentPracticeDetailQuery = {
    class_id,
    course_id,
    student_user_id,
    tab,
    start_at,
    end_at,
    page: 1,
    page_size: 20
  };

  const fetchKey = [class_id, course_id, student_user_id, tab, start_at ?? "", end_at ?? ""].join("|");

  return {
    ok: true,
    class_id,
    course_id,
    student_user_id,
    tab,
    start_at,
    end_at,
    query,
    fetchKey
  };
}

function buildStudentDetailPath(params: {
  class_id: number;
  course_id: number;
  student_user_id: number;
  tab: StudentPracticeDetailTab;
  start_at?: string;
  end_at?: string;
}): string {
  const search = new URLSearchParams();
  search.set("class_id", String(params.class_id));
  search.set("course_id", String(params.course_id));
  search.set("student_user_id", String(params.student_user_id));
  search.set("tab", params.tab);
  if (params.start_at) {
    search.set("start_at", params.start_at);
  }
  if (params.end_at) {
    search.set("end_at", params.end_at);
  }
  return `/app/class-learning/student?${search.toString()}`;
}

function buildClassLearningBackPath(parsed: Extract<ParsedStudentPracticeQuery, { ok: true }>): string {
  const search = new URLSearchParams();
  search.set("class_id", String(parsed.class_id));
  search.set("course_id", String(parsed.course_id));
  if (parsed.start_at) {
    search.set("start_at", parsed.start_at);
  }
  if (parsed.end_at) {
    search.set("end_at", parsed.end_at);
  }

  const queryString = search.toString();
  return queryString ? `/app/class-learning?${queryString}` : "/app/class-learning";
}

function SessionList({ items }: { items: StudentPracticeSessionItem[] }) {
  if (items.length === 0) {
    return <p>暂无练题记录。</p>;
  }

  return (
    <ul aria-label="练题记录">
      {items.map((item) => (
        <li key={item.session_id}>
          <p>session_id：{item.session_id}</p>
          <p>status：{item.status}</p>
          <p>
            total {item.total_count}，answered {item.answered_count}，correct {item.correct_count}，wrong {item.wrong_count}
          </p>
          <p>accuracy：{formatPercent(item.accuracy)}</p>
        </li>
      ))}
    </ul>
  );
}

function QuestionList({ items, emptyText }: { items: StudentPracticeQuestionItem[]; emptyText: string }) {
  if (items.length === 0) {
    return <p>{emptyText}</p>;
  }

  return (
    <ul aria-label="题目列表">
      {items.map((item) => (
        <li key={`${item.question_id}-${item.question_version_id}`}>
          <p>{item.stem}</p>
          <p>题型：{item.question_type}</p>
          <p>错题次数：{item.practice_wrong_count}</p>
          <p>last_result：{item.last_result}</p>
        </li>
      ))}
    </ul>
  );
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}
