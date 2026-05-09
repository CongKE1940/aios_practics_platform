import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { PageResult, School, SchoolListQuery } from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn
} from "@aios/ui-web";

export interface TeacherManagementApi {
  get?<TData>(path: string): Promise<TData>;
  post?<TData, TBody = unknown>(path: string, body?: TBody): Promise<TData>;
  listSchools?(query?: SchoolListQuery): Promise<PageResult<School>>;
}

export interface TeacherEntity {
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
  teacher_no?: string;
  employment_status: string;
  status: string;
  initial_password?: string;
  must_change_password?: boolean;
  created_at?: string;
}

interface TeacherInput {
  code?: string;
  username?: string;
  display_name: string;
  phone?: string;
  email?: string;
  school_id: number;
  teacher_no?: string;
  hired_at?: string;
}

const defaultPageSize = 10;

const defaultForm = {
  code: "",
  username: "",
  display_name: "",
  phone: "",
  email: "",
  school_id: "",
  teacher_no: "",
  hired_at: ""
};

type TeacherFormState = typeof defaultForm;

export function TeacherManagementPanel({ api }: { api: TeacherManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherEntity[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [keyword, setKeyword] = useState("");
  const [schoolID, setSchoolID] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState<TeacherFormState>(defaultForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; title: string; description: string } | null>(null);
  const didLoadRef = useRef(false);

  const schoolMap = useMemo(() => new Map(schools.map((school) => [school.id, school.name])), [schools]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo<Array<FixedActionListColumn<TeacherEntity>>>(
    () => [
      { key: "display_name", title: "教师姓名", render: (teacher) => teacher.display_name },
      { key: "teacher_no", title: "工号", render: (teacher) => teacher.teacher_no || "-" },
      { key: "username", title: "登录账号", render: (teacher) => teacher.username },
      { key: "school", title: "所属学校", render: (teacher) => schoolMap.get(teacher.school_id) ?? `学校-${teacher.school_id}` },
      { key: "status", title: "状态", width: 120, render: (teacher) => <span className={statusClassName(teacher.status)}>{formatStatus(teacher.status)}</span> },
      { key: "contact", title: "联系方式", render: (teacher) => formatContact(teacher) }
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
        throw new Error("当前 API 客户端不支持教师管理接口调用。");
      }
      const [teacherResult, schoolResult] = await Promise.all([
        api.get<PageResult<TeacherEntity>>(`/teachers${toQueryString(query)}`),
        api.listSchools ? api.listSchools({ page: 1, page_size: 200 }) : Promise.resolve({ items: [], page: 1, page_size: 200, total: 0 })
      ]);
      setTeachers(teacherResult.items);
      setSchools(schoolResult.items);
      setTotal(teacherResult.total);
      setPage(teacherResult.page || query.page || 1);
      setPageSize(teacherResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setTeachers([]);
      setTotal(0);
      setNotice({ tone: "danger", title: "教师数据加载失败", description: error instanceof Error ? error.message : "教师数据加载失败" });
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
      setNotice({ tone: "danger", title: "创建失败", description: "当前 API 客户端不支持教师创建接口。" });
      return;
    }
    try {
      const created = await api.post<TeacherEntity, TeacherInput>("/teachers", buildTeacherPayload(form));
      setNotice({
        tone: "success",
        title: "教师已创建",
        description: `登录账号：${created.username}。一次性密码：${created.initial_password || "请从响应中查看"}`
      });
      setForm(defaultForm);
      setModalOpen(false);
      await loadPage(buildQuery(keyword, schoolID, status, 1, pageSize));
    } catch (error) {
      setNotice({ tone: "danger", title: "创建失败", description: error instanceof Error ? error.message : "教师创建失败" });
    }
  }

  return (
    <section aria-label="教师管理" className="ui-admin-page" style={pageStyle}>
      {notice ? <ToastNotice tone={notice.tone} title={notice.title} description={notice.description} onClose={() => setNotice(null)} durationMs={notice.tone === "success" ? 0 : 3600} /> : null}
      <section className="ui-admin-card" aria-label="教师数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="teacher_keyword" label="关键字" placeholder="姓名、工号、账号、手机号" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="teacher_school" label="学校" placeholder="全部学校" value={schoolID} onChange={setSchoolID}>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="teacher_status" label="状态" placeholder="全部状态" value={status} onChange={setStatus}>
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </ClearableFilterSelect>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>{loading ? "查询中" : "查询"}</button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => { setKeyword(""); setSchoolID(""); setStatus(""); void loadPage(buildQuery("", "", "", 1, defaultPageSize)); }} disabled={loading}>重置</button>
          </div>
        </form>
        <FixedActionList
          rows={teachers}
          columns={columns}
          getRowId={(teacher) => teacher.id}
          selectedRowIds={[]}
          onSelectionChange={() => undefined}
          onCreate={() => setModalOpen(true)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void loadPage(buildQuery(keyword, schoolID, status, nextPage, pageSize))}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无教师数据"}
          ariaLabel="教师列表"
          createLabel="新增教师"
          rowCheckboxLabel={(teacher) => `选择教师-${teacher.display_name}`}
        />
      </section>
      {modalOpen ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="新增教师">
            <div className="ui-admin-modal__header">
              <div><h3>新增教师</h3><p>创建教师实体并自动生成登录账号</p></div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setModalOpen(false)}>关闭</button>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)}>
              <div className="ui-admin-modal__body">
                <div className="ui-admin-form__grid">
                  <Field label="教师姓名" id="teacher_name"><input id="teacher_name" value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} /></Field>
                  <Field label="登录账号" id="teacher_username"><input id="teacher_username" placeholder="为空时使用工号/编码" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /></Field>
                  <Field label="教师编码" id="teacher_code"><input id="teacher_code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></Field>
                  <Field label="工号" id="teacher_no"><input id="teacher_no" value={form.teacher_no} onChange={(event) => setForm((current) => ({ ...current, teacher_no: event.target.value }))} /></Field>
                  <Field label="学校" id="teacher_form_school"><select id="teacher_form_school" value={form.school_id} onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value }))}><option value="">请选择学校</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></Field>
                  <Field label="手机号" id="teacher_phone"><input id="teacher_phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
                  <Field label="邮箱" id="teacher_email"><input id="teacher_email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                  <Field label="入职时间" id="teacher_hired_at"><input id="teacher_hired_at" type="date" value={form.hired_at} onChange={(event) => setForm((current) => ({ ...current, hired_at: event.target.value }))} /></Field>
                </div>
              </div>
              <div className="ui-admin-modal__footer">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => setModalOpen(false)}>取消</button>
                <button type="submit" className="ui-button ui-button--primary">创建教师</button>
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

function buildTeacherPayload(form: TeacherFormState): TeacherInput {
  return {
    code: form.code || undefined,
    username: form.username || undefined,
    display_name: form.display_name,
    phone: form.phone || undefined,
    email: form.email || undefined,
    school_id: Number(form.school_id),
    teacher_no: form.teacher_no || undefined,
    hired_at: form.hired_at ? new Date(`${form.hired_at}T00:00:00`).toISOString() : undefined
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

function formatContact(teacher: TeacherEntity): string {
  return [teacher.phone, teacher.email].filter(Boolean).join(" / ") || "-";
}

const pageStyle: CSSProperties = { minHeight: "100%", gap: 0 };
const dataRegionStyle: CSSProperties = { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 14, minHeight: "100%", padding: 22 };
const filterFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) minmax(180px, 1fr) minmax(160px, .8fr) auto", alignItems: "end", gap: 14, margin: 0 };
const queryActionsStyle: CSSProperties = { alignItems: "center", paddingBottom: 1, whiteSpace: "nowrap" };
