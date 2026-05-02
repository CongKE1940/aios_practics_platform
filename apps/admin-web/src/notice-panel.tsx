import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  LoginOrganization,
  Notice,
  NoticeInput,
  NoticeListQuery,
  NotificationItem,
  NotificationListQuery,
  PageResult
} from "@aios/api-sdk";
import {
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface NoticeApi {
  listNotices(query?: NoticeListQuery): Promise<PageResult<Notice>>;
  createNotice(body: NoticeInput): Promise<Notice>;
  getNotice(id: number): Promise<Notice>;
  updateNotice(id: number, body: NoticeInput): Promise<Notice>;
  publishNotice(id: number): Promise<Notice>;
  recallNotice(id: number): Promise<Notice>;
  listLoginOrganizations?(): Promise<LoginOrganization[]>;
  listNotifications?(query?: NotificationListQuery): Promise<PageResult<NotificationItem>>;
  markNotificationRead?(id: number): Promise<NotificationItem>;
}

const defaultPageSize = 10;

const defaultNoticeForm = {
  title: "",
  content: "",
  notice_type: "system",
  publish_scope_type: "all",
  publish_scope_text: "",
  target_tenant_id: "",
  class_ids: "",
  user_types: [] as string[],
  publish_at: "",
  expire_at: ""
};

type NoticeFormState = typeof defaultNoticeForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; notice: Notice }
  | { type: "edit"; notice: Notice }
  | null;

const columns: Array<FixedActionListColumn<Notice>> = [
  {
    key: "title",
    title: "公告标题",
    render: (notice) => notice.title
  },
  {
    key: "notice_type",
    title: "公告类型",
    width: 130,
    render: (notice) => formatNoticeType(notice.notice_type)
  },
  {
    key: "publish_scope_type",
    title: "接收范围",
    width: 130,
    render: (notice) => formatScopeType(notice.publish_scope_type)
  },
  {
    key: "status",
    title: "状态",
    width: 120,
    render: (notice) => <span className={statusClassName(notice.status)}>{formatStatusLabel(notice.status)}</span>
  },
  {
    key: "publish_at",
    title: "发布时间",
    width: 170,
    render: (notice) => formatDateTime(notice.publish_at)
  },
  {
    key: "expire_at",
    title: "过期时间",
    width: 170,
    render: (notice) => formatDateTime(notice.expire_at)
  }
];

