import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { Notice, NoticeInput, NotificationItem, PageResult } from "@aios/api-sdk";

import { downloadCsv, paginateItems, toggleSelectAll, toggleSelection } from "./list-page-utils";

export interface NoticeApi {
  listNotices(): Promise<PageResult<Notice>>;
  createNotice(body: NoticeInput): Promise<Notice>;
  publishNotice(id: number): Promise<Notice>;
  recallNotice(id: number): Promise<Notice>;
  listNotifications(): Promise<PageResult<NotificationItem>>;
  markNotificationRead(id: number): Promise<NotificationItem>;
}

const pageSize = 8;

const defaultNoticeForm = {
  title: "",
  content: "",
  notice_type: "system",
  publish_scope_type: "all",
  publish_at: "",
  expire_at: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; notice: Notice }
  | null;

export function NoticePanel({ api }: { api: NoticeApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [form, setForm] = useState(defaultNoticeForm);
  const [keyword, setKeyword] = useState("");
  const [selectedNoticeID, setSelectedNoticeID] = useState<number | null>(null);
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [noticeResult, notificationResult] = await Promise.all([api.listNotices(), api.listNotifications()]);
      setNotices(noticeResult.items);
      setNotifications(notificationResult.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载公告通知失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    if (!selectedNoticeID && notices.length > 0) {
      setSelectedNoticeID(notices[0].id);
    }
  }, [notices, selectedNoticeID]);

  useEffect(() => {
    setPage(1);
    setSelectedIDs([]);
  }, [keyword]);

  const filteredNotices = useMemo(
    () =>
      notices.filter((notice) =>
        [notice.title, notice.content, notice.notice_type].some((value) =>
          value.toLowerCase().includes(keyword.trim().toLowerCase())
        )
      ),
    [keyword, notices]
  );

  const pagination = useMemo(() => paginateItems(filteredNotices, page, pageSize), [filteredNotices, page]);
  const currentPageIDs = useMemo(() => pagination.items.map((item) => item.id), [pagination.items]);

  useEffect(() => {
    if (page !== pagination.page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createNotice({
      title: form.title,
      content: form.content,
      notice_type: form.notice_type,
      publish_scope_type: form.publish_scope_type,
      publish_scope: {},
      publish_at: normalizeDateTimeValue(form.publish_at) ?? "",
      expire_at: normalizeDateTimeValue(form.expire_at) ?? undefined
    });
    setForm(defaultNoticeForm);
    setModal(null);
    await loadAll();
  }

  async function handlePublish(id: number) {
    await api.publishNotice(id);
    await loadAll();
  }

  async function handleRecall(id: number) {
    await api.recallNotice(id);
    await loadAll();
  }

  async function handleRead(id: number) {
    await api.markNotificationRead(id);
    await loadAll();
  }

  async function handleBatchRecall() {
    if (selectedIDs.length === 0) {
      return;
    }
    await Promise.all(selectedIDs.map((id) => api.recallNotice(id)));
    setSelectedIDs([]);
    await loadAll();
  }

  function handleExport() {
    downloadCsv(
      "notices.csv",
      [
        { key: "title", title: "公告标题" },
        { key: "notice_type", title: "公告类型" },
        { key: "status", title: "状态" },
        { key: "publish_at", title: "发布时间" }
      ],
      filteredNotices
    );
  }

  return (
    <section aria-label="公告通知面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">公告通知</span>
            <h2>公告通知</h2>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <>
          <section className="ui-admin-filters ui-admin-card">
            <div className="ui-admin-filters__grid">
              <div className="ui-admin-form__field">
                <label htmlFor="notice_keyword">搜索公告</label>
                <input
                  id="notice_keyword"
                  placeholder="输入公告标题或内容"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="ui-admin-actions-bar ui-admin-card">
            <div className="ui-admin-actions-bar__group">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setModal({ type: "create" })}>
                新增公告
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void handleBatchRecall()}
                disabled={selectedIDs.length === 0}
              >
                批量删除
              </button>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleExport}>
                导出列表
              </button>
            </div>
            <div className="ui-admin-pagination__info">{`已选 ${selectedIDs.length} 项`}</div>
          </section>

          <section className="ui-admin-table-card">
            <div className="ui-admin-table-card__header">
              <div>
                <h3>公告列表</h3>
              </div>
            </div>
            <table className="ui-admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="ui-admin-table__checkbox"
                      aria-label="全选公告"
                      checked={currentPageIDs.length > 0 && currentPageIDs.every((id) => selectedIDs.includes(id))}
                      onChange={() => setSelectedIDs((current) => toggleSelectAll(current, currentPageIDs))}
                    />
                  </th>
                  <th>公告标题</th>
                  <th>公告类型</th>
                  <th>状态</th>
                  <th>发布时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((notice) => (
                  <tr key={notice.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="ui-admin-table__checkbox"
                        aria-label={`选择公告-${notice.id}`}
                        checked={selectedIDs.includes(notice.id)}
                        onChange={() => setSelectedIDs((current) => toggleSelection(current, notice.id))}
                      />
                    </td>
                    <td>{notice.title}</td>
                    <td>{notice.notice_type}</td>
                    <td>
                      <span className={statusClassName(notice.status)}>{formatStatusLabel(notice.status)}</span>
                    </td>
                    <td>{notice.publish_at ?? "-"}</td>
                    <td>
                      <div className="ui-admin-table__actions">
                        <button
                          type="button"
                          className="ui-admin-link"
                          onClick={() => {
                            setSelectedNoticeID(notice.id);
                            setModal({ type: "detail", notice });
                          }}
                        >
                          详情
                        </button>
                        <button
                          type="button"
                          className="ui-admin-link"
                          onClick={() => {
                            setSelectedNoticeID(notice.id);
                            setModal({ type: "detail", notice });
                          }}
                        >
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ui-admin-table__footer">
              <div className="ui-admin-pagination__info">{`共 ${pagination.total} 条，当前第 ${pagination.page} / ${pagination.pageCount} 页`}</div>
              <div className="ui-admin-pagination">
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}
                  disabled={pagination.page >= pagination.pageCount}
                >
                  下一页
                </button>
              </div>
            </div>
          </section>

          <section className="ui-admin-card">
            <div className="ui-admin-table-card__header">
              <div>
                <h3>我的通知</h3>
              </div>
            </div>
            <div className="ui-admin-mini-list">
              {notifications.map((notification) => (
                <article key={notification.id} className="ui-admin-mini-item">
                  <strong>{notification.title}</strong>
                  <p>{notification.content}</p>
                  <div className="ui-admin-row-meta">
                    <span>{notification.category}</span>
                    <span className={statusClassName(notification.status)}>{formatStatusLabel(notification.status)}</span>
                  </div>
                  {notification.status !== "read" ? (
                    <div className="ui-admin-side-card__actions">
                      <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleRead(notification.id)}>
                        标记已读
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="公告通知弹层">
            {modal.type === "create" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>新增公告</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
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
                          onChange={(event) => setForm((current) => ({ ...current, publish_scope_type: event.target.value }))}
                        >
                          <option value="all">全部用户</option>
                          <option value="role">指定角色</option>
                          <option value="class">指定班级</option>
                        </select>
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
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      新增公告
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>公告详情</h3>
                    <p>{modal.notice.title}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
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
                      <dt>状态</dt>
                      <dd>
                        <span className={statusClassName(modal.notice.status)}>{formatStatusLabel(modal.notice.status)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>发布时间</dt>
                      <dd>{modal.notice.publish_at ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>内容</dt>
                      <dd>{modal.notice.content}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleRecall(modal.notice.id)}>
                    撤回公告
                  </button>
                  <button type="button" className="ui-button ui-button--primary" onClick={() => void handlePublish(modal.notice.id)}>
                    发布公告
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
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
      return "ui-admin-status ui-admin-status--draft";
    case "recalled":
      return "ui-admin-status ui-admin-status--disabled";
    case "unread":
      return "ui-admin-status ui-admin-status--draft";
    default:
      return "ui-admin-status ui-admin-status--disabled";
  }
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
