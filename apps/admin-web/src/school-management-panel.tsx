import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  DictionaryItem,
  FileAsset,
  PageResult,
  SchoolOrganization,
  SchoolOrganizationBatchDeleteInput,
  SchoolOrganizationInput,
  SchoolOrganizationListQuery,
  SchoolObjectType
} from "@aios/api-sdk";
import { batchDeleteSchoolOrganizations, enableSchoolOrganization, SchoolObjectTypeOrganization, SchoolObjectTypeSchool } from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";
import "./school-management-panel.css";

export interface SchoolManagementApi {
  listDictionaryItems?(query: { dict_code: string; active_only?: boolean }): Promise<DictionaryItem[]>;
  listSchools(query?: SchoolOrganizationListQuery): Promise<PageResult<SchoolOrganization>>;
  createSchool(body: SchoolOrganizationInput): Promise<SchoolOrganization>;
  getSchool?(id: number): Promise<SchoolOrganization>;
  disableSchool(id: number): Promise<boolean>;
  updateSchool?(id: number, body: SchoolOrganizationInput): Promise<SchoolOrganization>;
  enableSchool?(id: number): Promise<boolean>;
  deleteSchool?(id: number): Promise<boolean>;
  batchDeleteSchools?(body: SchoolOrganizationBatchDeleteInput): Promise<boolean>;
  uploadFile?(body: FormData): Promise<FileAsset>;
  post?<TData, TBody = unknown>(path: string, body?: TBody): Promise<TData>;
}

type SchoolFormState = Required<Pick<SchoolOrganizationInput, "name">> & {
  object_type: SchoolObjectType;
  english_name: string;
  address: string;
  logo_url: string;
};

type DeleteConfirmState = {
  ids: number[];
  cascadeDelete: boolean;
} | null;

const defaultPageSize = 10;
const defaultObjectTypeItems: Array<{ value: SchoolObjectType; label: string }> = [
  { value: SchoolObjectTypeSchool, label: "学校" },
  { value: SchoolObjectTypeOrganization, label: "组织" }
];
const defaultLogoDataUrl =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#e2e8f0"/><path d="M24 74V36l24-14 24 14v38" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 74V54h20v20" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );

const defaultSchoolForm: SchoolFormState = {
  object_type: SchoolObjectTypeSchool,
  name: "",
  english_name: "",
  address: "",
  logo_url: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; school: SchoolOrganization }
  | { type: "edit"; school: SchoolOrganization }
  | null;

