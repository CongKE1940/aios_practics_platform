import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { AnnouncementListQuery, Notice, PageResult } from "@aios/api-sdk";
import {
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

export interface SystemAnnouncementApi {
  listAnnouncements(query?: AnnouncementListQuery): Promise<PageResult<Notice>>;
  markAnnouncementRead(id: number): Promise<Notice>;
}

const defaultPageSize = 10;

type ModalState = { type: "detail"; notice: Notice } | null;

const columns: Array<FixedActionListColumn<Notice>> = [
  {
    key: "title",
    title: "公告标题",
    render: (notice) => notice.title
  },
  {
    key: "publisher_name",
    title: "发布人",
    width: 140,
    render: (notice) => notice.publisher_name || notice.publisher_id
  },
  {
    key: "publish_at",
    title: "发布时间",
    width: 170,
    render: (notice) => formatDateTime(notice.publish_at)
  },
  {
    key: "read_status",
    title: "阅读状态",
    width: 120,
    render: (notice) => <span className={readStatusClassName(notice.read_status)}>{formatReadStatus(notice.read_status)}</span>
  },
  {
    key: "content",
    title: "公告摘要",
    render: (notice) => summarizeContent(notice.content)
  }
];

export function SystemAnnouncementPage({
  api,
  onUnreadMayChange
}: {
  api: SystemAnnouncementApi;
  onUnreadMayChange?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<Notice[]>([]);
  const [readStatus, setReadStatus] = useState("");
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
    void loadAnnouncements(buildAnnouncementQuery("", 1, defaultPageSize));
  }, [api]);

  async function loadAnnouncements(query: AnnouncementListQuery = buildAnnouncementQuery(readStatus, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listAnnouncements(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? error.message : "系统公告加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadAnnouncements(buildAnnouncementQuery(readStatus, 1, pageSize));
  }

  async function handleReset() {
    setReadStatus("");
    setSelectedIDs([]);
    await loadAnnouncements(buildAnnouncementQuery("", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadAnnouncements(buildAnnouncementQuery(readStatus, nextPage, pageSize));
  }

  async function openDetail(notice: Notice) {
    let nextNotice = notice;
    if (notice.read_status !== "read") {
      nextNotice = await api.markAnnouncementRead(notice.id);
      onUnreadMayChange?.();
      await loadAnnouncements();
    }
    setModal({ type: "detail", notice: nextNotice });
  }

  return (
    <section aria-label="系统公告" className="ui-admin-page ui-user-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="系统公告加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}
      <section className="ui-admin-card" aria-label="系统公告数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterSelect id="announcement_read_status_filter" label="阅读状态" placeholder="请选择阅读状态" value={readStatus} onChange={setReadStatus}>
            <option value="unread">未读</option>
            <option value="read">已读</option>
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
          getRowId={(notice) => notice.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onDetail={(notice) => void openDetail(notice)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无系统公告"}
          ariaLabel="系统公告列表"
          rowCheckboxLabel={(notice) => `选择公告-${notice.title}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="系统公告详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>系统公告</h3>
                <p>{modal.notice.title}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>公告内容</dt>
                  <dd>{modal.notice.content}</dd>
                </div>
                <div>
                  <dt>发布人</dt>
                  <dd>{modal.notice.publisher_name || modal.notice.publisher_id}</dd>
                </div>
                <div>
                  <dt>发布时间</dt>
                  <dd>{formatDateTime(modal.notice.publish_at)}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildAnnouncementQuery(readStatus: string, page: number, pageSize: number): AnnouncementListQuery {
  return {
    notice_type: "system",
    read_status: readStatus || undefined,
    page,
    page_size: pageSize
  };
}

function formatReadStatus(value?: string): string {
  return value === "read" ? "已读" : "未读";
}

function readStatusClassName(value?: string): string {
  return value === "read" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--draft";
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
  gridTemplateColumns: "minmax(220px, 300px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
