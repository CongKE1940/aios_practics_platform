import { useMemo } from "react";

import type { MenuItem } from "@aios/api-sdk";

interface UserWorkbenchPageProps {
  menus: MenuItem[];
  userDisplayName: string;
  userTypeLabel: string;
  onNavigate(path: string): void;
}

export function UserWorkbenchPage({
  menus,
  userDisplayName,
  userTypeLabel,
  onNavigate
}: UserWorkbenchPageProps) {
  const quickEntries = useMemo(
    () =>
      flattenMenuItems(menus)
        .filter((item) => item.path && item.path !== "/app" && item.path !== "/app/workbench")
        .slice(0, 6),
    [menus]
  );

  return (
    <section aria-label="用户工作台" className="ui-workbench ui-workbench--user">
      <div className="ui-workbench__header">
        <div>
          <h2>用户工作台</h2>
          <p>{`${userTypeLabel} ${userDisplayName}，继续今天的学习任务。`}</p>
        </div>
      </div>

      <div className="ui-stat-grid">
        <article className="ui-stat-card">
          <div className="ui-stat-card__icon" aria-hidden="true">
            今
          </div>
          <div className="ui-stat-card__content">
            <span>今日学习</span>
            <strong>继续完成练题与考试</strong>
            <small>从下方快捷入口直接继续</small>
          </div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-card__icon" aria-hidden="true">
            考
          </div>
          <div className="ui-stat-card__content">
            <span>待处理考试</span>
            <strong>查看最近考试与结果</strong>
            <small>支持继续作答或查看成绩</small>
          </div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-card__icon" aria-hidden="true">
            通
          </div>
          <div className="ui-stat-card__content">
            <span>消息提醒</span>
            <strong>统一进入通知中心</strong>
            <small>查看公告、系统消息与状态变化</small>
          </div>
        </article>
      </div>

      <div className="ui-workbench-grid">
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
                onClick={() => onNavigate(entry.path)}
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
            <h3>今日建议</h3>
          </header>
          <ul className="ui-panel-list">
            <li>
              <span>先进入练题中心完成日常题量</span>
            </li>
            <li>
              <span>再查看考试入口或考试管理</span>
            </li>
            <li>
              <span>最后统一处理通知与反馈</span>
            </li>
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
