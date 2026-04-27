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
        delta: `近 30 天学籍变更 ${summary?.recent_transition_count_30d ?? 0}`,
        icon: "校"
      },
      {
        label: "活跃用户",
        value: (summary?.active_student_count ?? 0) + (summary?.active_teacher_count ?? 0),
        delta: `教师 ${summary?.active_teacher_count ?? 0} / 学生 ${summary?.active_student_count ?? 0}`,
        icon: "人"
      },
      {
        label: "发布考试",
        value: summary?.published_exam_count ?? 0,
        delta: `待批阅 ${summary?.pending_review_count ?? 0}`,
        icon: "考"
      },
      {
        label: "学习会话",
        value: summary?.practice_session_count_7d ?? 0,
        delta: `已提交考试 ${summary?.submitted_exam_attempt_count ?? 0}`,
        icon: "练"
      }
    ];
  }, [overview]);

  const pendingItems = useMemo<ActionItem[]>(
    () => [
      { label: "主观题批阅队列", value: String(overview?.summary.pending_review_count ?? 0) },
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
        .slice(0, 6),
    [menus]
  );

  const primaryEntry = quickEntries[0];

  return (
    <section aria-label="管理工作台" className="ui-workbench ui-workbench--admin">
      <div className="ui-hero-panel">
        <div className="ui-hero-panel__content">
          <span className="ui-hero-panel__eyebrow">Operations cockpit</span>
          <h2>{userDisplayName}，今天先看风险，再推进教学运营。</h2>
          <p>
            将组织、课程、题库、考试、公告和审计动作放在同一条运营主线上；先处理红黄状态，再进入具体模块。
          </p>
          <div className="ui-hero-panel__actions">
            {primaryEntry?.path ? (
              <button type="button" className="ui-button ui-button--primary" onClick={() => onSelect(primaryEntry.path)}>
                进入 {primaryEntry.name}
              </button>
            ) : null}
            <button type="button" className="ui-button ui-button--ghost" onClick={() => onSelect("/admin/analytics")}>
              查看数据看板
            </button>
          </div>
          <div className="ui-hero-panel__meta" aria-label="今日运营重点">
            <span>权限驱动导航</span>
            <span>多租户边界</span>
            <span>题库到考试闭环</span>
          </div>
        </div>
        <aside className="ui-hero-panel__aside" aria-label="运营摘要">
          <div className="ui-hero-metric">
            <span>待批阅</span>
            <strong>{overview?.summary.pending_review_count ?? 0}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>近 7 天练题</span>
            <strong>{overview?.summary.practice_session_count_7d ?? 0}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>公告数量</span>
            <strong>{notices.length}</strong>
          </div>
        </aside>
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

      <div className="ui-dashboard-panel-grid">
        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <div>
              <span className="ui-kicker">Next actions</span>
              <h3>待处理事项</h3>
              <p>从需要人工判断的环节开始，避免运营风险堆积。</p>
            </div>
          </header>
          <ol className="ui-ops-list">
            {pendingItems.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <div>
              <span className="ui-kicker">Recent</span>
              <h3>近期动态</h3>
              <p>直接来自后端审计与公告数据，保持管理判断可追溯。</p>
            </div>
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
                <span>暂无近期审计动态</span>
                <small>等待后端返回</small>
              </li>
            )}
          </ul>
        </section>
      </div>

      <div className="ui-workbench-grid">
        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <div>
              <span className="ui-kicker">Launchpad</span>
              <h3>快捷入口</h3>
              <p>仅展示当前账号菜单树中可进入的功能。</p>
            </div>
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

        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <div>
              <span className="ui-kicker">Bulletin</span>
              <h3>系统公告</h3>
              <p>发布节奏、考试通知和课程运营信息统一沉淀。</p>
            </div>
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
                <small>可从公告通知中心创建</small>
              </li>
            )}
          </ul>
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
