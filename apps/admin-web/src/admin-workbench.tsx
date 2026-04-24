import { useEffect, useMemo, useState } from "react";

import type { AdminOverviewResult, MenuItem, Notice } from "@aios/api-sdk";

import type { AnalyticsPanelApi } from "./analytics-panel";
import type { NoticeApi } from "./notice-panel";

interface AdminWorkbenchProps {
  analyticsApi?: AnalyticsPanelApi;
  noticeApi?: NoticeApi;
  menus: MenuItem[];
  userDisplayName: string;
  onSelect(path: string): void;
}

interface SummaryCard {
  label: string;
  value: number;
  delta: string;
  icon: string;
}

interface ActionItem {
  label: string;
  value: string;
}

export function AdminWorkbench({ analyticsApi, noticeApi, menus, userDisplayName, onSelect }: AdminWorkbenchProps) {
  const [overview, setOverview] = useState<AdminOverviewResult | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let active = true;

    if (analyticsApi) {
      void analyticsApi.getAdminOverview().then((result) => {
        if (active) {
          setOverview(result);
        }
      });
    }

    if (noticeApi) {
      void noticeApi.listNotices().then((result) => {
        if (active) {
          setNotices(result.items);
        }
      });
    }

    return () => {
      active = false;
    };
  }, [analyticsApi, noticeApi]);

  const cards = useMemo<SummaryCard[]>(() => {
    const summary = overview?.summary;
    return [
      {
        label: "组织总数",
        value: summary?.school_count ?? 0,
        delta: `较昨日 +${summary?.recent_transition_count_30d ?? 0}`,
        icon: "校"
      },
      {
        label: "用户总数",
        value: (summary?.active_student_count ?? 0) + (summary?.active_teacher_count ?? 0),
        delta: `活跃教师 ${summary?.active_teacher_count ?? 0}`,
        icon: "人"
      },
      {
        label: "考试总数",
        value: summary?.published_exam_count ?? 0,
        delta: `待批阅 ${summary?.pending_review_count ?? 0}`,
        icon: "考"
      },
      {
        label: "今日参与人数",
        value: summary?.submitted_exam_attempt_count ?? 0,
        delta: `近 7 天练题 ${summary?.practice_session_count_7d ?? 0}`,
        icon: "练"
      }
    ];
  }, [overview]);

  const pendingItems = useMemo<ActionItem[]>(
    () => [
      { label: "待处理的主观题批阅", value: String(overview?.summary.pending_review_count ?? 0) },
      { label: "近 30 天学籍变更", value: String(overview?.summary.recent_transition_count_30d ?? 0) },
      { label: "近 7 天练题会话", value: String(overview?.summary.practice_session_count_7d ?? 0) },
      { label: "已发布考试", value: String(overview?.summary.published_exam_count ?? 0) }
    ],
    [overview]
  );

  const recentActivities = useMemo<ActionItem[]>(
    () =>
      overview?.recent_audit_logs.slice(0, 5).map((item) => ({
        label: `${item.module_name} / ${item.action_name}`,
        value: item.created_at
      })) ?? [],
    [overview]
  );

  const quickEntries = useMemo(
    () =>
      flattenMenuItems(menus)
        .filter((item) => item.path)
        .slice(0, 4),
    [menus]
  );

  return (
    <section aria-label="工作台面板" className="ui-workbench">
      <div className="ui-workbench__header">
        <div>
          <h2>工作台</h2>
          <p>上午好，{userDisplayName}</p>
        </div>
      </div>

      <div className="ui-stat-grid">
        {cards.map((card) => (
          <article key={card.label} className="ui-stat-card">
            <div className="ui-stat-card__icon" aria-hidden="true">
              {card.icon}
            </div>
            <div className="ui-stat-card__content">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.delta}</small>
            </div>
          </article>
        ))}
      </div>

      <div className="ui-workbench-grid">
        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <h3>待处理事项</h3>
          </header>
          <ul className="ui-panel-list">
            {pendingItems.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <h3>近期动态</h3>
          </header>
          <ul className="ui-panel-list">
            {recentActivities.length > 0 ? (
              recentActivities.map((item) => (
                <li key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <small>{item.value}</small>
                </li>
              ))
            ) : (
              <li>
                <span>正在接入近期动态</span>
              </li>
            )}
          </ul>
        </section>

        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <h3>系统公告</h3>
          </header>
          <ul className="ui-panel-list">
            {notices.length > 0 ? (
              notices.slice(0, 4).map((notice) => (
                <li key={notice.id}>
                  <span>{notice.title}</span>
                  <small>{notice.publish_at ?? "未发布"}</small>
                </li>
              ))
            ) : (
              <li>
                <span>暂无公告</span>
              </li>
            )}
          </ul>
        </section>

        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <h3>快捷入口</h3>
          </header>
          <div className="ui-quick-grid">
            {quickEntries.map((entry) => (
              <button
                key={`${entry.id}-${entry.path}`}
                type="button"
                className="ui-quick-button"
                aria-label={`快捷进入${entry.name}`}
                onClick={() => onSelect(entry.path)}
              >
                <span className="ui-quick-button__icon" aria-hidden="true">
                  {entry.name.slice(0, 1)}
                </span>
                <strong>{entry.name}</strong>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function flattenMenuItems(menus: MenuItem[]): MenuItem[] {
  const items: MenuItem[] = [];

  for (const menu of menus) {
    items.push(menu);
    if (menu.children.length > 0) {
      items.push(...flattenMenuItems(menu.children));
    }
  }

  return items;
}
