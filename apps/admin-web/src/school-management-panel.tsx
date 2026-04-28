import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { PageResult, School, SchoolInput, SchoolListQuery } from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface SchoolManagementApi {
  listSchools(query?: SchoolListQuery): Promise<PageResult<School>>;
  createSchool(body: SchoolInput): Promise<School>;
  disableSchool(id: number): Promise<boolean>;
  updateSchool?(id: number, body: SchoolInput): Promise<School>;
}

const defaultPageSize = 10;

const defaultSchoolForm: SchoolInput = {
  code: "",
  name: ""
};

const columns: Array<FixedActionListColumn<School>> = [
  {
    key: "name",
    title: "学校名称",
    render: (school) => school.name
  },
  {
    key: "code",
    title: "学校编码",
    render: (school) => school.code
  },
  {
    key: "status",
    title: "状态",
    width: 140,
    render: (school) => <span className={statusClassName(school.status)}>{formatStatusLabel(school.status)}</span>
  }
];

type ModalState =
  | { type: "create" }
  | { type: "detail"; school: School }
  | { type: "edit"; school: School }
  | null;

export function SchoolManagementPanel({ api }: { api: SchoolManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<SchoolInput>(defaultSchoolForm);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadSchools(buildSchoolQuery("", "", 1, defaultPageSize));
  }, [api]);

  async function loadSchools(query: SchoolListQuery = buildSchoolQuery(keyword, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listSchools(query);
      setSchools(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setSchools([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "学校数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadSchools(buildSchoolQuery(keyword, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setSelectedIDs([]);
    await loadSchools(buildSchoolQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadSchools(buildSchoolQuery(keyword, status, nextPage, pageSize));
  }

  function openCreateModal() {
    setForm(defaultSchoolForm);
    setModal({ type: "create" });
  }

  function openEditModal(school: School) {
    setForm({ code: school.code, name: school.name });
    setModal({ type: "edit", school });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultSchoolForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (modal?.type === "edit" && api.updateSchool) {
      await api.updateSchool(modal.school.id, form);
    } else {
      await api.createSchool(form);
    }

    closeModal();
    await loadSchools();
  }

  async function handleDelete(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }

    await Promise.all(ids.map((id) => api.disableSchool(id)));
    setSelectedIDs([]);
    await loadSchools();
  }

  function handleExport() {
    downloadCsv(
      "schools.csv",
      [
        { key: "name", title: "学校名称" },
        { key: "code", title: "学校编码" },
        { key: "status", title: "状态" }
      ],
      schools
    );
  }

  return (
    <section aria-label="学校管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="学校数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="学校数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="school_filter_keyword">关键字 keyword</label>
            <input
              id="school_filter_keyword"
              placeholder="输入学校名称或编码"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="school_filter_status">状态 status</label>
            <select id="school_filter_status" value={status} onChange={(event) => setStatus(event.target.value)}>
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
          rows={schools}
          columns={columns}
          getRowId={(school) => school.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onDelete={(rowIds) => void handleDelete(rowIds)}
          onExport={handleExport}
          onDetail={(school) => setModal({ type: "detail", school })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight={420}
          emptyText={loading ? "数据加载中..." : "暂无学校数据"}
          ariaLabel="学校列表"
          rowCheckboxLabel={(school) => `选择学校-${school.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="学校管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>学校详情</h3>
                    <p>{modal.school.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>学校名称</dt>
                      <dd>{modal.school.name}</dd>
                    </div>
                    <div>
                      <dt>学校编码</dt>
                      <dd>{modal.school.code}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.school.status)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.school)}>
                    编辑
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增学校" : "编辑学校"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_code">学校编码</label>
                        <input
                          id="school_code"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_name">学校名称</label>
                        <input
                          id="school_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增学校" : "保存修改"}
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

function buildSchoolQuery(keyword: string, status: string, page: number, pageSize: number): SchoolListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "学校列表接口暂不可用，请检查后端 /api/v1/schools 服务是否已启动。";
  }
  return message || "学校数据加载失败";
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
  height: "100%",
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