export function SchoolManagementPanel({ api }: { api: SchoolManagementApi }) {
  const [loading, setLoading] = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdAdmin, setCreatedAdmin] = useState<NonNullable<SchoolOrganization["default_admin"]> | null>(null);
  const [schools, setSchools] = useState<SchoolOrganization[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [objectType, setObjectType] = useState("");
  const [objectTypeItems, setObjectTypeItems] = useState(defaultObjectTypeItems);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [form, setForm] = useState<SchoolFormState>(defaultSchoolForm);
  const didLoadRef = useRef(false);
  const currentUserType = useMemo(() => readCurrentUserType(), []);
  const isSystemAdmin = currentUserType === "sys_admin";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const formatSchoolType = (school: SchoolOrganization) => school.object_type_label || formatDictionaryObjectType(school.object_type, objectTypeItems);
  const formatFormType = (value?: string | number | null) => formatDictionaryObjectType(value, objectTypeItems);

  const columns = useMemo<Array<FixedActionListColumn<SchoolOrganization>>>(
    () => [
      {
        key: "name",
        title: "名称",
        width: 360,
        render: (school) => <SchoolIdentityCell school={school} />
      },
      {
        key: "object_type",
        title: "类型",
        width: 140,
        render: (school) => <span style={typePillStyle}>{formatSchoolType(school)}</span>
      },
      {
        key: "address",
        title: "地址",
        render: (school) => <span style={addressTextStyle}>{school.address || "未维护地址"}</span>
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (school) => <span className={statusClassName(school.status)}>{formatStatusLabel(school.status)}</span>
      }
    ],
    [objectTypeItems]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadDictionaries();
    void loadSchools(buildSchoolQuery("", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadDictionaries() {
    if (!api.listDictionaryItems) {
      return;
    }
    try {
      const items = await api.listDictionaryItems({ dict_code: "school_object_type" });
      const normalizedItems = items
        .filter((item) => item.status === "active")
        .map((item) => ({ value: normalizeSchoolObjectType(item.value), label: item.label }))
        .filter((item, index, all) => all.findIndex((candidate) => candidate.value === item.value) === index);
      if (normalizedItems.length > 0) {
        setObjectTypeItems(normalizedItems);
      }
    } catch {
      setObjectTypeItems(defaultObjectTypeItems);
    }
  }

  async function loadSchools(query: SchoolOrganizationListQuery = buildSchoolQuery(keyword, status, objectType, page, pageSize)) {
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
    setCreatedAdmin(null);
    setForm(defaultSchoolForm);
    setModal({ type: "create" });
  }

  async function openDetailModal(school: SchoolOrganization) {
    const latest = await loadSchoolDetail(school);
    setModal({ type: "detail", school: latest });
  }

  async function openEditModal(school: SchoolOrganization) {
    const latest = await loadSchoolDetail(school);
    setFormFromSchool(latest);
    setModal({ type: "edit", school: latest });
  }

  async function loadSchoolDetail(school: SchoolOrganization): Promise<SchoolOrganization> {
    if (!api.getSchool) {
      return school;
    }
    setModalLoading(true);
    setErrorMessage("");
    try {
      return await api.getSchool(school.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "学校与组织详情加载失败");
      return school;
    } finally {
      setModalLoading(false);
    }
  }

  function setFormFromSchool(school: SchoolOrganization) {
    setForm({
      object_type: normalizeSchoolObjectType(school.object_type),
      name: school.name,
      english_name: school.english_name ?? "",
      address: school.address ?? "",
      logo_url: school.logo_url ?? ""
    });
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

    const payload = buildSchoolPayload(form);
    if (modal?.type === "edit" && api.updateSchool) {
      await api.updateSchool(modal.school.id, payload);
    } else if (modal?.type === "edit") {
      setErrorMessage("当前接口暂不支持编辑学校或组织基础信息。 ");
      return;
    } else if (isSystemAdmin) {
      const created = await api.createSchool(payload);
      setCreatedAdmin(created.default_admin ?? null);
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

  function handleDelete(rowIds: FixedActionListRowId[]) {
    if (!isSystemAdmin) {
      return;
    }
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }
    setDeleteConfirm({ ids, cascadeDelete: false });
  }

  async function confirmDeleteSchools() {
    if (!deleteConfirm) {
      return;
    }
    try {
      await batchDeleteSchoolOrganizations(api, {
        ids: deleteConfirm.ids,
        cascade_delete: deleteConfirm.cascadeDelete
      });
      setDeleteConfirm(null);
      setSelectedIDs([]);
      await loadSchools();
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "删除失败");
    }
  }

  async function handleToggleStatus(school: SchoolOrganization) {
    if (!isSystemAdmin) {
      return;
    }
    if (school.status === "active") {
      await api.disableSchool(school.id);
    } else {
      await enableSchoolOrganization(api, school.id);
    }
    await loadSchools();
    const latest = await loadSchoolDetail(school);
    setModal({ type: "detail", school: latest });
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
        object_type_label: formatSchoolType(school),
        english_name: school.english_name ?? "",
        address: school.address ?? "",
        logo_url: school.logo_url ?? "",
        status_label: formatStatusLabel(school.status)
      }))
    );
  }

  return (
    <section aria-label="学校与组织管理面板" className="ui-admin-page" style={pageStyle}>
      <h2 style={visuallyHiddenStyle}>学校与组织管理</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="学校与组织数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}
      {createdAdmin ? (
        <ToastNotice
          tone="success"
          title="默认管理员已创建"
          description={`登录组织：${createdAdmin.tenant_code}；账号：${createdAdmin.username}；初始密码：${createdAdmin.initial_password || "请在用户管理中重置"}`}
          durationMs={0}
          onClose={() => setCreatedAdmin(null)}
        />
      ) : null}

      <section className="ui-admin-card" aria-label="学校与组织数据展示区" style={dataRegionStyle} aria-busy={loading || modalLoading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="school_filter_keyword" label="关键字" placeholder="输入名称、英文名、编码或地址" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="school_filter_type" label="类型" placeholder="请选择类型" value={objectType} onChange={setObjectType}>
              {objectTypeItems.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="school_filter_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
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
          rows={schools}
          columns={columns}
          getRowId={(school) => school.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={isSystemAdmin ? setSelectedIDs : undefined}
          onCreate={isSystemAdmin ? openCreateModal : undefined}
          onDelete={isSystemAdmin ? handleDelete : undefined}
          onExport={handleExport}
          onDetail={(school) => void openDetailModal(school)}
          onEdit={(school) => void openEditModal(school)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无学校与组织数据"}
          ariaLabel="学校与组织列表"
          createLabel="新增"
          deleteLabel={selectedIDs.length > 0 ? `删除已选 ${selectedIDs.length} 项` : "删除"}
          exportLabel="导出"
          rowCheckboxLabel={(school) => `选择${formatSchoolType(school)}-${school.name}`}
        />
      </section>

      {deleteConfirm ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="删除学校与组织确认">
            <div className="ui-admin-modal__header">
              <div>
                <h3>确认删除</h3>
                <p>{`已选择 ${deleteConfirm.ids.length} 个学校/组织`}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setDeleteConfirm(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <p className="ui-admin-subtle">
                默认删除会先检查所选学校/组织下是否存在年级、班级或学生；存在关联数据时系统会拒绝删除。
              </p>
              <label style={cascadeOptionStyle}>
                <input
                  type="checkbox"
                  checked={deleteConfirm.cascadeDelete}
                  onChange={(event) => setDeleteConfirm((current) => current ? { ...current, cascadeDelete: event.target.checked } : current)}
                />
                <span>同时删除所选学校/组织下的所有年级、班级、学生</span>
              </label>
              {deleteConfirm.cascadeDelete ? (
                <p style={dangerHintStyle}>该操作会软删除年级、班级，并将学生置为离校/禁用，请谨慎确认。</p>
              ) : null}
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setDeleteConfirm(null)}>
                取消
              </button>
              <button type="button" className="ui-button ui-button--primary" onClick={() => void confirmDeleteSchools()}>
                确认删除
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="学校与组织管理弹层" style={modalShellStyle}>
            {modal.type === "detail" ? (
              <div style={editorCardStyle} className="school-management-modal-card">
                <div style={editorHeroStyle} className="school-management-modal__hero">
                  <div>
                    <span style={editorEyebrowStyle} className="school-management-modal__eyebrow">DETAIL</span>
                    <h3 style={editorTitleStyle} className="school-management-modal__title">{formatSchoolType(modal.school)}详情</h3>
                    <p style={editorDescriptionStyle} className="school-management-modal__description">
                      {`系统编码：${modal.school.code}`}
                    </p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost school-management-modal__hero-close" onClick={closeModal}>关闭</button>
                </div>

                <div style={editorBodyStyle} className="school-management-modal__body">
                  <aside style={logoCardStyle} className="school-management-modal__preview-card">
                    <span style={logoCardLabelStyle} className="school-management-modal__logo-label">头像预览</span>
                    <img src={modal.school.logo_url || defaultLogoDataUrl} alt="" style={editorLogoStyle} onError={(event) => { event.currentTarget.src = defaultLogoDataUrl; }} />
                    <strong style={previewNameStyle} className="school-management-modal__preview-name">{modal.school.name}</strong>
                    <span style={previewTypeStyle} className="school-management-modal__preview-type">{formatSchoolType(modal.school)}</span>
                    <span className={statusClassName(modal.school.status)}>{formatStatusLabel(modal.school.status)}</span>
                  </aside>

                  <section style={formCardStyle} className="school-management-modal__info-card">
                    <div style={formSectionHeaderStyle} className="school-management-modal__section-header">
                      <span style={formSectionKickerStyle} className="school-management-modal__section-kicker">基础资料</span>
                      <strong>学校与组织统一管理信息</strong>
                    </div>
                    <dl style={detailGridStyle} className="school-management-modal__detail-grid">
                      <DetailField label="类型" value={formatSchoolType(modal.school)} />
                      <DetailField label="名称" value={modal.school.name} />
                      <DetailField label="英文名" value={modal.school.english_name || "-"} />
                      <DetailField label="系统编码" value={modal.school.code} />
                      <DetailField label="地址" value={modal.school.address || "-"} wide />
                      <DetailField label="校徽地址 logo_url" value={modal.school.logo_url || "默认图像"} wide />
                    </dl>
                  </section>
                </div>

                <div style={editorFooterStyle} className="school-management-modal__footer">
                  <span style={editorFooterHintStyle} className="school-management-modal__footer-hint">详情仅展示当前数据，进入编辑后可修改基础信息。</span>
                  <div className="ui-admin-actions-bar__group">
                    {isSystemAdmin ? <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleToggleStatus(modal.school)}>{modal.school.status === "active" ? "停用" : "启用"}</button> : null}
                    <button type="button" className="ui-button ui-button--primary" onClick={() => void openEditModal(modal.school)}>编辑基础信息</button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => void handleSubmit(event)} style={editorCardStyle} className="school-management-modal-card">
                <div style={editorHeroStyle} className="school-management-modal__hero">
                  <div>
                    <span style={editorEyebrowStyle} className="school-management-modal__eyebrow">{modal.type === "create" ? "CREATE" : "EDIT"}</span>
                    <h3 style={editorTitleStyle} className="school-management-modal__title">{modal.type === "create" ? "新增学校/组织" : "编辑基础信息"}</h3>
                    <p style={editorDescriptionStyle} className="school-management-modal__description">
                      {modal.type === "create" ? "维护基础信息后，系统将自动生成唯一编码。" : `系统编码：${modal.school.code}`}
                    </p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost school-management-modal__hero-close" onClick={closeModal}>关闭</button>
                </div>

                <div style={editorBodyStyle} className="school-management-modal__body">
                  <aside style={logoCardStyle} className="school-management-modal__preview-card">
                    <span style={logoCardLabelStyle} className="school-management-modal__logo-label">头像预览</span>
                    <img src={form.logo_url || defaultLogoDataUrl} alt="" style={editorLogoStyle} />
                    <strong style={previewNameStyle} className="school-management-modal__preview-name">{form.name.trim() || "未命名对象"}</strong>
                    <span style={previewTypeStyle} className="school-management-modal__preview-type">{formatFormType(form.object_type)}</span>
                    <div className="ui-admin-form__field" style={logoUploadFieldStyle}>
                      <label htmlFor="school_logo_file">上传校徽/头像</label>
                      <input id="school_logo_file" type="file" accept="image/*" onChange={(event) => void handleLogoFile(event.target.files?.[0] ?? null)} />
                      <small className="ui-admin-subtle">可为空，为空时展示默认图像。</small>
                    </div>
                  </aside>

                  <section style={formCardStyle} className="school-management-modal__info-card">
                    <div style={formSectionHeaderStyle} className="school-management-modal__section-header">
                      <span style={formSectionKickerStyle} className="school-management-modal__section-kicker">基础资料</span>
                      <strong>学校与组织统一管理信息</strong>
                    </div>
                    <div style={editorGridStyle} className="school-management-modal__form-grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_object_type">类型</label>
                        <select
                          id="school_object_type"
                          value={form.object_type}
                          disabled={!isSystemAdmin || modal.type === "edit"}
                          onChange={(event) => setForm((current) => ({ ...current, object_type: normalizeSchoolObjectType(event.target.value) }))}
                        >
                          {objectTypeItems.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_name">名称</label>
                        <input id="school_name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_english_name">英文名</label>
                        <input id="school_english_name" value={form.english_name} onChange={(event) => setForm((current) => ({ ...current, english_name: event.target.value }))} />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="school_logo_url">校徽地址 logo_url</label>
                        <input id="school_logo_url" value={form.logo_url} placeholder="可粘贴图片 URL，也可上传文件" onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))} />
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="school_address">地址</label>
                        <input id="school_address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
                      </div>
                    </div>
                  </section>
                </div>

                <div style={editorFooterStyle} className="school-management-modal__footer">
                  <span style={editorFooterHintStyle} className="school-management-modal__footer-hint">新增时编码自动生成，编辑时编码不可修改。</span>
                  <div className="ui-admin-actions-bar__group">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>取消</button>
                    <button type="submit" className="ui-button ui-button--primary">{modal.type === "create" ? "新增" : "保存修改"}</button>
                  </div>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function DetailField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className="school-management-modal__detail-item" style={wide ? detailWideItemStyle : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SchoolIdentityCell({ school }: { school: SchoolOrganization }) {
  return (
    <div style={identityCellStyle}>
      <img
        src={school.logo_url || defaultLogoDataUrl}
        alt=""
        style={logoStyle}
        onError={(event) => {
          event.currentTarget.src = defaultLogoDataUrl;
        }}
      />
      <div style={identityTextStyle}>
        <strong style={identityNameStyle}>{school.name}</strong>
        <span style={identityMetaStyle}>{school.english_name || school.code || "暂无英文名"}</span>
      </div>
    </div>
  );
}

function buildSchoolQuery(keyword: string, status: string, objectType: string, page: number, pageSize: number): SchoolOrganizationListQuery {
  return { keyword: keyword.trim() || undefined, status: status || undefined, object_type: objectType || undefined, page, page_size: pageSize };
}

function buildSchoolPayload(form: SchoolFormState): SchoolOrganizationInput {
  return { object_type: form.object_type, name: form.name.trim(), english_name: form.english_name.trim(), address: form.address.trim(), logo_url: form.logo_url.trim() };
}

function readCurrentUserType(): string { if (typeof window === "undefined" || !window.localStorage) { return ""; } const raw = window.localStorage.getItem("aios.admin.session"); if (!raw) { return ""; } try { return (JSON.parse(raw) as { user?: { user_type?: string } }).user?.user_type ?? ""; } catch { return ""; } }
function readFileAsDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => reject(reader.error ?? new Error("文件读取失败")); reader.readAsDataURL(file); }); }
function normalizeSchoolObjectType(value?: string | number | null): SchoolObjectType { return Number(value) === SchoolObjectTypeOrganization || value === "organization" ? SchoolObjectTypeOrganization : SchoolObjectTypeSchool; }
function formatDictionaryObjectType(value: string | number | null | undefined, items: Array<{ value: SchoolObjectType; label: string }>): string { const normalized = normalizeSchoolObjectType(value); return items.find((item) => item.value === normalized)?.label ?? defaultObjectTypeItems.find((item) => item.value === normalized)?.label ?? "学校"; }
function normalizeErrorMessage(message: string): string { if (/409|关联|存在年级|存在班级|存在学生|delete restricted|school has related data/i.test(message)) { return "该学校或组织下存在年级、班级或学生，请先处理关联数据，或在删除确认中选择同时删除关联数据。"; } if (/403|forbidden|无权限/i.test(message)) { return "当前账号无权执行该系统级管理操作。"; } if (/404|not found/i.test(message)) { return "学校与组织接口暂不可用，请检查后端 /api/v1/schools 服务是否已启动。"; } return message || "学校与组织数据加载失败"; }
function statusClassName(status: string): string { if (["active", "published", "enabled"].includes(status)) { return "ui-admin-status ui-admin-status--active"; } if (["disabled", "inactive"].includes(status)) { return "ui-admin-status ui-admin-status--disabled"; } return "ui-admin-status ui-admin-status--draft"; }
function formatStatusLabel(status: string): string { switch (status) { case "active": return "启用"; case "disabled": case "inactive": return "停用"; default: return status; } }

const pageStyle: CSSProperties = { minHeight: "100%", gap: 0 };
const visuallyHiddenStyle: CSSProperties = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 };
const dataRegionStyle: CSSProperties = { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 14, minHeight: "100%", padding: 22 };
const filterFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px, 360px) minmax(160px, 220px) minmax(180px, 240px) auto", alignItems: "end", gap: 14, margin: 0 };
const queryActionsStyle: CSSProperties = { alignItems: "center", paddingBottom: 1, whiteSpace: "nowrap" };
const identityCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
const identityTextStyle: CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const identityNameStyle: CSSProperties = { color: "#0f172a", fontSize: 14, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const identityMetaStyle: CSSProperties = { color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const addressTextStyle: CSSProperties = { color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 420 };
const typePillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 54, padding: "4px 10px", borderRadius: 999, background: "#eef2ff", color: "#3730a3", fontWeight: 700, fontSize: 12 };
const logoStyle: CSSProperties = { width: 42, height: 42, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(148, 163, 184, 0.35)", background: "#f8fafc", flex: "0 0 auto" };
const detailGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, margin: 0 };
const detailWideItemStyle: CSSProperties = { gridColumn: "1 / -1" };
const cascadeOptionStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, marginTop: 16, fontWeight: 700 };
const dangerHintStyle: CSSProperties = { marginTop: 12, color: "#b91c1c", fontWeight: 700 };
const modalShellStyle: CSSProperties = { width: "min(940px, calc(100vw - 48px))", maxHeight: "calc(100vh - 64px)", overflow: "auto" };
const editorCardStyle: CSSProperties = { display: "grid", gap: 0, borderRadius: 28, overflow: "hidden", background: "#ffffff", boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)", border: "1px solid rgba(148, 163, 184, 0.24)" };
const editorHeroStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", padding: "26px 28px", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 52%, #334155 100%)", color: "#fff" };
const editorEyebrowStyle: CSSProperties = { display: "inline-flex", marginBottom: 8, color: "#bfdbfe", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em" };
const editorTitleStyle: CSSProperties = { margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 800 };
const editorDescriptionStyle: CSSProperties = { margin: "8px 0 0", color: "rgba(226, 232, 240, 0.86)", fontSize: 13 };
const editorBodyStyle: CSSProperties = { display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 18, padding: 22, background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)" };
const logoCardStyle: CSSProperties = { display: "grid", justifyItems: "center", alignContent: "start", gap: 12, padding: 20, borderRadius: 22, background: "#fff", border: "1px solid rgba(148, 163, 184, 0.22)", boxShadow: "0 14px 34px rgba(15, 23, 42, 0.08)" };
const logoCardLabelStyle: CSSProperties = { justifySelf: "start", color: "#64748b", fontSize: 12, fontWeight: 800 };
const editorLogoStyle: CSSProperties = { width: 108, height: 108, borderRadius: 28, objectFit: "cover", border: "1px solid rgba(148, 163, 184, 0.35)", background: "#f8fafc" };
const previewNameStyle: CSSProperties = { maxWidth: "100%", color: "#0f172a", fontSize: 16, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const previewTypeStyle: CSSProperties = { padding: "4px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569", fontSize: 12, fontWeight: 700 };
const logoUploadFieldStyle: CSSProperties = { width: "100%", marginTop: 10 };
const formCardStyle: CSSProperties = { display: "grid", gap: 18, padding: 22, borderRadius: 22, background: "#fff", border: "1px solid rgba(148, 163, 184, 0.22)", boxShadow: "0 14px 34px rgba(15, 23, 42, 0.08)" };
const formSectionHeaderStyle: CSSProperties = { display: "grid", gap: 4, paddingBottom: 14, borderBottom: "1px solid rgba(226, 232, 240, 0.9)", color: "#0f172a" };
const formSectionKickerStyle: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 800 };
const editorGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 };
const editorFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", padding: "18px 22px", background: "#fff", borderTop: "1px solid rgba(226, 232, 240, 0.9)" };
const editorFooterHintStyle: CSSProperties = { color: "#64748b", fontSize: 12 };
