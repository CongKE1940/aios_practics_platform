import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { Notice, NoticeInput, NotificationItem, PageResult } from "@aios/api-sdk";

export interface NoticeApi {
  listNotices(): Promise<PageResult<Notice>>;
  createNotice(body: NoticeInput): Promise<Notice>;
  publishNotice(id: number): Promise<Notice>;
  recallNotice(id: number): Promise<Notice>;
  listNotifications(): Promise<PageResult<NotificationItem>>;
  markNotificationRead(id: number): Promise<NotificationItem>;
}

const defaultNoticeForm = {
  title: "",
  content: "",
  notice_type: "system",
  publish_scope_type: "all",
  publish_at: "",
  expire_at: ""
};

export function NoticePanel({ api }: { api: NoticeApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [form, setForm] = useState(defaultNoticeForm);
  const [keyword, setKeyword] = useState("");
  const [selectedNoticeID, setSelectedNoticeID] = useState<number | null>(null);

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

  const filteredNotices = useMemo(
    () =>
      notices.filter((notice) =>
        [notice.title, notice.content, notice.notice_type].some((value) =>
          value.toLowerCase().includes(keyword.trim().toLowerCase())
        )
      ),
    [keyword, notices]
  );

  const selectedNotice = useMemo(
    () => notices.find((notice) => notice.id === selectedNoticeID) ?? filteredNotices[0] ?? null,
    [filteredNotices, notices, selectedNoticeID]
  );

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

  return (
    <section aria-label="公告通知面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <span className="ui-admin-page__eyebrow">公告通知</span>
        <h2>公告通知</h2>
        <p>原型是典型的“左列表 + 右编辑”结构，这里继续复用现有公告与通知接口，不额外创造新闻轮播等二级模块。</p>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-list-card">
              <div className="ui-admin-list-card__header">
                <div>
                  <h3>公告列表</h3>
                  <p>共 {filteredNotices.length} 条公告。</p>
                </div>
              </div>
              <div className="ui-admin-form__field">
                <label htmlFor="notice_keyword">搜索公告</label>
                <input
                  id="notice_keyword"
                  placeholder="搜索公告标题"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="ui-admin-notice-list">
                {filteredNotices.map((notice) => (
                  <article
                    key={notice.id}
                    className={["ui-admin-notice-card", selectedNotice?.id === notice.id ? "is-active" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="ui-admin-card__header">
                      <h4>{notice.title}</h4>
                      <span className={statusClassName(notice.status)}>{formatStatusLabel(notice.status)}</span>
                    </div>
                    <p>{notice.content}</p>
                    <div className="ui-admin-notice-card__meta">
                      <span>{notice.publish_at ?? "未设置发布时间"}</span>
                      <span>{notice.notice_type}</span>
                    </div>
                    <div className="ui-admin-table__actions">
                      <button type="button" className="ui-admin-link" onClick={() => setSelectedNoticeID(notice.id)}>
                        查看
                      </button>
                      <button type="button" className="ui-admin-link" onClick={() => void handlePublish(notice.id)}>
                        发布公告
                      </button>
                      <button type="button" className="ui-admin-link" onClick={() => void handleRecall(notice.id)}>
                        撤回公告
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>我的通知</h3>
                  <p>保留通知列表，支持标记已读。</p>
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
          </div>

          <aside className="ui-admin-side-card">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>编辑公告</h3>
                  <p>继续按现有公告字段提交。</p>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmit(event)}>
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
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增公告
                  </button>
                </div>
              </form>
            </section>

            {selectedNotice ? (
              <section className="ui-admin-card">
                <div className="ui-admin-card__header">
                  <div>
                    <h3>当前选中公告</h3>
                    <p>{selectedNotice.title}</p>
                  </div>
                </div>
                <dl className="ui-admin-meta-list">
                  <div>
                    <dt>标题</dt>
                    <dd>{selectedNotice.title}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>
                      <span className={statusClassName(selectedNotice.status)}>{formatStatusLabel(selectedNotice.status)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>发布时间</dt>
                    <dd>{selectedNotice.publish_at ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>内容</dt>
                    <dd>{selectedNotice.content}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </aside>
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
    case "unread":
      return "ui-admin-status ui-admin-status--draft";
    case "recalled":
      return "ui-admin-status ui-admin-status--disabled";
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
