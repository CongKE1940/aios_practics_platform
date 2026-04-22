import { useEffect, useState, type FormEvent } from "react";

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

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [noticeResult, notificationResult] = await Promise.all([
        api.listNotices(),
        api.listNotifications()
      ]);
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
    <section aria-label="公告通知面板">
      <h2>公告通知</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <section aria-label="公告管理">
        <h3>公告</h3>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="notice_title">公告标题</label>
          <input
            id="notice_title"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
          <label htmlFor="notice_content">公告内容</label>
          <input
            id="notice_content"
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
          />
          <label htmlFor="notice_type">公告类型</label>
          <select
            id="notice_type"
            value={form.notice_type}
            onChange={(event) => setForm((current) => ({ ...current, notice_type: event.target.value }))}
          >
            <option value="system">系统公告</option>
            <option value="activity">活动公告</option>
          </select>
          <label htmlFor="publish_at">发布时间</label>
          <input
            id="publish_at"
            type="datetime-local"
            value={form.publish_at}
            onChange={(event) => setForm((current) => ({ ...current, publish_at: event.target.value }))}
          />
          <label htmlFor="expire_at">过期时间</label>
          <input
            id="expire_at"
            type="datetime-local"
            value={form.expire_at}
            onChange={(event) => setForm((current) => ({ ...current, expire_at: event.target.value }))}
          />
          <button type="submit">新增公告</button>
        </form>

        <ul>
          {notices.map((notice) => (
            <li key={notice.id}>
              <span>{notice.title}</span>
              <span>{notice.status}</span>
              <button type="button" onClick={() => void handlePublish(notice.id)}>
                发布公告
              </button>
              <button type="button" onClick={() => void handleRecall(notice.id)}>
                撤回公告
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="我的通知">
        <h3>通知</h3>
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id}>
              <span>{notification.title}</span>
              <span>{notification.content}</span>
              <span>{notification.status}</span>
              {notification.status !== "read" ? (
                <button type="button" onClick={() => void handleRead(notification.id)}>
                  标记已读
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
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
