import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { Grade, GradeInput, GradeListQuery, PageResult, School, SchoolListQuery } from "@aios/api-sdk";
import {
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface GradeManagementApi {
  listSchools(query?: SchoolListQuery): Promise<PageResult<School>>;
  listGrades(query?: GradeListQuery): Promise<PageResult<Grade>>;
  createGrade(body: GradeInput): Promise<Grade>;
  disableGrade(id: number): Promise<boolean>;
  updateGrade?(id: number, body: GradeInput): Promise<Grade>;
}

const defaultPageSize = 10;

const defaultGradeForm = {
  school_id: "",
  code: "",
  name: "",
  grade_level: "",
  school_year: ""
};

type GradeFormState = typeof defaultGradeForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; grade: Grade }
  | { type: "edit"; grade: Grade }
  | null;

export function GradeManagementPanel({ api }: { api: GradeManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [schoolID, setSchoolID] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<GradeFormState>(defaultGradeForm);
  const didLoadRef = useRef(false);

  const schoolNameMap = useMemo(() => new Map(schools.map((school) => [school.id, school.name])), [schools]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo<Array<FixedActionListColumn<Grade>>>(
    () => [
      {
        key: "name",
        title: "年级名称",
        render: (grade) => grade.name
      },
      {
        key: "code",
        title: "年级编码",
        render: (grade) => grade.code
      },
      {
        key: "school",
        title: "所属学校",
        render: (grade) => schoolNameMap.get(grade.school_id) ?? `学校-${grade.school_id}`
      },
      {
        key: "grade_level",
        title: "年级序号",
        width: 120,
        render: (grade) => grade.grade_level
      },
      {
        key: "school_year",
        title: "学年",
        width: 120,
        render: (grade) => grade.school_year || "-"
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (grade) => <span className={statusClassName(grade.status)}>{formatStatusLabel(grade.status)}</span>
      }
    ],
    [schoolNameMap]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildGradeQuery("", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query: GradeListQuery = buildGradeQuery(schoolID, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [schoolResult, gradeResult] = await Promise.all([
        api.listSchools({ page: 1, page_size: 100 }),
        api.listGrades(query)
      ]);
      setSchools(schoolResult.items);
      setGrades(gradeResult.items);
      setTotal(gradeResult.total);
      setPage(gradeResult.page || query.page || 1);
      setPageSize(gradeResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setGrades([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "年级数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildGradeQuery(schoolID, status, 1, pageSize));
  }

  async function handleReset() {
    setSchoolID("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildGradeQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadPage(buildGradeQuery(schoolID, status, nextPage, pageSize));
  }

  function openCreateModal() {
    setForm(defaultGradeForm);
    setModal({ type: "create" });
  }

  function openEditModal(grade: Grade) {
    setForm({
      school_id: String(grade.school_id),
      code: grade.code,
      name: grade.name,
      grade_level: String(grade.grade_level),
      school_year: grade.school_year ?? ""
    });
    setModal({ type: "edit", grade });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultGradeForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body: GradeInput = {
      school_id: Number(form.school_id),
      code: form.code,
      name: form.name,
      grade_level: Number(form.grade_level),
      school_year: form.school_year || undefined
    };

    if (modal?.type === "edit" && api.updateGrade) {
      await api.updateGrade(modal.grade.id, body);
    } else {
      await api.createGrade(body);
    }

    closeModal();
    await loadPage();
  }

  async function handleDelete(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }

    await Promise.all(ids.map((id) => api.disableGrade(id)));
    setSelectedIDs([]);
    await loadPage();
  }

  function handleExport() {
    downloadCsv(
      "grades.csv",
      [
        { key: "name", title: "年级名称" },
        { key: "code", title: "年级编码" },
        { key: "school_name", title: "所属学校" },
        { key: "grade_level", title: "年级序号" },
        { key: "school_year", title: "学年" },
        { key: "status", title: "状态" }
      ],
      grades.map((grade) => ({
        ...grade,
        school_name: schoolNameMap.get(grade.school_id) ?? `学校-${grade.school_id}`
      }))
    );
  }

  return (
    <section aria-label="年级管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="年级数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="年级数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterSelect id="grade_filter_school_id" label="所属学校" placeholder="请选择所属学校" value={schoolID} onChange={setSchoolID}>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="grade_filter_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
              <option value="inactive">停用</option>
          </ClearableFilterSelect>
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
          rows={grades}
          columns={columns}
          getRowId={(grade) => grade.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onDelete={(rowIds) => void handleDelete(rowIds)}
          onExport={handleExport}
          onDetail={(grade) => setModal({ type: "detail", grade })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无年级数据"}
          ariaLabel="年级列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(grade) => `选择年级-${grade.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="年级管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>年级详情</h3>
                    <p>{modal.grade.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>年级名称</dt>
                      <dd>{modal.grade.name}</dd>
                    </div>
                    <div>
                      <dt>年级编码</dt>
                      <dd>{modal.grade.code}</dd>
                    </div>
                    <div>
                      <dt>所属学校</dt>
                      <dd>{schoolNameMap.get(modal.grade.school_id) ?? `学校-${modal.grade.school_id}`}</dd>
                    </div>
                    <div>
                      <dt>年级序号</dt>
                      <dd>{modal.grade.grade_level}</dd>
                    </div>
                    <div>
                      <dt>学年</dt>
                      <dd>{modal.grade.school_year || "-"}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.grade.status)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.grade)}>
                    编辑
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增年级" : "编辑年级"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="grade_school_id">所属学校</label>
                        <select
                          id="grade_school_id"
                          value={form.school_id}
                          onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value }))}
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
                        <label htmlFor="grade_code">年级编码</label>
                        <input
                          id="grade_code"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="grade_name">年级名称</label>
                        <input
                          id="grade_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="grade_level">年级序号</label>
                        <input
                          id="grade_level"
                          type="number"
                          value={form.grade_level}
                          onChange={(event) => setForm((current) => ({ ...current, grade_level: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_year">学年</label>
                        <input
                          id="school_year"
                          value={form.school_year}
                          onChange={(event) => setForm((current) => ({ ...current, school_year: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增年级" : "保存修改"}
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

function buildGradeQuery(schoolID: string, status: string, page: number, pageSize: number): GradeListQuery {
  return {
    school_id: schoolID ? Number(schoolID) : undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "年级列表接口暂不可用，请检查后端 /api/v1/grades 服务是否已启动。";
  }
  return message || "年级数据加载失败";
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
  gridTemplateColumns: "minmax(240px, 360px) minmax(220px, 320px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
