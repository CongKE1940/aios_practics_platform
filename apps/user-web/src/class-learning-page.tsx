import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  ClassCourseOptionsResult,
  ClassPracticeStudentItem,
  ClassPracticeSummary,
  ClassPracticeSummaryQuery,
  ClassPracticeSummaryResult,
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

const defaultPageSize = 10;

const defaultForm = {
  class_course: "",
  startDate: "",
  endDate: ""
};

type ClassLearningForm = typeof defaultForm;
type ModalState = { type: "detail"; student: ClassPracticeStudentItem } | null;

const columns: Array<FixedActionListColumn<ClassPracticeStudentItem>> = [
  {
    key: "student_name",
    title: "学生姓名",
    render: (student) => student.student_name
  },
  {
    key: "student_no",
    title: "学号",
    width: 130,
    render: (student) => student.student_no || "-"
  },
  {
    key: "session_count",
    title: "练习次数",
    width: 110,
    render: (student) => student.session_count
  },
  {
    key: "answered_count",
    title: "答题数",
    width: 100,
    render: (student) => student.answered_count
  },
  {
    key: "correct_count",
    title: "正确数",
    width: 100,
    render: (student) => student.correct_count
  },
  {
    key: "wrong_count",
    title: "错误数",
    width: 100,
    render: (student) => student.wrong_count
  },
  {
    key: "accuracy",
    title: "正确率",
    width: 100,
    render: (student) => formatPercent(student.accuracy)
  },
  {
    key: "wrong_question_count",
    title: "错题数",
    width: 100,
    render: (student) => student.wrong_question_count
  },
  {
    key: "confused_question_count",
    title: "疑惑题数",
    width: 110,
    render: (student) => student.confused_question_count
  },
  {
    key: "last_practiced_at",
    title: "最近练习",
    width: 170,
    render: (student) => formatDateTime(student.last_practiced_at)
  }
];

