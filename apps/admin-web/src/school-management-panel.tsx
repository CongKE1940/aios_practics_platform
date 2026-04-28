import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { FileAsset, PageResult, School, SchoolInput, SchoolListQuery } from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface SchoolManagementApi {
  listSchools(query?: SchoolListQuery & { object_type?: string }): Promise<PageResult<School>>;
  createSchool(body: SchoolInput | SchoolFormState): Promise<School>;
  disableSchool(id: number): Promise<boolean>;
  updateSchool?(id: number, body: SchoolInput | SchoolFormState): Promise<School>;
  enableSchool?(id: number): Promise<boolean>;
  deleteSchool?(id: number): Promise<boolean>;
  uploadFile?(body: FormData): Promise<FileAsset>;
  post?<TData, TBody = unknown>(path: string, body?: TBody): Promise<TData>;
}

type SchoolObjectType = "school" | "organization";

type SchoolWithProfile = School & {
  object_type?: SchoolObjectType | string;
  english_name?: string | null;
  address?: string | null;
  logo_url?: string | null;
};

type SchoolFormState = {
  object_type: SchoolObjectType;
  name: string;
  english_name: string;
  address: string;
  logo_url: string;
};

const defaultPageSize = 10;
const defaultLogoDataUrl =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#e2e8f0"/><path d="M24 74V36l24-14 24 14v38" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 74V54h20v20" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );

const defaultSchoolForm: SchoolFormState = {
  object_type: "school",
  name: "",
  english_name: "",
  address: "",
  logo_url: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; school: SchoolWithProfile }
  | { type: "edit"; school: SchoolWithProfile }
  | null;

