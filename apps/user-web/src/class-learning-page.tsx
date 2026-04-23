import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  ClassCourseOptionsResult,
  ClassPracticeSummaryQuery,
  ClassPracticeSummaryResult
} from "@aios/api-sdk";

export interface ClassLearningApi {
  listClassCourseOptions(): Promise<ClassCourseOptionsResult>;
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
}

interface ClassLearningPageProps {
  api: ClassLearningApi;
  onNavigate?(path: string): void;
}

interface SelectedClassCourse {
  class_id: number;
  class_name: string;
  course_id: number;
  course_name: string;
}

const defaultForm = {
  startDate: "",
  endDate: ""
};

export function ClassLearningPage({ api, onNavigate }: ClassLearningPageProps) {
  const [form, setForm] = useState(defaultForm);
  const [result, setResult] = useState<ClassPracticeSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ClassCourseOptionsResult["items"]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [message, setMessage] = useState("正在加载班级课程...");
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<SelectedClassCourse | null>(null);

  const flattenedOptions = useMemo(() => flattenClassCourseOptions(options), [options]);

  useEffect(() => {
    let active = true;

    setOptionsLoading(true);
    setOptionsError(false);
    setMessage("正在加载班级课程...");
    setResult(null);
    setSelectedCourse(null);
    setExpandedClassId(null);

    void api
      .listClassCourseOptions()
      .then((data) => {
        if (!active) {
          return;
        }

        const items = data.items ?? [];
        const flattened = flattenClassCourseOptions(items);
        setOptions(items);
        setOptionsLoading(false);

        if (flattened.length === 0) {
          setMessage("暂无可查看的班级课程");
          return;
        }

        if (flattened.length === 1) {
          const onlyCourse = flattened[0];
          setSelectedCourse(onlyCourse);
          setExpandedClassId(onlyCourse.class_id);
          setMessage("");
          return;
        }

        setMessage("");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setOptions([]);
        setOptionsLoading(false);
        setOptionsError(true);
        setMessage("班级课程加载失败，请稍后重试。");
      });

    return () => {
      active = false;
    };
  }, [api]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCourse) {
      setMessage("请选择班级和课程。");
      setResult(null);
      return;
    }

    setLoading(true);
    setMessage("正在加载班级学习数据...");
    try {
      const data = await api.getClassPracticeSummary({
        class_id: selectedCourse.class_id,
        course_id: selectedCourse.course_id,
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
      {!optionsLoading && !optionsError && flattenedOptions.length > 0 ? (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <ClassCourseSelector
            items={options}
            expandedClassId={expandedClassId}
            selectedCourse={selectedCourse}
            onToggleClass={(classId) => {
              setExpandedClassId((current) => (current === classId ? null : classId));
            }}
            onSelectCourse={(item) => {
              setResult(null);
              setSelectedCourse(item);
              setExpandedClassId(item.class_id);
              setMessage("");
            }}
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
      ) : null}

      {message ? <p>{message}</p> : null}
      {loading ? <p>正在刷新...</p> : null}
      {result ? (
        <ClassLearningResult
          result={result}
          onNavigate={onNavigate}
          start_at={toStartAt(form.startDate)}
          end_at={toEndAt(form.endDate)}
        />
      ) : null}
    </section>
  );
}

function ClassCourseSelector({
  items,
  expandedClassId,
  selectedCourse,
  onToggleClass,
  onSelectCourse
}: {
  items: ClassCourseOptionsResult["items"];
  expandedClassId: number | null;
  selectedCourse: SelectedClassCourse | null;
  onToggleClass(classId: number): void;
  onSelectCourse(item: SelectedClassCourse): void;
}) {
  return (
    <fieldset>
      <legend>班级课程</legend>
      {selectedCourse ? <p>当前已选：{selectedCourse.class_name} / {selectedCourse.course_name}</p> : null}
      <div>
        {items.map((classOption) => {
          const isExpanded = expandedClassId === classOption.class_id;
          return (
            <div key={classOption.class_id}>
              <button type="button" aria-expanded={isExpanded} onClick={() => onToggleClass(classOption.class_id)}>
                {classOption.class_name}
              </button>
              {isExpanded ? (
                <div>
                  {classOption.courses.map((course) => {
                    const isSelected =
                      selectedCourse?.class_id === classOption.class_id && selectedCourse.course_id === course.course_id;
                    const node: SelectedClassCourse = {
                      class_id: classOption.class_id,
                      class_name: classOption.class_name,
                      course_id: course.course_id,
                      course_name: course.course_name
                    };
                    return (
                      <button
                        key={course.course_id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectCourse(node)}
                      >
                        {course.course_name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function ClassLearningResult({
  result,
  onNavigate,
  start_at,
  end_at
}: {
  result: ClassPracticeSummaryResult;
  onNavigate?: (path: string) => void;
  start_at?: string;
  end_at?: string;
}) {
  const summary = result.summary;
  return (
    <>
      <section aria-label="班级学习汇总">
        <h3>
          {summary.class_name} / {summary.course_name}
        </h3>
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
                <button
                  type="button"
                  onClick={() => {
                    if (!onNavigate) {
                      return;
                    }
                    const params = new URLSearchParams();
                    params.set("class_id", String(summary.class_id));
                    params.set("course_id", String(summary.course_id));
                    params.set("student_user_id", String(student.student_id));
                    params.set("tab", "sessions");
                    if (start_at) {
                      params.set("start_at", start_at);
                    }
                    if (end_at) {
                      params.set("end_at", end_at);
                    }
                    onNavigate(`/app/class-learning/student?${params.toString()}`);
                  }}
                >
                  查看详情
                </button>
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

function flattenClassCourseOptions(items: ClassCourseOptionsResult["items"]): SelectedClassCourse[] {
  const nodes: SelectedClassCourse[] = [];
  for (const classOption of items) {
    for (const course of classOption.courses) {
      nodes.push({
        class_id: classOption.class_id,
        class_name: classOption.class_name,
        course_id: course.course_id,
        course_name: course.course_name
      });
    }
  }
  return nodes;
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
