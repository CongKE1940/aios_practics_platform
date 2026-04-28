import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { NotificationItem, NotificationListQuery, PageResult } from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

export interface NotificationCenterApi {
  listNotifications(query?: NotificationListQuery): Promise<PageResult<NotificationItem>>;
  markNotificationRead(id: number): Promise<NotificationItem>;
}

const defaultPageSize = 10;

type ModalState = { type: "detail"; item: NotificationItem } | null;

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

export function NotificationCenterPage({ api }: { api: NotificationCenterApi }) {
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

  async function handleMarkRead(item: NotificationItem) {
    await api.markNotificationRead(item.id);
    if (modal?.type === "detail" && modal.item.id === item.id) {
      setModal({ type: "detail", item: { ...modal.item, status: "read", read_at: new Date().toISOString() } });
    }
    await loadNotifications();
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
          <div className="ui-admin-form__field">
            <label htmlFor="notification_status_filter">状态 status</label>
            <select id="notification_status_filter" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="unread">未读</option>
              <option value="read">已读</option>
            </select>
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="notification_category_filter">分类 category</label>
            <select id="notification_category_filter" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">全部分类</option>
              <option value="notice">公告通知</option>
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
          rows={items}
          columns={columns}
          getRowId={(item) => item.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onExport={handleExport}
          onDetail={(item) => setModal({ type: "detail", item })}
          onEdit={(item) => void handleMarkRead(item)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无通知数据"}
          ariaLabel="通知列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          editLabel="标记已读"
          rowCheckboxLabel={(item) => `选择通知-${item.title}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="通知详情弹层">
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
                  <dt>来源 ID</dt>
                  <dd>{modal.item.source_id ?? "-"}</dd>
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
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => void handleMarkRead(modal.item)}>
                标记已读
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
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
