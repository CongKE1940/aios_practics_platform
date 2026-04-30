import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { Course, CourseInput, CourseListQuery, PageResult } from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface CourseManagementApi {
  listCourses(query?: CourseListQuery): Promise<PageResult<Course>>;
  createCourse(body: CourseInput): Promise<Course>;
  disableCourse(id: number): Promise<boolean>;
  updateCourse?(id: number, body: CourseInput): Promise<Course>;
}

const defaultPageSize = 10;

const defaultCourseForm = {
  code: "",
  name: "",
  start_at: "",
  end_at: "",
  description: ""
};

type CourseFormState = typeof defaultCourseForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; course: Course }
  | { type: "edit"; course: Course }
  | null;

const columns: Array<FixedActionListColumn<Course>> = [
  {
    key: "name",
    title: "课程名称",
    render: (course) => course.name
  },
  {
    key: "code",
    title: "课程编码",
    render: (course) => course.code
  },
  {
    key: "start_at",
    title: "开始时间",
    width: 160,
    render: (course) => formatDateTime(course.start_at)
  },
  {
    key: "end_at",
    title: "结束时间",
    width: 160,
    render: (course) => formatDateTime(course.end_at)
  },
  {
    key: "status",
    title: "状态",
    width: 120,
    render: (course) => <span className={statusClassName(course.status)}>{formatStatusLabel(course.status)}</span>
  },
  {
    key: "description",
    title: "描述",
    render: (course) => course.description || "-"
  }
];

export function CourseManagementPanel({ api }: { api: CourseManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [activeAt, setActiveAt] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<CourseFormState>(defaultCourseForm);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildCourseQuery("", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query: CourseListQuery = buildCourseQuery(keyword, status, activeAt, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listCourses(query);
      setCourses(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setCourses([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "课程数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildCourseQuery(keyword, status, activeAt, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setActiveAt("");
    setSelectedIDs([]);
    await loadPage(buildCourseQuery("", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadPage(buildCourseQuery(keyword, status, activeAt, nextPage, pageSize));
  }

  function openCreateModal() {
    setForm(defaultCourseForm);
    setModal({ type: "create" });
  }

  function openEditModal(course: Course) {
    setForm({
      code: course.code,
      name: course.name,
      start_at: toDateTimeLocalValue(course.start_at),
      end_at: toDateTimeLocalValue(course.end_at),
      description: course.description ?? ""
    });
    setModal({ type: "edit", course });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultCourseForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body: CourseInput = {
      code: form.code,
      name: form.name,
      start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      description: form.description || null
    };

    if (modal?.type === "edit" && api.updateCourse) {
      await api.updateCourse(modal.course.id, body);
    } else {
      await api.createCourse(body);
    }

    closeModal();
    await loadPage();
  }

  async function handleDelete(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }

    await Promise.all(ids.map((id) => api.disableCourse(id)));
    setSelectedIDs([]);
    await loadPage();
  }

  function handleExport() {
    downloadCsv(
      "courses.csv",
      [
        { key: "name", title: "课程名称" },
        { key: "code", title: "课程编码" },
        { key: "start_at_label", title: "开始时间" },
        { key: "end_at_label", title: "结束时间" },
        { key: "status", title: "状态" },
        { key: "description", title: "描述" }
      ],
      courses.map((course) => ({
        ...course,
        start_at_label: formatDateTime(course.start_at),
        end_at_label: formatDateTime(course.end_at),
        description: course.description ?? ""
      }))
    );
  }

  return (
    <section aria-label="课程管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="课程数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="课程数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="course_filter_keyword" label="关键字" placeholder="输入课程名称或编码" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="course_filter_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
              <option value="inactive">停用</option>
          </ClearableFilterSelect>
          <ClearableFilterInput id="course_filter_active_at" label="生效时间" type="datetime-local" value={activeAt} onChange={setActiveAt} />
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleReset()} disabled={loading}>
              重置
            </button>
          </div>
        </form>

        <FixedActionList
          rows={courses}
          columns={columns}
          getRowId={(course) => course.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onDelete={(rowIds) => void handleDelete(rowIds)}
          onExport={handleExport}
          onDetail={(course) => setModal({ type: "detail", course })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无课程数据"}
          ariaLabel="课程列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(course) => `选择课程-${course.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="课程管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>课程详情</h3>
                    <p>{modal.course.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>课程名称</dt>
                      <dd>{modal.course.name}</dd>
                    </div>
                    <div>
                      <dt>课程编码</dt>
                      <dd>{modal.course.code}</dd>
                    </div>
                    <div>
                      <dt>开始时间</dt>
                      <dd>{formatDateTime(modal.course.start_at)}</dd>
                    </div>
                    <div>
                      <dt>结束时间</dt>
                      <dd>{formatDateTime(modal.course.end_at)}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.course.status)}</dd>
                    </div>
                    <div>
                      <dt>描述</dt>
                      <dd>{modal.course.description || "-"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.course)}>
                    编辑
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增课程" : "编辑课程"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="course_code">课程编码</label>
                        <input
                          id="course_code"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="course_name">课程名称</label>
                        <input
                          id="course_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="course_start_at">开始时间</label>
                        <input
                          id="course_start_at"
                          type="datetime-local"
                          value={form.start_at}
                          onChange={(event) => setForm((current) => ({ ...current, start_at: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="course_end_at">结束时间</label>
                        <input
                          id="course_end_at"
                          type="datetime-local"
                          value={form.end_at}
                          onChange={(event) => setForm((current) => ({ ...current, end_at: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="course_description">描述</label>
                        <textarea
                          id="course_description"
                          value={form.description}
                          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增课程" : "保存修改"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildCourseQuery(keyword: string, status: string, activeAt: string, page: number, pageSize: number): CourseListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    ...(activeAt ? { active_at: new Date(activeAt).toISOString() } : {}),
    page,
    page_size: pageSize
  } as CourseListQuery;
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "课程列表接口暂不可用，请检查后端 /api/v1/courses 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "课程查询参数错误，请检查生效时间格式。";
  }
  return message || "课程数据加载失败";
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function statusClassName(status: string): string {
  if (["active", "published", "enabled"].includes(status)) {
    return "ui-admin-status ui-admin-status--active";
  }
  if (["disabled", "inactive"].includes(status)) {
    return "ui-admin-status ui-admin-status--disabled";
  }
  return "ui-admin-status ui-admin-status--draft";
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "禁用";
    case "inactive":
      return "停用";
    default:
      return status;
  }
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
};

const dataRegionStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 320px) minmax(180px, 240px) minmax(220px, 280px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
