import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  AnnouncementListQuery,
  LoginOrganization,
  Notice,
  NotificationInput,
  NotificationItem,
  NotificationListQuery,
  NotificationSendResult,
  PageResult
} from "@aios/api-sdk";
import { ClearableFilterSelect, ToastNotice } from "@aios/ui-web";

export interface AdminNotificationApi {
  listNotifications(query?: NotificationListQuery): Promise<PageResult<NotificationItem>>;
  createNotification?(body: NotificationInput): Promise<NotificationSendResult>;
  markNotificationRead(id: number): Promise<NotificationItem>;
  listLoginOrganizations?(): Promise<LoginOrganization[]>;
  listAnnouncements?(query?: AnnouncementListQuery): Promise<PageResult<Notice>>;
  markAnnouncementRead?(id: number): Promise<Notice>;
}

const defaultPageSize = 10;

const defaultForm = {
  title: "",
  content: "",
  target_type: "single_user",
  target_user_id: "",
  target_tenant_id: "",
  class_ids: "",
  user_types: [] as string[]
};

type FormState = typeof defaultForm;
type ModalState = { type: "detail"; item: NotificationItem } | { type: "create" } | null;

export function NotificationPanel({ api, onUnreadMayChange }: { api: AdminNotificationApi; onUnreadMayChange?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const didLoadRef = useRef(false);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadNotifications(buildQuery("", "", 1, defaultPageSize));
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

  async function loadNotifications(query: NotificationListQuery = buildQuery(status, category, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listNotifications(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setErrorMessage(error instanceof Error ? error.message : "通知数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadNotifications(buildQuery(status, category, 1, pageSize));
  }

  async function openDetail(item: NotificationItem) {
    let nextItem = item;
    if (item.status !== "read") {
      nextItem = await api.markNotificationRead(item.id);
      onUnreadMayChange?.();
      await loadNotifications();
    }
    setModal({ type: "detail", item: nextItem });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api.createNotification) {
      return;
    }
    const payload = buildPayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }
    await api.createNotification(payload);
    setForm(defaultForm);
    setModal(null);
    await loadNotifications();
    onUnreadMayChange?.();
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="ui-admin-page" aria-label="我的通知" style={pageStyle}>
      {errorMessage ? <ToastNotice tone="danger" title="通知操作失败" description={errorMessage} onClose={() => setErrorMessage("")} /> : null}
      <section className="ui-admin-card" aria-label="通知数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterSelect id="admin_notification_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
            <option value="unread">未读</option>
            <option value="read">已读</option>
          </ClearableFilterSelect>
          <ClearableFilterSelect id="admin_notification_category" label="分类" placeholder="请选择分类" value={category} onChange={setCategory}>
            <option value="notice">公告通知</option>
            <option value="direct">站内通知</option>
          </ClearableFilterSelect>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void loadNotifications(buildQuery("", "", 1, pageSize))}>
              重置
            </button>
            {api.createNotification ? (
              <button type="button" className="ui-button ui-button--primary" onClick={() => setModal({ type: "create" })}>
                发送通知
              </button>
            ) : null}
          </div>
        </form>
        <div className="ui-admin-table-wrap">
          <table className="ui-admin-table">
            <thead>
              <tr>
                <th>通知标题</th>
                <th>分类</th>
                <th>发送人</th>
                <th>状态</th>
                <th>阅读时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{formatCategory(item.category)}</td>
                  <td>{item.sender_name || (item.source_type === "user" ? item.source_id ?? "-" : "-")}</td>
                  <td>
                    <span className={item.status === "read" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--draft"}>
                      {item.status === "read" ? "已读" : "未读"}
                    </span>
                  </td>
                  <td>{formatDateTime(item.read_at)}</td>
                  <td>
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void openDetail(item)}>
                      查看
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6}>{loading ? "数据加载中..." : "暂无通知数据"}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="ui-admin-pagination">
          <button type="button" className="ui-button ui-button--ghost" disabled={page <= 1} onClick={() => void loadNotifications(buildQuery(status, category, page - 1, pageSize))}>
            上一页
          </button>
          <span>
            第 {page} / {pageCount} 页，共 {total} 条
          </span>
          <button type="button" className="ui-button ui-button--ghost" disabled={page >= pageCount} onClick={() => void loadNotifications(buildQuery(status, category, page + 1, pageSize))}>
            下一页
          </button>
        </div>
      </section>
      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label={modal.type === "detail" ? "通知详情弹层" : "发送通知弹层"}>
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>通知详情</h3>
                    <p>{modal.item.title}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>通知内容</dt>
                      <dd>{modal.item.content}</dd>
                    </div>
                    <div>
                      <dt>发送人</dt>
                      <dd>{modal.item.sender_name || (modal.item.source_type === "user" ? modal.item.source_id ?? "-" : "-")}</dd>
                    </div>
                    <div>
                      <dt>阅读时间</dt>
                      <dd>{formatDateTime(modal.item.read_at)}</dd>
                    </div>
                  </dl>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void handleCreate(event)}>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>发送通知</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                    <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                      <label htmlFor="admin_notification_title">通知标题</label>
                      <input id="admin_notification_title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="admin_notification_target_type">发送对象</label>
                      <select id="admin_notification_target_type" value={form.target_type} onChange={(event) => setForm((current) => ({ ...current, target_type: event.target.value }))}>
                        <option value="single_user">单个用户</option>
                        <option value="all">全员</option>
                        <option value="tenant_admins">租户/组织管理员</option>
                        <option value="all_admins">全体管理员</option>
                        <option value="non_students">除学生外</option>
                        <option value="user_types">指定用户类型</option>
                        <option value="exclude_user_types">排除用户类型</option>
                        <option value="class_ids">指定班级</option>
                      </select>
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="admin_notification_target_tenant">目标组织</label>
                      {organizations.length > 0 ? (
                        <select
                          id="admin_notification_target_tenant"
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
                        <input id="admin_notification_target_tenant" value={form.target_tenant_id} onChange={(event) => setForm((current) => ({ ...current, target_tenant_id: event.target.value }))} />
                      )}
                    </div>
                    {form.target_type === "single_user" ? (
                      <div className="ui-admin-form__field">
                        <label htmlFor="admin_notification_target_user">接收用户 ID</label>
                        <input id="admin_notification_target_user" value={form.target_user_id} onChange={(event) => setForm((current) => ({ ...current, target_user_id: event.target.value }))} />
                      </div>
                    ) : null}
                    {form.target_type === "class_ids" ? (
                      <div className="ui-admin-form__field">
                        <label htmlFor="admin_notification_class_ids">班级 ID</label>
                        <input id="admin_notification_class_ids" placeholder="多个用逗号分隔" value={form.class_ids} onChange={(event) => setForm((current) => ({ ...current, class_ids: event.target.value }))} />
                      </div>
                    ) : null}
                    {(form.target_type === "user_types" || form.target_type === "exclude_user_types") ? (
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
                      <label htmlFor="admin_notification_content">通知内容</label>
                      <textarea id="admin_notification_content" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                    取消
                  </button>
                  <button type="submit" className="ui-button ui-button--primary">
                    发送通知
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildQuery(status: string, category: string, page: number, pageSize: number): NotificationListQuery {
  return {
    status: status || undefined,
    category: category || undefined,
    page,
    page_size: pageSize
  };
}

function buildPayload(form: FormState): NotificationInput | string {
  if (!form.title.trim()) {
    return "请填写通知标题。";
  }
  if (!form.content.trim()) {
    return "请填写通知内容。";
  }
  if (form.target_type === "single_user") {
    const targetUserID = Number(form.target_user_id);
    if (!Number.isFinite(targetUserID) || targetUserID <= 0) {
      return "请填写有效的接收用户 ID。";
    }
    return {
      title: form.title.trim(),
      content: form.content.trim(),
      target_type: form.target_type,
      target_user_id: targetUserID,
      target_tenant_id: parseOptionalID(form.target_tenant_id)
    };
  }
  const targetScope: Record<string, unknown> = {};
  if (form.target_type === "class_ids") {
    const classIDs = parseIDList(form.class_ids);
    if (classIDs.length === 0) {
      return "请填写有效的班级 ID。";
    }
    targetScope.class_ids = classIDs;
  }
  if (form.target_type === "user_types" || form.target_type === "exclude_user_types") {
    if (form.user_types.length === 0) {
      return "请至少选择一种用户类型。";
    }
    targetScope.user_types = form.user_types;
  }
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    target_type: form.target_type,
    target_scope: targetScope,
    target_tenant_id: parseOptionalID(form.target_tenant_id)
  };
}

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

function formatCategory(value: string): string {
  if (value === "notice") {
    return "公告通知";
  }
  if (value === "direct") {
    return "站内通知";
  }
  return value || "-";
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

function formatOrganizationLabel(organization: LoginOrganization): string {
  return `${organization.tenant_name}（${organization.tenant_code}）`;
}

const userTypeOptions = [
  { value: "tenant_admin", label: "租户管理员" },
  { value: "school_admin", label: "组织管理员" },
  { value: "teacher", label: "教师" },
  { value: "student", label: "学生" },
  { value: "staff", label: "职员" }
];

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
};

const dataRegionStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(190px, 260px) minmax(190px, 260px) auto",
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
