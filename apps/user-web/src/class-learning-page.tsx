import { useState, type FormEvent } from "react";

import type { ClassPracticeSummaryQuery, ClassPracticeSummaryResult } from "@aios/api-sdk";

export interface ClassLearningApi {
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
}

interface ClassLearningPageProps {
  api: ClassLearningApi;
}

const defaultForm = {
  classId: "",
  courseId: "",
  startDate: "",
  endDate: ""
};

export function ClassLearningPage({ api }: ClassLearningPageProps) {
  const [form, setForm] = useState(defaultForm);
  const [result, setResult] = useState<ClassPracticeSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("请输入班级ID和课程ID后查询。");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const classId = parsePositiveNumber(form.classId);
    const courseId = parsePositiveNumber(form.courseId);
    if (!classId || !courseId) {
      setMessage("班级ID和课程ID必须为正整数。");
      setResult(null);
      return;
    }

    setLoading(true);
    setMessage("正在加载班级学习数据...");
    try {
      const data = await api.getClassPracticeSummary({
        class_id: classId,
        course_id: courseId,
        start_at: toStartAt(form.startDate),
        end_at: toEndAt(form.endDate),
        page: 1,
        page_size: 20
      });
      setResult(data);
      setMessage(data.students.items.length > 0 ? "" : "暂无学生练题数据。");
    } catch {
      setResult(null);
      setMessage("班级学习数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="班级学习页">
      <h2>班级学习</h2>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="class_learning_class_id">班级ID</label>
        <input
          id="class_learning_class_id"
          inputMode="numeric"
          value={form.classId}
          onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value }))}
        />
        <label htmlFor="class_learning_course_id">课程ID</label>
        <input
          id="class_learning_course_id"
          inputMode="numeric"
          value={form.courseId}
          onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))}
        />
        <label htmlFor="class_learning_start_date">开始日期</label>
        <input
          id="class_learning_start_date"
          type="date"
          value={form.startDate}
          onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
        />
        <label htmlFor="class_learning_end_date">结束日期</label>
        <input
          id="class_learning_end_date"
          type="date"
          value={form.endDate}
          onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
        />
        <button type="submit">查询班级学习</button>
      </form>

      {message ? <p>{message}</p> : null}
      {loading ? <p>正在刷新...</p> : null}
      {result ? <ClassLearningResult result={result} /> : null}
    </section>
  );
}

function ClassLearningResult({ result }: { result: ClassPracticeSummaryResult }) {
  const summary = result.summary;
  return (
    <>
      <section aria-label="班级学习汇总">
        <h3>{summary.class_name} / {summary.course_name}</h3>
        <p>学生数：{summary.student_count}</p>
        <p>参与学生：{summary.participated_student_count}</p>
        <p>练习次数：{summary.session_count}</p>
        <p>答题数：{summary.answered_count}</p>
        <p>正确率：{formatPercent(summary.accuracy)}</p>
        <p>错题数：{summary.wrong_question_count}</p>
        <p>疑惑题数：{summary.confused_question_count}</p>
        <p>最近练习：{formatTime(summary.last_practiced_at)}</p>
      </section>
      <section aria-label="学生学习明细">
        <h3>学生明细</h3>
        {result.students.items.length > 0 ? (
          <ul>
            {result.students.items.map((student) => (
              <li key={student.student_id}>
                <p>{student.student_name}</p>
                <p>学号：{student.student_no ?? "-"}</p>
                <p>
                  答题 {student.answered_count}，正确 {student.correct_count}，错误 {student.wrong_count}
                </p>
                <p>正确率：{formatPercent(student.accuracy)}</p>
                <p>
                  错题 {student.wrong_question_count}，疑惑 {student.confused_question_count}
                </p>
                <p>最近练习：{formatTime(student.last_practiced_at)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无学生明细。</p>
        )}
      </section>
    </>
  );
}

function parsePositiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toStartAt(value: string): string | undefined {
  return value ? `${value}T00:00:00+08:00` : undefined;
}

function toEndAt(value: string): string | undefined {
  return value ? `${value}T23:59:59+08:00` : undefined;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}

function formatTime(value?: string | null): string {
  return value ?? "-";
}
