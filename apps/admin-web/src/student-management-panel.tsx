import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { ClassItem, ClassListQuery, PageResult, School, SchoolListQuery } from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn
} from "@aios/ui-web";

export interface StudentManagementApi {
  get?<TData>(path: string): Promise<TData>;
  post?<TData, TBody = unknown>(path: string, body?: TBody): Promise<TData>;
  listSchools?(query?: SchoolListQuery): Promise<PageResult<School>>;
  listClasses?(query?: ClassListQuery): Promise<PageResult<ClassItem>>;
}

export interface StudentEntity {
  id: number;
  tenant_id: number;
  code: string;
  user_id: number;
  username: string;
  display_name: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  school_id: number;
  student_no?: string;
  enrollment_status: string;
  status: string;
  initial_password?: string;
  must_change_password?: boolean;
  created_at?: string;
}

interface StudentInput {
  code?: string;
  username?: string;
  display_name: string;
  phone?: string;
  email?: string;
  school_id: number;
  class_id?: number;
  student_no?: string;
  entered_at?: string;
}

const defaultPageSize = 10;

const defaultForm = {
  code: "",
  username: "",
  display_name: "",
  phone: "",
  email: "",
  school_id: "",
  class_id: "",
  student_no: "",
  entered_at: ""
};

type StudentFormState = typeof defaultForm;

export function StudentManagementPanel({ api }: { api: StudentManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentEntity[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [schoolID, setSchoolID] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState<StudentFormState>(defaultForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; title: string; description: string } | null>(null);
  const didLoadRef = useRef(false);

  const schoolMap = useMemo(() => new Map(schools.map((school) => [school.id, school.name])), [schools]);
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo<Array<FixedActionListColumn<StudentEntity>>>(
    () => [
      { key: "display_name", title: "学生姓名", render: (student) => student.display_name },
      { key: "student_no", title: "学号", render: (student) => student.student_no || "-" },
      { key: "username", title: "登录账号", render: (student) => student.username },
      { key: "school", title: "所属学校", render: (student) => schoolMap.get(student.school_id) ?? `学校-${student.school_id}` },
      { key: "status", title: "状态", width: 120, render: (student) => <span className={statusClassName(student.status)}>{formatStatus(student.status)}</span> },
      { key: "contact", title: "联系方式", render: (student) => formatContact(student) }
    ],
    [schoolMap]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildQuery("", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query = buildQuery(keyword, schoolID, status, page, pageSize)) {
    setLoading(true);
    try {
      if (!api.get) {
        throw new Error("当前 API 客户端不支持学生管理接口调用。");
      }
      const [studentResult, schoolResult, classResult] = await Promise.all([
        api.get<PageResult<StudentEntity>>(`/students${toQueryString(query)}`),
        api.listSchools ? api.listSchools({ page: 1, page_size: 200 }) : Promise.resolve({ items: [], page: 1, page_size: 200, total: 0 }),
        api.listClasses ? api.listClasses({ page: 1, page_size: 500 }) : Promise.resolve({ items: [], page: 1, page_size: 500, total: 0 })
      ]);
      setStudents(studentResult.items);
      setSchools(schoolResult.items);
      setClasses(classResult.items);
      setTotal(studentResult.total);
      setPage(studentResult.page || query.page || 1);
      setPageSize(studentResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setStudents([]);
      setTotal(0);
      setNotice({ tone: "danger", title: "学生数据加载失败", description: error instanceof Error ? error.message : "学生数据加载失败" });
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadPage(buildQuery(keyword, schoolID, status, 1, pageSize));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api.post) {
      setNotice({ tone: "danger", title: "创建失败", description: "当前 API 客户端不支持学生创建接口。" });
      return;
    }
    try {
      const created = await api.post<StudentEntity, StudentInput>("/students", buildStudentPayload(form));
      setNotice({
        tone: "success",
        title: "学生已创建",
        description: `登录账号：${created.username}。一次性密码：${created.initial_password || "请从响应中查看"}`
      });
      setForm(defaultForm);
      setModalOpen(false);
      await loadPage(buildQuery(keyword, schoolID, status, 1, pageSize));
    } catch (error) {
      setNotice({ tone: "danger", title: "创建失败", description: error instanceof Error ? error.message : "学生创建失败" });
    }
  }

  return (
    <section aria-label="学生管理" className="ui-admin-page" style={pageStyle}>
      {notice ? <ToastNotice tone={notice.tone} title={notice.title} description={notice.description} onClose={() => setNotice(null)} durationMs={notice.tone === "success" ? 0 : 3600} /> : null}
      <section className="ui-admin-card" aria-label="学生数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="student_keyword" label="关键字" placeholder="姓名、学号、账号、手机号" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="student_school" label="学校" placeholder="全部学校" value={schoolID} onChange={setSchoolID}>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="student_status" label="状态" placeholder="全部状态" value={status} onChange={setStatus}>
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </ClearableFilterSelect>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>{loading ? "查询中" : "查询"}</button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => { setKeyword(""); setSchoolID(""); setStatus(""); void loadPage(buildQuery("", "", "", 1, defaultPageSize)); }} disabled={loading}>重置</button>
          </div>
        </form>
        <FixedActionList
          rows={students}
          columns={columns}
          getRowId={(student) => student.id}
          selectedRowIds={[]}
          onSelectionChange={() => undefined}
          onCreate={() => setModalOpen(true)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void loadPage(buildQuery(keyword, schoolID, status, nextPage, pageSize))}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无学生数据"}
          ariaLabel="学生列表"
          createLabel="新增学生"
          rowCheckboxLabel={(student) => `选择学生-${student.display_name}`}
        />
      </section>
      {modalOpen ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="新增学生">
            <div className="ui-admin-modal__header">
              <div><h3>新增学生</h3><p>创建学生实体并自动生成登录账号</p></div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setModalOpen(false)}>关闭</button>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)}>
              <div className="ui-admin-modal__body">
                <div className="ui-admin-form__grid">
                  <Field label="学生姓名" id="student_name"><input id="student_name" value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} /></Field>
                  <Field label="登录账号" id="student_username"><input id="student_username" placeholder="为空时使用学号/编码" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /></Field>
                  <Field label="学生编码" id="student_code"><input id="student_code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></Field>
                  <Field label="学号" id="student_no"><input id="student_no" value={form.student_no} onChange={(event) => setForm((current) => ({ ...current, student_no: event.target.value }))} /></Field>
                  <Field label="学校" id="student_form_school"><select id="student_form_school" value={form.school_id} onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value, class_id: "" }))}><option value="">请选择学校</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></Field>
                  <Field label="班级" id="student_form_class"><select id="student_form_class" value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))}><option value="">暂不分班</option>{classes.filter((item) => !form.school_id || item.school_id === Number(form.school_id)).map((item) => <option key={item.id} value={item.id}>{classMap.get(item.id) ?? item.name}</option>)}</select></Field>
                  <Field label="手机号" id="student_phone"><input id="student_phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
                  <Field label="邮箱" id="student_email"><input id="student_email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                  <Field label="入学时间" id="student_entered_at"><input id="student_entered_at" type="date" value={form.entered_at} onChange={(event) => setForm((current) => ({ ...current, entered_at: event.target.value }))} /></Field>
                </div>
              </div>
              <div className="ui-admin-modal__footer">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => setModalOpen(false)}>取消</button>
                <button type="submit" className="ui-button ui-button--primary">创建学生</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="ui-admin-form__field"><label htmlFor={id}>{label}</label>{children}</div>;
}