export function SchoolManagementPanel({ api }: { api: SchoolManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [schools, setSchools] = useState<SchoolWithProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [objectType, setObjectType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<SchoolFormState>(defaultSchoolForm);
  const didLoadRef = useRef(false);
  const currentUserType = useMemo(() => readCurrentUserType(), []);
  const isSystemAdmin = currentUserType === "sys_admin";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<Array<FixedActionListColumn<SchoolWithProfile>>>(
    () => [
      {
        key: "logo_url",
        title: "头像",
        width: 82,
        render: (school) => (
          <img
            src={school.logo_url || defaultLogoDataUrl}
            alt=""
            style={logoStyle}
            onError={(event) => {
              event.currentTarget.src = defaultLogoDataUrl;
            }}
          />
        )
      },
      {
        key: "object_type",
        title: "类型",
        width: 110,
        render: (school) => formatObjectType(school.object_type)
      },
      {
        key: "name",
        title: "名称",
        render: (school) => school.name
      },
      {
        key: "english_name",
        title: "英文名",
        render: (school) => school.english_name || "-"
      },
      {
        key: "code",
        title: "系统编码",
        width: 180,
        render: (school) => school.code
      },
      {
        key: "address",
        title: "地址",
        render: (school) => school.address || "-"
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (school) => <span className={statusClassName(school.status)}>{formatStatusLabel(school.status)}</span>
      }
    ],
    []
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadSchools(buildSchoolQuery("", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadSchools(query: SchoolListQuery & { object_type?: string } = buildSchoolQuery(keyword, status, objectType, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listSchools(query);
      setSchools(result.items as SchoolWithProfile[]);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setSchools([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "学校与组织数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadSchools(buildSchoolQuery(keyword, status, objectType, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setObjectType("");
    setSelectedIDs([]);
    await loadSchools(buildSchoolQuery("", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadSchools(buildSchoolQuery(keyword, status, objectType, nextPage, pageSize));
  }

  function openCreateModal() {
    setForm(defaultSchoolForm);
    setModal({ type: "create" });
  }

  function openEditModal(school: SchoolWithProfile) {
    setForm({
      object_type: normalizeSchoolObjectType(school.object_type),
      name: school.name,
      english_name: school.english_name ?? "",
      address: school.address ?? "",
      logo_url: school.logo_url ?? ""
    });
    setModal({ type: "edit", school });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultSchoolForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrorMessage("请填写名称。 ");
      return;
    }

    if (modal?.type === "edit" && api.updateSchool) {
      await api.updateSchool(modal.school.id, form);
    } else if (isSystemAdmin) {
      await api.createSchool(form);
    }

    closeModal();
    await loadSchools();
  }

  async function handleLogoFile(file: File | null) {
    if (!file) {
      return;
    }
    if (api.uploadFile) {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("usage", "school_logo");
      const uploaded = await api.uploadFile(payload);
      setForm((current) => ({ ...current, logo_url: uploaded.url ?? uploaded.original_url ?? current.logo_url }));
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, logo_url: dataUrl }));
  }

  async function handleDelete(rowIds: FixedActionListRowId[]) {
    if (!isSystemAdmin) {
      return;
    }
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }

    await Promise.all(ids.map((id) => deleteSchool(api, id)));
    setSelectedIDs([]);
    await loadSchools();
  }

  async function handleToggleStatus(school: SchoolWithProfile) {
    if (!isSystemAdmin) {
      return;
    }
    if (school.status === "active") {
      await api.disableSchool(school.id);
    } else {
      await enableSchool(api, school.id);
    }
    await loadSchools();
  }

  function handleExport() {
    downloadCsv(
      "schools_organizations.csv",
      [
        { key: "object_type_label", title: "类型" },
        { key: "name", title: "名称" },
        { key: "english_name", title: "英文名" },
        { key: "code", title: "系统编码" },
        { key: "address", title: "地址" },
        { key: "status_label", title: "状态" },
        { key: "logo_url", title: "校徽/头像" }
      ],
      schools.map((school) => ({
        ...school,
        object_type_label: formatObjectType(school.object_type),
        english_name: school.english_name ?? "",
        address: school.address ?? "",
        logo_url: school.logo_url ?? "",
        status_label: formatStatusLabel(school.status)
      }))
    );
  }

  return (
    <section aria-label="学校与组织管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="学校与组织数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="学校与组织数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="school_filter_keyword">关键字 keyword</label>
            <input
              id="school_filter_keyword"
              placeholder="输入名称、英文名、编码或地址"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="school_filter_type">类型 object_type</label>
            <select id="school_filter_type" value={objectType} onChange={(event) => setObjectType(event.target.value)}>
              <option value="">全部类型</option>
              <option value="school">学校</option>
              <option value="organization">组织</option>
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="school_filter_status">状态 status</label>
            <select id="school_filter_status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
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
          onSelectionChange={isSystemAdmin ? setSelectedIDs : undefined}
          onCreate={isSystemAdmin ? openCreateModal : undefined}
          onDelete={isSystemAdmin ? (rowIds) => void handleDelete(rowIds) : undefined}
          onExport={handleExport}
          onDetail={(school) => setModal({ type: "detail", school })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无学校与组织数据"}
          ariaLabel="学校与组织列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(school) => `选择${formatObjectType(school.object_type)}-${school.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="学校与组织管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{formatObjectType(modal.school.object_type)}详情</h3>
                    <p>{modal.school.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <div style={profileHeaderStyle}>
                    <img
                      src={modal.school.logo_url || defaultLogoDataUrl}
                      alt=""
                      style={profileLogoStyle}
                      onError={(event) => {
                        event.currentTarget.src = defaultLogoDataUrl;
                      }}
                    />
                    <dl className="ui-admin-meta-list" style={profileMetaStyle}>
                      <div>
                        <dt>类型</dt>
                        <dd>{formatObjectType(modal.school.object_type)}</dd>
                      </div>
                      <div>
                        <dt>名称</dt>
                        <dd>{modal.school.name}</dd>
                      </div>
                      <div>
                        <dt>英文名</dt>
                        <dd>{modal.school.english_name || "-"}</dd>
                      </div>
                      <div>
                        <dt>系统编码</dt>
                        <dd>{modal.school.code}</dd>
                      </div>
                      <div>
                        <dt>地址</dt>
                        <dd>{modal.school.address || "-"}</dd>
                      </div>
                      <div>
                        <dt>状态</dt>
                        <dd>{formatStatusLabel(modal.school.status)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="ui-admin-modal__footer">
                  {isSystemAdmin ? (
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleToggleStatus(modal.school)}>
                      {modal.school.status === "active" ? "停用" : "启用"}
                    </button>
                  ) : null}
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.school)}>
                    编辑基础信息
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增学校/组织" : "编辑基础信息"}</h3>
                    <p>{modal.type === "create" ? "编码由系统自动生成" : "编码不可手动修改"}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div style={logoUploadRowStyle}>
                      <img src={form.logo_url || defaultLogoDataUrl} alt="" style={profileLogoStyle} />
                      <div className="ui-admin-form__field" style={{ flex: 1 }}>
                        <label htmlFor="school_logo_file">校徽/头像</label>
                        <input id="school_logo_file" type="file" accept="image/*" onChange={(event) => void handleLogoFile(event.target.files?.[0] ?? null)} />
                        <small className="ui-admin-subtle">可为空；为空时系统展示默认图像。</small>
                      </div>
                    </div>
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_object_type">类型</label>
                        <select
                          id="school_object_type"
                          value={form.object_type}
                          disabled={!isSystemAdmin || modal.type === "edit"}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, object_type: normalizeSchoolObjectType(event.target.value) }))
                          }
                        >
                          <option value="school">学校</option>
                          <option value="organization">组织</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_name">名称</label>
                        <input
                          id="school_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_english_name">英文名</label>
                        <input
                          id="school_english_name"
                          value={form.english_name}
                          onChange={(event) => setForm((current) => ({ ...current, english_name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_logo_url">校徽地址 logo_url</label>
                        <input
                          id="school_logo_url"
                          value={form.logo_url}
                          placeholder="可粘贴图片 URL，也可上传文件"
                          onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="school_address">地址</label>
                        <input
                          id="school_address"
                          value={form.address}
                          onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增" : "保存修改"}
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

function buildSchoolQuery(keyword: string, status: string, objectType: string, page: number, pageSize: number): SchoolListQuery & { object_type?: string } {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    object_type: objectType || undefined,
    page,
    page_size: pageSize
  };
}

async function enableSchool(api: SchoolManagementApi, id: number): Promise<boolean> {
  if (api.enableSchool) {
    return api.enableSchool(id);
  }
  if (api.post) {
    return api.post<boolean>(`/schools/${id}/enable`);
  }
  return false;
}

async function deleteSchool(api: SchoolManagementApi, id: number): Promise<boolean> {
  if (api.deleteSchool) {
    return api.deleteSchool(id);
  }
  if (api.post) {
    return api.post<boolean>(`/schools/${id}/disable`);
  }
  return api.disableSchool(id);
}

function readCurrentUserType(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "";
  }
  const raw = window.localStorage.getItem("aios.admin.session");
  if (!raw) {
    return "";
  }
  try {
    return (JSON.parse(raw) as { user?: { user_type?: string } }).user?.user_type ?? "";
  } catch {
    return "";
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function normalizeSchoolObjectType(value?: string | null): SchoolObjectType {
  return value === "organization" ? "organization" : "school";
}

function formatObjectType(value?: string | null): string {
  return normalizeSchoolObjectType(value) === "organization" ? "组织" : "学校";
}

function normalizeErrorMessage(message: string): string {
  if (/403|forbidden|无权限/i.test(message)) {
    return "当前账号无权执行该系统级管理操作。";
  }
  if (/404|not found/i.test(message)) {
    return "学校与组织接口暂不可用，请检查后端 /api/v1/schools 服务是否已启动。";
  }
  return message || "学校与组织数据加载失败";
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
  gridTemplateColumns: "minmax(240px, 360px) minmax(160px, 220px) minmax(180px, 240px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};

const logoStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  objectFit: "cover",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "#f8fafc"
};

const profileLogoStyle: CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: 24,
  objectFit: "cover",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "#f8fafc"
};

const profileHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: 18,
  alignItems: "start"
};

const profileMetaStyle: CSSProperties = {
  margin: 0
};

const logoUploadRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  marginBottom: 18
};
