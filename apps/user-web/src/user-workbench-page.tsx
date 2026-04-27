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
  const primaryEntry = quickEntries[0];
  const secondaryEntry = quickEntries[1];
  const primaryPath = primaryEntry?.path ?? "";
  const secondaryPath = secondaryEntry?.path ?? "";

  return (
    <section aria-label="用户工作台" className="ui-workbench ui-workbench--user">
      <div className="ui-hero-panel">
        <div className="ui-hero-panel__content">
          <span className="ui-hero-panel__eyebrow">Learning route</span>
          <h2>{userDisplayName}，把今天的学习推进到下一步。</h2>
          <p>{`${userTypeLabel}工作台把课程、练题、考试和通知组织成一条清晰路径；先进入最重要任务，再回看错题与反馈。`}</p>
          <div className="ui-hero-panel__actions">
            {primaryPath ? (
              <button type="button" className="ui-button ui-button--primary" onClick={() => onNavigate(primaryPath)}>
                继续 {primaryEntry.name}
              </button>
            ) : null}
            {secondaryPath ? (
              <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate(secondaryPath)}>
                查看 {secondaryEntry.name}
              </button>
            ) : null}
          </div>
          <div className="ui-learning-strip" aria-label="学习路径要点">
            <span>课程入口</span>
            <span>练题闭环</span>
            <span>考试恢复</span>
            <span>通知同步</span>
          </div>
        </div>
        <aside className="ui-hero-panel__aside" aria-label="今日学习节奏">
          <div className="ui-hero-metric">
            <span>可用入口</span>
            <strong>{quickEntries.length}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>推荐顺序</span>
            <strong>3</strong>
          </div>
          <div className="ui-hero-metric">
            <span>当前身份</span>
            <strong>{userTypeLabel.slice(0, 2)}</strong>
          </div>
        </aside>
      </div>

      <div className="ui-stat-grid">
        <article className="ui-stat-card">
          <div className="ui-stat-card__icon" aria-hidden="true">
            课
          </div>
          <div className="ui-stat-card__content">
            <span>第一步</span>
            <strong>进入课程</strong>
            <small>从课程或题库选择今天的练习来源</small>
          </div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-card__icon" aria-hidden="true">
            练
          </div>
          <div className="ui-stat-card__content">
            <span>第二步</span>
            <strong>完成练题</strong>
            <small>提交答案、标熟题、沉淀错题和疑惑</small>
          </div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-card__icon" aria-hidden="true">
            考
          </div>
          <div className="ui-stat-card__content">
            <span>第三步</span>
            <strong>处理考试</strong>
            <small>查看考试、继续作答或回看成绩</small>
          </div>
        </article>
      </div>

      <div className="ui-learning-plan-grid">
        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <div>
              <span className="ui-kicker">Plan</span>
              <h3>今日建议</h3>
              <p>减少后台感，把学习动作压缩成可以马上执行的三步。</p>
            </div>
          </header>
          <ol className="ui-learning-steps">
            <li>
              <strong>打开课程或练题中心</strong>
              <small>先确定来源和题量</small>
            </li>
            <li>
              <strong>完成一轮答题</strong>
              <small>错题、熟题、疑惑自动沉淀</small>
            </li>
            <li>
              <strong>回看通知与考试</strong>
              <small>确认截止时间和待处理事项</small>
            </li>
          </ol>
        </section>

        <section className="ui-panel-card">
          <header className="ui-panel-card__header">
            <div>
              <span className="ui-kicker">Launchpad</span>
              <h3>快捷入口</h3>
              <p>根据登录后菜单树展示当前账号可用功能。</p>
            </div>
          </header>
          <div className="ui-quick-grid">
            {quickEntries.map((entry) => (
              <button
                key={`${entry.id}-${entry.path}`}
                type="button"
                className="ui-quick-button"
                aria-label={`快捷进入${entry.name}`}
                onClick={() => {
                  if (entry.path) {
                    onNavigate(entry.path);
                  }
                }}
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