function buildQuery(keyword: string, schoolID: string, status: string, page: number, pageSize: number) {
  return { keyword: keyword.trim() || undefined, school_id: schoolID ? Number(schoolID) : undefined, status: status || undefined, page, page_size: pageSize };
}

function buildStudentPayload(form: StudentFormState): StudentInput {
  return {
    code: form.code || undefined,
    username: form.username || undefined,
    display_name: form.display_name,
    phone: form.phone || undefined,
    email: form.email || undefined,
    school_id: Number(form.school_id),
    class_id: form.class_id ? Number(form.class_id) : undefined,
    student_no: form.student_no || undefined,
    entered_at: form.entered_at ? new Date(`${form.entered_at}T00:00:00`).toISOString() : undefined
  };
}

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

function formatStatus(status: string): string {
  return status === "active" ? "启用" : status === "disabled" ? "禁用" : status || "-";
}

function statusClassName(status: string): string {
  return status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--disabled";
}

function formatContact(student: StudentEntity): string {
  return [student.phone, student.email].filter(Boolean).join(" / ") || "-";
}

const pageStyle: CSSProperties = { minHeight: "100%", gap: 0 };
const dataRegionStyle: CSSProperties = { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 14, minHeight: "100%", padding: 22 };
const filterFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) minmax(180px, 1fr) minmax(160px, .8fr) auto", alignItems: "end", gap: 14, margin: 0 };
const queryActionsStyle: CSSProperties = { alignItems: "center", paddingBottom: 1, whiteSpace: "nowrap" };
