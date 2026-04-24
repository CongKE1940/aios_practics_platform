import { useEffect, useMemo, useState } from "react";

import type { NotificationItem, PageResult } from "@aios/api-sdk";

export interface NotificationCenterApi {
  listNotifications(): Promise<PageResult<NotificationItem>>;
  markNotificationRead(id: number): Promise<NotificationItem>;
}

export function NotificationCenterPage({ api }: { api: NotificationCenterApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void loadNotifications();
  }, [api]);

  async function loadNotifications() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listNotifications();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载通知失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id: number) {
    await api.markNotificationRead(id);
    await loadNotifications();
  }

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "") {
          return true;
        }
        return item.status === filter;
      }),
    [filter, items]
  );

  return (
    <section aria-label="通知中心" className="ui-admin-page ui-user-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">通知中心</span>
            <h2>通知中心</h2>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-main">
          <section className="ui-admin-filters ui-admin-card">
            <div className="ui-admin-filters__grid ui-admin-filters__grid--compact">
              <div className="ui-admin-form__field">
                <label htmlFor="notification_filter_status">状态筛选</label>
                <select id="notification_filter_status" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="">全部消息</option>
                  <option value="unread">未读</option>
                  <option value="read">已读</option>
                </select>
              </div>
            </div>
          </section>

          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>消息列表</h3>
              </div>
            </div>
            {filteredItems.length > 0 ? (
              <div className="ui-admin-mini-list">
                {filteredItems.map((item) => (
                  <article key={item.id} className="ui-admin-mini-item">
                    <div className="ui-admin-card__header">
                      <strong>{item.title}</strong>
                      <span className={notificationStatusClassName(item.status)}>{formatNotificationStatus(item.status)}</span>
                    </div>
                    <p>{item.content}</p>
                    <div className="ui-admin-row-meta">
                      <span>{item.category}</span>
                      <span>{item.source_type ?? "-"}</span>
                    </div>
                    {item.status !== "read" ? (
                      <div className="ui-admin-side-card__actions">
                        <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleMarkRead(item.id)}>
                          标记已读
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="ui-admin-empty-inline">当前没有符合条件的通知</div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatNotificationStatus(value: string): string {
  if (value === "read") {
    return "已读";
  }
  if (value === "unread") {
    return "未读";
  }
  return value;
}

function notificationStatusClassName(value: string): string {
  if (value === "read") {
    return "ui-admin-status ui-admin-status--inactive";
  }
  return "ui-admin-status ui-admin-status--pending";
}
