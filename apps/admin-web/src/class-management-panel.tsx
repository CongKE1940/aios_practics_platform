import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  ClassInput,
  ClassItem,
  ClassListQuery,
  Grade,
  GradeListQuery,
  PageResult,
  School,
  SchoolListQuery
} from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface ClassManagementApi {
  listSchools(query?: SchoolListQuery): Promise<PageResult<School>>;
  listGrades(query?: GradeListQuery): Promise<PageResult<Grade>>;
  listClasses(query?: ClassListQuery): Promise<PageResult<ClassItem>>;
  createClass(body: ClassInput): Promise<ClassItem>;
  disableClass(id: number): Promise<boolean>;
  updateClass?(id: number, body: ClassInput): Promise<ClassItem>;
}

const defaultPageSize = 10;

const defaultClassForm = {
  school_id: "",
  grade_id: "",
  code: "",
  name: "",
  class_no: ""
};

type ClassFormState = typeof defaultClassForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; classItem: ClassItem }
  | { type: "edit"; classItem: ClassItem }
  | null;

export function ClassManagementPanel({ api }: { api: ClassManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [total, setTotal] = useState(0);
  const [schoolID, setSchoolID] = useState("");
  const [gradeID, setGradeID] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<ClassFormState>(defaultClassForm);
  const didLoadRef = useRef(false);

  const schoolNameMap = useMemo(() => new Map(schools.map((school) => [school.id, school.name])), [schools]);
  const gradeNameMap = useMemo(() => new Map(grades.map((grade) => [grade.id, grade.name])), [grades]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const filterGrades = useMemo(
    () => grades.filter((grade) => !schoolID || String(grade.school_id) === schoolID),
    [grades, schoolID]
  );
  const formGrades = useMemo(
    () => grades.filter((grade) => !form.school_id || String(grade.school_id) === form.school_id),
    [form.school_id, grades]
  );
  const columns = useMemo<Array<FixedActionListColumn<ClassItem>>>(
    () => [
      {
        key: "name",
        title: "班级名称",
        render: (classItem) => classItem.name
      },
      {
        key: "code",
        title: "班级编码",
        render: (classItem) => classItem.code
      },
      {
        key: "school",
        title: "所属学校",
        render: (classItem) => schoolNameMap.get(classItem.school_id) ?? `学校-${classItem.school_id}`
      },
      {
        key: "grade",
        title: "所属年级",
        render: (classItem) => gradeNameMap.get(classItem.grade_id) ?? `年级-${classItem.grade_id}`
      },
      {
        key: "class_no",
        title: "班号",
        width: 100,
        render: (classItem) => classItem.class_no ?? "-"
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (classItem) => <span className={statusClassName(classItem.status)}>{formatStatusLabel(classItem.status)}</span>
      }
    ],
    [gradeNameMap, schoolNameMap]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildClassQuery("", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query: ClassListQuery = buildClassQuery(schoolID, gradeID, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [schoolResult, gradeResult, classResult] = await Promise.all([
        api.listSchools({ page: 1, page_size: 100 }),
        api.listGrades({ page: 1, page_size: 100 }),
        api.listClasses(query)
      ]);
      setSchools(schoolResult.items);
      setGrades(gradeResult.items);
      setClasses(classResult.items);
      setTotal(classResult.total);
      setPage(classResult.page || query.page || 1);
      setPageSize(classResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setClasses([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "班级数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildClassQuery(schoolID, gradeID, status, 1, pageSize));
  }

  async function handleReset() {
    setSchoolID("");
    setGradeID("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildClassQuery("", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadPage(buildClassQuery(schoolID, gradeID, status, nextPage, pageSize));
  }

  function handleSchoolFilterChange(nextSchoolID: string) {
    setSchoolID(nextSchoolID);
    if (gradeID && grades.some((grade) => String(grade.id) === gradeID && String(grade.school_id) !== nextSchoolID)) {
      setGradeID("");
    }
  }

  function openCreateModal() {
    setForm(defaultClassForm);
    setModal({ type: "create" });
  }

  function openEditModal(classItem: ClassItem) {
    setForm({
      school_id: String(classItem.school_id),
      grade_id: String(classItem.grade_id),
      code: classItem.code,
      name: classItem.name,
      class_no: classItem.class_no == null ? "" : String(classItem.class_no)
    });
    setModal({ type: "edit", classItem });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultClassForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body: ClassInput = {
      school_id: Number(form.school_id),
      grade_id: Number(form.grade_id),
      code: form.code,
      name: form.name,
      class_no: form.class_no ? Number(form.class_no) : undefined
    };

    if (modal?.type === "edit" && api.updateClass) {
      await api.updateClass(modal.classItem.id, body);
    } else {
      await api.createClass(body);
    }

    closeModal();
    await loadPage();
  }

  async function handleDelete(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }

    await Promise.all(ids.map((id) => api.disableClass(id)));
    setSelectedIDs([]);
    await loadPage();
  }

  function handleExport() {
    downloadCsv(
      "classes.csv",
      [
        { key: "name", title: "班级名称" },
        { key: "code", title: "班级编码" },
        { key: "school_name", title: "所属学校" },
        { key: "grade_name", title: "所属年级" },
        { key: "class_no", title: "班号" },
        { key: "status", title: "状态" }
      ],
      classes.map((classItem) => ({
        ...classItem,
        school_name: schoolNameMap.get(classItem.school_id) ?? `学校-${classItem.school_id}`,
        grade_name: gradeNameMap.get(classItem.grade_id) ?? `年级-${classItem.grade_id}`,
        class_no: classItem.class_no ?? ""
      }))
    );
  }

  return (
    <section aria-label="班级管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="班级数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="班级数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="class_filter_school_id">所属学校 school_id</label>
            <select id="class_filter_school_id" value={schoolID} onChange={(event) => handleSchoolFilterChange(event.target.value)}>
              <option value="">全部学校</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="class_filter_grade_id">所属年级 grade_id</label>
            <select id="class_filter_grade_id" value={gradeID} onChange={(event) => setGradeID(event.target.value)}>
              <option value="">全部年级</option>
              {filterGrades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="class_filter_status">状态 status</label>
            <select id="class_filter_status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
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
          rows={classes}
          columns={columns}
          getRowId={(classItem) => classItem.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onDelete={(rowIds) => void handleDelete(rowIds)}
          onExport={handleExport}
          onDetail={(classItem) => setModal({ type: "detail", classItem })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无班级数据"}
          ariaLabel="班级列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(classItem) => `选择班级-${classItem.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="班级管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>班级详情</h3>
                    <p>{modal.classItem.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>班级名称</dt>
                      <dd>{modal.classItem.name}</dd>
                    </div>
                    <div>
                      <dt>班级编码</dt>
                      <dd>{modal.classItem.code}</dd>
                    </div>
                    <div>
                      <dt>所属学校</dt>
                      <dd>{schoolNameMap.get(modal.classItem.school_id) ?? `学校-${modal.classItem.school_id}`}</dd>
                    </div>
                    <div>
                      <dt>所属年级</dt>
                      <dd>{gradeNameMap.get(modal.classItem.grade_id) ?? `年级-${modal.classItem.grade_id}`}</dd>
                    </div>
                    <div>
                      <dt>班号</dt>
                      <dd>{modal.classItem.class_no ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.classItem.status)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.classItem)}>
                    编辑
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增班级" : "编辑班级"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="class_school_id">所属学校</label>
                        <select
                          id="class_school_id"
                          value={form.school_id}
                          onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value, grade_id: "" }))}
                        >
                          <option value="">请选择学校</option>
                          {schools.map((school) => (
                            <option key={school.id} value={school.id}>
                              {school.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="class_grade_id">所属年级</label>
                        <select
                          id="class_grade_id"
                          value={form.grade_id}
                          onChange={(event) => setForm((current) => ({ ...current, grade_id: event.target.value }))}
                        >
                          <option value="">请选择年级</option>
                          {formGrades.map((grade) => (
                            <option key={grade.id} value={grade.id}>
                              {grade.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="class_code">班级编码</label>
                        <input
                          id="class_code"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="class_name">班级名称</label>
                        <input
                          id="class_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="class_no">班号</label>
                        <input
                          id="class_no"
                          type="number"
                          value={form.class_no}
                          onChange={(event) => setForm((current) => ({ ...current, class_no: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增班级" : "保存修改"}
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

function buildClassQuery(schoolID: string, gradeID: string, status: string, page: number, pageSize: number): ClassListQuery {
  return {
    school_id: schoolID ? Number(schoolID) : undefined,
    grade_id: gradeID ? Number(gradeID) : undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "班级列表接口暂不可用，请检查后端 /api/v1/classes 服务是否已启动。";
  }
  return message || "班级数据加载失败";
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
  gridTemplateColumns: "minmax(220px, 300px) minmax(220px, 300px) minmax(180px, 240px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