export function NoticePanel({ api }: { api: NoticeApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [form, setForm] = useState<NoticeFormState>(defaultNoticeForm);
  const [noticeType, setNoticeType] = useState("");
  const [status, setStatus] = useState("");
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadNotices(buildNoticeQuery("", "", 1, defaultPageSize));
  }, [api]);

  useEffect(() => {
    if (!api.listLoginOrganizations) {
      return;
    }
    let active = true;
    api
      .listLoginOrganizations()
      .then((items) => {
        if (active) {
          setOrganizations(items);
        }
      })
      .catch(() => {
        if (active) {
          setOrganizations([]);
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function loadNotices(query: NoticeListQuery = buildNoticeQuery(noticeType, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listNotices(query);
      setNotices(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setNotices([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "公告通知数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadNotices(buildNoticeQuery(noticeType, status, 1, pageSize));
  }

  async function handleReset() {
    setNoticeType("");
    setStatus("");
    setSelectedIDs([]);
    await loadNotices(buildNoticeQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadNotices(buildNoticeQuery(noticeType, status, nextPage, pageSize));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildNoticePayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }

    if (modal?.type === "edit") {
      await api.updateNotice(modal.notice.id, payload);
    } else {
      await api.createNotice(payload);
    }

    closeModal();
    await loadNotices();
  }

  async function handlePublish(id: number) {
    await api.publishNotice(id);
    await loadNotices();
  }

  async function handleRecall(id: number) {
    await api.recallNotice(id);
    await loadNotices();
  }

  async function handleBatchRecall(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }
    await Promise.all(ids.map((id) => api.recallNotice(id)));
    setSelectedIDs([]);
    await loadNotices();
  }

  function handleExport() {
    downloadCsv(
      "notices.csv",
      [
        { key: "title", title: "公告标题" },
        { key: "notice_type_label", title: "公告类型" },
        { key: "publish_scope_type_label", title: "接收范围" },
        { key: "status_label", title: "状态" },
        { key: "publish_at_label", title: "发布时间" },
        { key: "expire_at_label", title: "过期时间" }
      ],
      notices.map((notice) => ({
        ...notice,
        notice_type_label: formatNoticeType(notice.notice_type),
        publish_scope_type_label: formatScopeType(notice.publish_scope_type),
        status_label: formatStatusLabel(notice.status),
        publish_at_label: formatDateTime(notice.publish_at),
        expire_at_label: formatDateTime(notice.expire_at)
      }))
    );
  }

  function openCreateModal() {
    setForm(defaultNoticeForm);
    setModal({ type: "create" });
  }

  function openEditModal(notice: Notice) {
    setForm({
      title: notice.title,
      content: notice.content,
      notice_type: notice.notice_type,
      publish_scope_type: notice.publish_scope_type,
      publish_scope_text: formatScopeJson(notice.publish_scope),
      target_tenant_id: String((notice.publish_scope?.target_tenant_id as number | undefined) ?? ""),
      class_ids: formatIDList(notice.publish_scope?.class_ids),
      user_types: readStringArray(notice.publish_scope?.user_types),
      publish_at: toDateTimeLocalValue(notice.publish_at),
      expire_at: toDateTimeLocalValue(notice.expire_at)
    });
    setModal({ type: "edit", notice });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultNoticeForm);
  }

  return (
    <section aria-label="公告通知面板" className="ui-admin-page" style={pageStyle}>
      <h2 style={visuallyHiddenStyle}>公告通知</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="公告通知数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="公告通知数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterSelect id="notice_type_filter" label="公告类型" placeholder="请选择公告类型" value={noticeType} onChange={setNoticeType}>
              <option value="system">系统公告</option>
              <option value="activity">活动公告</option>
          </ClearableFilterSelect>
          <ClearableFilterSelect id="notice_status_filter" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="recalled">已撤回</option>
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
          rows={notices}
          columns={columns}
          getRowId={(notice) => notice.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onDelete={(rowIds) => void handleBatchRecall(rowIds)}
          onExport={handleExport}
          onDetail={(notice) => setModal({ type: "detail", notice })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无公告通知数据"}
          ariaLabel="公告列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(notice) => `选择公告-${notice.title}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="公告通知弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>公告详情</h3>
                    <p>{modal.notice.title}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>标题</dt>
                      <dd>{modal.notice.title}</dd>
                    </div>
                    <div>
                      <dt>公告类型</dt>
                      <dd>{formatNoticeType(modal.notice.notice_type)}</dd>
                    </div>
                    <div>
                      <dt>接收范围</dt>
                      <dd>{formatScopeType(modal.notice.publish_scope_type)}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>
                        <span className={statusClassName(modal.notice.status)}>{formatStatusLabel(modal.notice.status)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>发布时间</dt>
                      <dd>{formatDateTime(modal.notice.publish_at)}</dd>
                    </div>
                    <div>
                      <dt>过期时间</dt>
                      <dd>{formatDateTime(modal.notice.expire_at)}</dd>
                    </div>
                    <div>
                      <dt>内容</dt>
                      <dd>{modal.notice.content}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleRecall(modal.notice.id)}>
                      撤回公告
                    </button>
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => openEditModal(modal.notice)}>
                      编辑
                    </button>
                    <button type="button" className="ui-button ui-button--primary" onClick={() => void handlePublish(modal.notice.id)}>
                      发布公告
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增公告" : "编辑公告"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="notice_title">公告标题</label>
                        <input
                          id="notice_title"
                          value={form.title}
                          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="notice_type">公告类型</label>
                        <select
                          id="notice_type"
                          value={form.notice_type}
                          onChange={(event) => setForm((current) => ({ ...current, notice_type: event.target.value }))}
                        >
                          <option value="system">系统公告</option>
                          <option value="activity">活动公告</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="notice_scope_type">接收范围</label>
                        <select
                          id="notice_scope_type"
                          value={form.publish_scope_type}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              publish_scope_type: event.target.value,
                              user_types: [],
                              class_ids: "",
                              publish_scope_text: ""
                            }))
                          }
                        >
                          <option value="all">全部用户</option>
                          <option value="tenant_admins">租户/组织管理员</option>
                          <option value="all_admins">全体管理员</option>
                          <option value="non_students">除学生外</option>
                          <option value="user_types">指定用户类型</option>
                          <option value="exclude_user_types">排除用户类型</option>
                          <option value="class_ids">指定班级</option>
                          <option value="user_ids">指定用户</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="notice_target_tenant">目标组织</label>
                        {organizations.length > 0 ? (
                          <select
                            id="notice_target_tenant"
                            value={form.target_tenant_id}
                            onChange={(event) => setForm((current) => ({ ...current, target_tenant_id: event.target.value }))}
                          >
                            <option value="">本组织</option>
                            {organizations.map((organization) => (
                              <option key={organization.tenant_id} value={organization.tenant_id}>
                                {formatOrganizationLabel(organization)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id="notice_target_tenant"
                            inputMode="numeric"
                            placeholder="本组织可留空"
                            value={form.target_tenant_id}
                            onChange={(event) => setForm((current) => ({ ...current, target_tenant_id: event.target.value }))}
                          />
                        )}
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="publish_at">发布时间</label>
                        <input
                          id="publish_at"
                          type="datetime-local"
                          value={form.publish_at}
                          onChange={(event) => setForm((current) => ({ ...current, publish_at: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="expire_at">过期时间</label>
                        <input
                          id="expire_at"
                          type="datetime-local"
                          value={form.expire_at}
                          onChange={(event) => setForm((current) => ({ ...current, expire_at: event.target.value }))}
                        />
                      </div>
                      {form.publish_scope_type === "class_ids" ? (
                        <div className="ui-admin-form__field">
                          <label htmlFor="notice_class_ids">班级 ID</label>
                          <input
                            id="notice_class_ids"
                            placeholder="多个用逗号分隔"
                            value={form.class_ids}
                            onChange={(event) => setForm((current) => ({ ...current, class_ids: event.target.value }))}
                          />
                        </div>
                      ) : null}
                      {form.publish_scope_type === "user_ids" ? (
                        <div className="ui-admin-form__field">
                          <label htmlFor="notice_scope_text">用户 ID</label>
                          <input
                            id="notice_scope_text"
                            placeholder="多个用逗号分隔"
                            value={form.publish_scope_text}
                            onChange={(event) => setForm((current) => ({ ...current, publish_scope_text: event.target.value }))}
                          />
                        </div>
                      ) : null}
                      {form.publish_scope_type === "user_types" || form.publish_scope_type === "exclude_user_types" ? (
                        <fieldset className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                          <legend>用户类型</legend>
                          <div className="ui-admin-actions-bar__group">
                            {userTypeOptions.map((option) => (
                              <label key={option.value} style={checkboxLabelStyle}>
                                <input
                                  type="checkbox"
                                  checked={form.user_types.includes(option.value)}
                                  onChange={(event) => {
                                    setForm((current) => ({
                                      ...current,
                                      user_types: event.target.checked
                                        ? [...current.user_types, option.value]
                                        : current.user_types.filter((value) => value !== option.value)
                                    }));
                                  }}
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : null}
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="notice_content">公告内容</label>
                        <textarea
                          id="notice_content"
                          value={form.content}
                          onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增公告" : "保存修改"}
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

function buildNoticeQuery(noticeType: string, status: string, page: number, pageSize: number): NoticeListQuery {
  return {
    notice_type: noticeType || undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function buildNoticePayload(form: NoticeFormState): NoticeInput | string {
  if (!form.title.trim()) {
    return "请填写公告标题。";
  }
  if (!form.content.trim()) {
    return "请填写公告内容。";
  }

  const publishScope = buildPublishScope(form);
  if (typeof publishScope === "string") {
    return publishScope;
  }

  return {
    title: form.title,
    content: form.content,
    notice_type: form.notice_type,
    publish_scope_type: form.publish_scope_type,
    publish_scope: publishScope,
    publish_at: normalizeDateTimeValue(form.publish_at) ?? new Date().toISOString(),
    expire_at: normalizeDateTimeValue(form.expire_at) ?? undefined,
    target_tenant_id: parseOptionalID(form.target_tenant_id)
  };
}

function buildPublishScope(form: NoticeFormState): Record<string, unknown> | string {
  const scope: Record<string, unknown> = {};
  const targetTenantID = parseOptionalID(form.target_tenant_id);
  if (targetTenantID) {
    scope.target_tenant_id = targetTenantID;
  }
  if (form.publish_scope_type === "user_ids") {
    const userIDs = parseIDList(form.publish_scope_text);
    if (userIDs.length === 0) {
      return "请填写有效的用户 ID。";
    }
    scope.user_ids = userIDs;
  }
  if (form.publish_scope_type === "class_ids") {
    const classIDs = parseIDList(form.class_ids);
    if (classIDs.length === 0) {
      return "请填写有效的班级 ID。";
    }
    scope.class_ids = classIDs;
  }
  if (form.publish_scope_type === "user_types" || form.publish_scope_type === "exclude_user_types") {
    if (form.user_types.length === 0) {
      return "请至少选择一种用户类型。";
    }
    scope.user_types = form.user_types;
  }
  return scope;
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "公告通知接口暂不可用，请检查后端 /api/v1/notices 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "公告通知请求参数错误，请检查公告类型、状态、发布时间或接收范围。";
  }
  return message || "公告通知数据加载失败";
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "published":
      return "已发布";
    case "draft":
      return "草稿";
    case "recalled":
      return "已撤回";
    case "unread":
      return "未读";
    case "read":
      return "已读";
    default:
      return status;
  }
}

function statusClassName(status: string): string {
  switch (status) {
    case "published":
    case "read":
      return "ui-admin-status ui-admin-status--active";
    case "draft":
    case "unread":
      return "ui-admin-status ui-admin-status--draft";
    case "recalled":
      return "ui-admin-status ui-admin-status--disabled";
    default:
      return "ui-admin-status ui-admin-status--disabled";
  }
}

function formatNoticeType(noticeType: string): string {
  switch (noticeType) {
    case "system":
      return "系统公告";
    case "activity":
      return "活动公告";
    default:
      return noticeType || "-";
  }
}

function formatScopeType(scopeType: string): string {
  switch (scopeType) {
    case "all":
      return "全部用户";
    case "tenant_admins":
      return "租户/组织管理员";
    case "all_admins":
      return "全体管理员";
    case "non_students":
      return "除学生外";
    case "user_types":
      return "指定用户类型";
    case "exclude_user_types":
      return "排除用户类型";
    case "class_ids":
      return "指定班级";
    case "user_ids":
      return "指定用户";
    default:
      return scopeType || "-";
  }
}

const userTypeOptions = [
  { value: "tenant_admin", label: "租户管理员" },
  { value: "school_admin", label: "组织管理员" },
  { value: "teacher", label: "教师" },
  { value: "student", label: "学生" },
  { value: "staff", label: "职员" }
];

function parseOptionalID(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseIDList(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function formatIDList(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .join(",");
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function formatOrganizationLabel(organization: LoginOrganization): string {
  return `${organization.tenant_name}（${organization.tenant_code}）`;
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

function normalizeDateTimeValue(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatScopeJson(value: Record<string, unknown>): string {
  if (!value || Object.keys(value).length === 0) {
    return "";
  }
  return JSON.stringify(value);
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
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 300px) minmax(220px, 300px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};

const checkboxLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 700
};
