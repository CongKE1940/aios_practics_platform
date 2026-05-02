import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { NotificationInput, NotificationItem, NotificationListQuery, NotificationSendResult, PageResult } from "@aios/api-sdk";
import {
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

export interface NotificationCenterApi {
  listNotifications(query?: NotificationListQuery): Promise<PageResult<NotificationItem>>;
  createNotification?(body: NotificationInput): Promise<NotificationSendResult>;
  markNotificationRead(id: number): Promise<NotificationItem>;
}

const defaultPageSize = 10;

const defaultNotificationForm = {
  title: "",
  content: "",
  target_type: "single_user",
  target_user_id: "",
  class_ids: "",
  user_types: [] as string[],
  target_tenant_id: ""
};

type NotificationFormState = typeof defaultNotificationForm;
type ModalState = { type: "detail"; item: NotificationItem } | { type: "create" } | null;

const columns: Array<FixedActionListColumn<NotificationItem>> = [
  {
    key: "title",
    title: "通知标题",
    render: (item) => item.title
  },
  {
    key: "category",
    title: "分类",
    width: 120,
    render: (item) => formatNotificationCategory(item.category)
  },
  {
    key: "source_type",
    title: "来源",
    width: 120,
    render: (item) => formatSourceType(item.source_type)
  },
  {
    key: "source_id",
    title: "来源 ID",
    width: 110,
    render: (item) => item.source_id ?? "-"
  },
  {
    key: "status",
    title: "状态",
    width: 110,
    render: (item) => <span className={notificationStatusClassName(item.status)}>{formatNotificationStatus(item.status)}</span>
  },
  {
    key: "read_at",
    title: "阅读时间",
    width: 170,
    render: (item) => formatDateTime(item.read_at)
  },
  {
    key: "content",
    title: "内容摘要",
    render: (item) => summarizeContent(item.content)
  }
];

export function NotificationCenterPage({ api, onUnreadMayChange }: { api: NotificationCenterApi; onUnreadMayChange?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<NotificationFormState>(defaultNotificationForm);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadNotifications(buildNotificationQuery("", "", 1, defaultPageSize));
  }, [api]);

  async function loadNotifications(
    query: NotificationListQuery = buildNotificationQuery(status, category, page, pageSize)
  ) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listNotifications(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "通知数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadNotifications(buildNotificationQuery(status, category, 1, pageSize));
  }

  async function handleReset() {
    setStatus("");
    setCategory("");
    setSelectedIDs([]);
    await loadNotifications(buildNotificationQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadNotifications(buildNotificationQuery(status, category, nextPage, pageSize));
  }

  async function handleMarkRead(item: NotificationItem): Promise<NotificationItem> {
    const updated = item.status === "read" ? item : await api.markNotificationRead(item.id);
    if (modal?.type === "detail" && modal.item.id === item.id) {
      setModal({ type: "detail", item: updated });
    }
    await loadNotifications();
    onUnreadMayChange?.();
    return updated;
  }

  async function openDetail(item: NotificationItem) {
    const updated = await handleMarkRead(item);
    setModal({ type: "detail", item: updated });
  }

  async function handleCreateNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api.createNotification) {
      return;
    }
    const payload = buildNotificationPayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }
    await api.createNotification(payload);
    setForm(defaultNotificationForm);
    setModal(null);
    await loadNotifications();
    onUnreadMayChange?.();
  }

  function handleExport() {
    downloadCsv(
      "notifications.csv",
      [
        { key: "title", title: "通知标题" },
        { key: "category_label", title: "分类" },
        { key: "source_type_label", title: "来源" },
        { key: "source_id", title: "来源 ID" },
        { key: "status_label", title: "状态" },
        { key: "read_at_label", title: "阅读时间" },
        { key: "content", title: "通知内容" }
      ],
      items.map((item) => ({
        ...item,
        category_label: formatNotificationCategory(item.category),
        source_type_label: formatSourceType(item.source_type),
        source_id: item.source_id ?? "",
        status_label: formatNotificationStatus(item.status),
        read_at_label: formatDateTime(item.read_at),
        content: item.content ?? ""
      }))
    );
  }

  return (
    <section aria-label="通知中心" className="ui-admin-page ui-user-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="通知数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="通知数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterSelect id="notification_status_filter" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="unread">未读</option>
              <option value="read">已读</option>
          </ClearableFilterSelect>
          <ClearableFilterSelect id="notification_category_filter" label="分类" placeholder="请选择分类" value={category} onChange={setCategory}>
              <option value="notice">公告通知</option>
              <option value="direct">站内通知</option>
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
          rows={items}
          columns={columns}
          getRowId={(item) => item.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onExport={handleExport}
          onCreate={api.createNotification ? () => setModal({ type: "create" }) : undefined}
          onDetail={(item) => void openDetail(item)}
          onEdit={(item) => void handleMarkRead(item)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无通知数据"}
          ariaLabel="通知列表"
          createLabel="发送通知"
          deleteLabel="删除"
          exportLabel="导出"
          editLabel="标记已读"
          rowCheckboxLabel={(item) => `选择通知-${item.title}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="通知详情弹层">
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
                      <dt>通知标题</dt>
                      <dd>{modal.item.title}</dd>
                    </div>
                    <div>
                      <dt>分类</dt>
                      <dd>{formatNotificationCategory(modal.item.category)}</dd>
                    </div>
                    <div>
                      <dt>来源</dt>
                      <dd>{formatSourceType(modal.item.source_type)}</dd>
                    </div>
                    <div>
                      <dt>发送人</dt>
                      <dd>{modal.item.sender_name || (modal.item.source_type === "user" ? modal.item.source_id ?? "-" : "-")}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>
                        <span className={notificationStatusClassName(modal.item.status)}>
                          {formatNotificationStatus(modal.item.status)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>阅读时间</dt>
                      <dd>{formatDateTime(modal.item.read_at)}</dd>
                    </div>
                    <div>
                      <dt>通知内容</dt>
                      <dd>{modal.item.content || "-"}</dd>
                    </div>
                  </dl>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void handleCreateNotification(event)}>
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
                      <label htmlFor="notification_title">通知标题</label>
                      <input
                        id="notification_title"
                        value={form.title}
                        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="notification_target_type">发送对象</label>
                      <select
                        id="notification_target_type"
                        value={form.target_type}
                        onChange={(event) => setForm((current) => ({ ...current, target_type: event.target.value }))}
                      >
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
                      <label htmlFor="notification_target_tenant">目标组织 ID</label>
                      <input
                        id="notification_target_tenant"
                        inputMode="numeric"
                        placeholder="本组织可留空"
                        value={form.target_tenant_id}
                        onChange={(event) => setForm((current) => ({ ...current, target_tenant_id: event.target.value }))}
                      />
                    </div>
                    {form.target_type === "single_user" ? (
                      <div className="ui-admin-form__field">
                        <label htmlFor="notification_target_user">接收用户 ID</label>
                        <input
                          id="notification_target_user"
                          inputMode="numeric"
                          value={form.target_user_id}
                          onChange={(event) => setForm((current) => ({ ...current, target_user_id: event.target.value }))}
                        />
                      </div>
                    ) : null}
                    {form.target_type === "class_ids" ? (
                      <div className="ui-admin-form__field">
                        <label htmlFor="notification_class_ids">班级 ID</label>
                        <input
                          id="notification_class_ids"
                          placeholder="多个用逗号分隔"
                          value={form.class_ids}
                          onChange={(event) => setForm((current) => ({ ...current, class_ids: event.target.value }))}
                        />
                      </div>
                    ) : null}
                    {form.target_type === "user_types" || form.target_type === "exclude_user_types" ? (
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
                      <label htmlFor="notification_content">通知内容</label>
                      <textarea
                        id="notification_content"
                        value={form.content}
                        onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                      />
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

const userTypeOptions = [
  { value: "tenant_admin", label: "租户管理员" },
  { value: "school_admin", label: "组织管理员" },
  { value: "teacher", label: "教师" },
  { value: "student", label: "学生" },
  { value: "staff", label: "职员" }
];

function buildNotificationPayload(form: NotificationFormState): NotificationInput | string {
  if (!form.title.trim()) {
    return "请填写通知标题。";
  }
  if (!form.content.trim()) {
    return "请填写通知内容。";
  }
  const targetScope: Record<string, unknown> = {};
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

function buildNotificationQuery(status: string, category: string, page: number, pageSize: number): NotificationListQuery {
  return {
    status: status || undefined,
    category: category || undefined,
    page,
    page_size: pageSize
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "通知中心接口暂不可用，请检查后端 /api/v1/notifications 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "通知查询参数错误，请检查状态或分类。";
  }
  return message || "通知数据加载失败";
}

function formatNotificationStatus(value: string): string {
  if (value === "read") {
    return "已读";
  }
  if (value === "unread") {
    return "未读";
  }
  return value || "-";
}

function notificationStatusClassName(value: string): string {
  if (value === "read") {
    return "ui-admin-status ui-admin-status--active";
  }
  return "ui-admin-status ui-admin-status--draft";
}

function formatNotificationCategory(value: string): string {
  if (value === "notice") {
    return "公告通知";
  }
  if (value === "direct") {
    return "站内通知";
  }
  return value || "-";
}

function formatSourceType(value?: string | null): string {
  if (!value) {
    return "-";
  }
  if (value === "notice") {
    return "公告";
  }
  return value;
}

function summarizeContent(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return value.length > 48 ? `${value.slice(0, 48)}...` : value;
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

function downloadCsv<TRecord extends Record<string, unknown>>(
  filename: string,
  columns: Array<{ key: keyof TRecord; title: string }>,
  rows: TRecord[]
) {
  const header = columns.map((column) => escapeCsvValue(column.title)).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(String(row[column.key] ?? ""))).join(","))
    .join("\n");
  const content = [header, body].filter(Boolean).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string): string {
  if ([",", "\"", "\n"].some((token) => value.includes(token))) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