export function ClassLearningPage({ api, onNavigate }: ClassLearningPageProps) {
  const [form, setForm] = useState<ClassLearningForm>(defaultForm);
  const [summary, setSummary] = useState<ClassPracticeSummary | null>(null);
  const [students, setStudents] = useState<ClassPracticeStudentItem[]>([]);
  const [options, setOptions] = useState<ClassCourseOptionsResult["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const didLoadRef = useRef(false);

  const flattenedOptions = useMemo(() => flattenClassCourseOptions(options), [options]);
  const selectedCourse = useMemo(
    () => flattenedOptions.find((item) => toClassCourseValue(item) === form.class_course) ?? null,
    [flattenedOptions, form.class_course]
  );
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadInitialData();
  }, [api]);

  async function loadInitialData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const optionsResult = await api.listClassCourseOptions();
      const optionItems = optionsResult.items ?? [];
      const nextOptions = flattenClassCourseOptions(optionItems);
      const firstOption = nextOptions[0] ?? null;
      setOptions(optionItems);

      if (!firstOption) {
        setForm(defaultForm);
        applyEmptyResult(1, defaultPageSize);
        return;
      }

      setForm((current) => ({ ...current, class_course: toClassCourseValue(firstOption) }));
      const data = await api.getClassPracticeSummary(buildSummaryQuery(firstOption, "", "", 1, defaultPageSize));
      applyResult(data, buildSummaryQuery(firstOption, "", "", 1, defaultPageSize));
    } catch (error) {
      applyEmptyResult(1, defaultPageSize);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "班级学习数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents(query: ClassPracticeSummaryQuery) {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api.getClassPracticeSummary(query);
      applyResult(data, query);
    } catch (error) {
      applyEmptyResult(query.page || 1, query.page_size || defaultPageSize);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "班级学习数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  function applyResult(data: ClassPracticeSummaryResult, query: ClassPracticeSummaryQuery) {
    const studentPage = normalizeStudentPage(data.students, query);
    setSummary(data.summary);
    setStudents(studentPage.items);
    setTotal(studentPage.total);
    setPage(studentPage.page || query.page || 1);
    setPageSize(studentPage.page_size || query.page_size || defaultPageSize);
  }

  function applyEmptyResult(nextPage: number, nextPageSize: number) {
    setSummary(null);
    setStudents([]);
    setTotal(0);
    setPage(nextPage);
    setPageSize(nextPageSize);
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourse) {
      applyEmptyResult(1, pageSize);
      setErrorMessage("请选择班级课程后再查询。");
      return;
    }
    setSelectedIDs([]);
    await loadStudents(buildSummaryQuery(selectedCourse, form.startDate, form.endDate, 1, pageSize));
  }

  async function handleReset() {
    const firstOption = flattenedOptions[0] ?? null;
    setSelectedIDs([]);
    setForm({
      ...defaultForm,
      class_course: firstOption ? toClassCourseValue(firstOption) : ""
    });

    if (!firstOption) {
      applyEmptyResult(1, defaultPageSize);
      return;
    }

    await loadStudents(buildSummaryQuery(firstOption, "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    if (!selectedCourse) {
      return;
    }
    setSelectedIDs([]);
    await loadStudents(buildSummaryQuery(selectedCourse, form.startDate, form.endDate, nextPage, pageSize));
  }

  function handleExport() {
    downloadCsv(
      "class_learning_students.csv",
      [
        { key: "student_name", title: "学生姓名" },
        { key: "student_no", title: "学号" },
        { key: "session_count", title: "练习次数" },
        { key: "answered_count", title: "答题数" },
        { key: "correct_count", title: "正确数" },
        { key: "wrong_count", title: "错误数" },
        { key: "accuracy_label", title: "正确率" },
        { key: "wrong_question_count", title: "错题数" },
        { key: "confused_question_count", title: "疑惑题数" },
        { key: "last_practiced_at_label", title: "最近练习" }
      ],
      students.map((student) => ({
        ...student,
        student_no: student.student_no ?? "",
        accuracy_label: formatPercent(student.accuracy),
        last_practiced_at_label: formatDateTime(student.last_practiced_at)
      }))
    );
  }

  function navigateToStudent(student: ClassPracticeStudentItem) {
    if (!onNavigate || !summary) {
      return;
    }

    const params = new URLSearchParams();
    params.set("class_id", String(summary.class_id));
    params.set("course_id", String(summary.course_id));
    params.set("student_user_id", String(student.student_id));
    params.set("tab", "sessions");
    const startAt = toStartAt(form.startDate);
    const endAt = toEndAt(form.endDate);
    if (startAt) {
      params.set("start_at", startAt);
    }
    if (endAt) {
      params.set("end_at", endAt);
    }
    onNavigate(`/app/class-learning/student?${params.toString()}`);
  }

  return (
    <section aria-label="班级学习页" className="ui-admin-page ui-user-page" style={pageStyle}>
      <h2 style={visuallyHiddenStyle}>班级学习</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="班级学习数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="班级学习数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterSelect
            id="class_learning_class_course"
            label="班级课程"
            placeholder="请选择班级课程"
            value={form.class_course}
            onChange={(value) => {
              setForm((current) => ({ ...current, class_course: value }));
              setSelectedIDs([]);
            }}
          >
              {flattenedOptions.map((item) => (
                <option key={toClassCourseValue(item)} value={toClassCourseValue(item)}>
                  {item.class_name} / {item.course_name}
                </option>
              ))}
          </ClearableFilterSelect>
          <ClearableFilterInput
            id="class_learning_start_date"
            label="开始日期"
            type="date"
            value={form.startDate}
            onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
          />
          <ClearableFilterInput
            id="class_learning_end_date"
            label="结束日期"
            type="date"
            value={form.endDate}
            onChange={(value) => setForm((current) => ({ ...current, endDate: value }))}
          />
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading || !selectedCourse}>
              {loading ? "查询中" : "查询班级学习"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleReset()} disabled={loading}>
              重置
            </button>
          </div>
        </form>

        {selectedCourse ? (
          <p className="ui-admin-subtle" style={selectedCourseStyle}>
            当前已选：{selectedCourse.class_name} / {selectedCourse.course_name}
          </p>
        ) : null}

        {summary ? (
          <div className="ui-admin-kpis" aria-label="班级学习汇总" style={summaryStyle}>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>学生数</span>
              <strong>{summary.student_count}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>参与学生</span>
              <strong>{summary.participated_student_count}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>练习次数</span>
              <strong>{summary.session_count}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>答题数</span>
              <strong>{summary.answered_count}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>正确率</span>
              <strong>{formatPercent(summary.accuracy)}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>最近练习</span>
              <strong>{formatDateTime(summary.last_practiced_at)}</strong>
            </article>
          </div>
        ) : null}

        <FixedActionList
          rows={students}
          columns={columns}
          getRowId={(student) => student.student_id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onExport={handleExport}
          onDetail={(student) => setModal({ type: "detail", student })}
          onEdit={(student) => navigateToStudent(student)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无学生学习数据"}
          ariaLabel="班级学习学生列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          editLabel="查看明细"
          rowCheckboxLabel={(student) => `选择学生-${student.student_name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="学生学习详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>学生学习详情</h3>
                <p>{modal.student.student_name}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>班级课程</dt>
                  <dd>{summary ? `${summary.class_name} / ${summary.course_name}` : "-"}</dd>
                </div>
                <div>
                  <dt>学生姓名</dt>
                  <dd>{modal.student.student_name}</dd>
                </div>
                <div>
                  <dt>学号</dt>
                  <dd>{modal.student.student_no || "-"}</dd>
                </div>
                <div>
                  <dt>练习次数</dt>
                  <dd>{modal.student.session_count}</dd>
                </div>
                <div>
                  <dt>答题表现</dt>
                  <dd>{`答题 ${modal.student.answered_count}，正确 ${modal.student.correct_count}，错误 ${modal.student.wrong_count}`}</dd>
                </div>
                <div>
                  <dt>正确率</dt>
                  <dd>{formatPercent(modal.student.accuracy)}</dd>
                </div>
                <div>
                  <dt>错题 / 疑惑题</dt>
                  <dd>{`${modal.student.wrong_question_count} / ${modal.student.confused_question_count}`}</dd>
                </div>
                <div>
                  <dt>最近练习</dt>
                  <dd>{formatDateTime(modal.student.last_practiced_at)}</dd>
                </div>
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => navigateToStudent(modal.student)}>
                查看明细
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildSummaryQuery(
  selectedCourse: SelectedClassCourse,
  startDate: string,
  endDate: string,
  page: number,
  pageSize: number
): ClassPracticeSummaryQuery {
  return {
    class_id: selectedCourse.class_id,
    course_id: selectedCourse.course_id,
    start_at: toStartAt(startDate),
    end_at: toEndAt(endDate),
    page,
    page_size: pageSize
  };
}

function normalizeStudentPage(
  pageResult: PageResult<ClassPracticeStudentItem>,
  query: ClassPracticeSummaryQuery
): PageResult<ClassPracticeStudentItem> {
  return {
    items: pageResult.items ?? [],
    total: pageResult.total ?? 0,
    page: pageResult.page || query.page || 1,
    page_size: pageResult.page_size || query.page_size || defaultPageSize
  };
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

function toClassCourseValue(item: SelectedClassCourse): string {
  return `${item.class_id}:${item.course_id}`;
}

function toStartAt(value: string): string | undefined {
  return value ? `${value}T00:00:00+08:00` : undefined;
}

function toEndAt(value: string): string | undefined {
  return value ? `${value}T23:59:59+08:00` : undefined;
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found|资源不存在/i.test(message)) {
    return "班级学习接口暂不可用或班级课程不存在，请检查后端 /api/v1/analytics/class-practice-summary 服务与任课关系。";
  }
  if (/403|forbidden|无权限访问/i.test(message)) {
    return "当前账号无权查看该班级课程的学习数据。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "班级学习查询参数错误，请检查班级课程和时间范围。";
  }
  return message || "班级学习数据加载失败";
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
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

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
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
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 420px) minmax(180px, 240px) minmax(180px, 240px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const summaryStyle: CSSProperties = {
  margin: 0
};

const selectedCourseStyle: CSSProperties = {
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
