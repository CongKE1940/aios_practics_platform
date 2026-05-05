import { useEffect, useState, type CSSProperties } from "react";

import type { PageResult } from "@aios/api-sdk";

interface UserWorkbenchApi {
  listCourses?(query?: { status?: string; page?: number; page_size?: number }): Promise<PageResult<unknown>>;
  listPracticeSessions?(query?: { page?: number; page_size?: number }): Promise<PageResult<unknown>>;
  listUserQuestionStates?(query?: { state_type?: string; page?: number; page_size?: number }): Promise<PageResult<unknown>>;
  listExams?(query?: { status?: string; page?: number; page_size?: number }): Promise<PageResult<unknown>>;
  listNotifications?(query?: { status?: string; page?: number; page_size?: number }): Promise<PageResult<unknown>>;
  listQuestionBanks?(query?: { status?: string; page?: number; page_size?: number }): Promise<PageResult<unknown>>;
}

interface UserWorkbenchPageProps {
  api?: UserWorkbenchApi;
  userDisplayName: string;
  userTypeLabel: string;
}

interface UserWorkbenchStats {
  courseCount: number;
  practiceSessionCount: number;
  wrongQuestionCount: number;
  masteredQuestionCount: number;
  confusedQuestionCount: number;
  examCount: number;
  unreadNotificationCount: number;
  notificationCount: number;
  questionBankCount: number;
}

const emptyStats: UserWorkbenchStats = {
  courseCount: 0,
  practiceSessionCount: 0,
  wrongQuestionCount: 0,
  masteredQuestionCount: 0,
  confusedQuestionCount: 0,
  examCount: 0,
  unreadNotificationCount: 0,
  notificationCount: 0,
  questionBankCount: 0
};

export function UserWorkbenchPage({
  api,
  userDisplayName,
  userTypeLabel
}: UserWorkbenchPageProps) {
  const [stats, setStats] = useState<UserWorkbenchStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const questionStateTotal = stats.wrongQuestionCount + stats.masteredQuestionCount + stats.confusedQuestionCount;
  const rhythmRows = [
    { label: "课程", value: stats.courseCount },
    { label: "练习", value: stats.practiceSessionCount },
    { label: "考试", value: stats.examCount },
    { label: "未读通知", value: stats.unreadNotificationCount }
  ];
  const resourceCount = stats.courseCount + stats.questionBankCount + stats.examCount + stats.notificationCount;
  const resourceTotal = Math.max(1, resourceCount);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadUserWorkbenchStats(api)
      .then((result) => {
        if (active) {
          setStats(result);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section aria-label="用户工作台" className="ui-workbench ui-workbench--user" aria-busy={loading}>
      <div className="ui-hero-panel">
        <div className="ui-hero-panel__content">
          <span className="ui-hero-panel__eyebrow">Learning route</span>
          <h2>{userDisplayName}，把今天的学习推进到下一步。</h2>
          <p>{`${userTypeLabel}工作台把课程、练题、考试和通知组织成一条清晰路径；先进入最重要任务，再回看错题与反馈。`}</p>
          <div className="ui-learning-strip" aria-label="学习路径要点">
            <span>课程入口</span>
            <span>练题闭环</span>
            <span>考试恢复</span>
            <span>通知同步</span>
          </div>
        </div>
        <aside className="ui-hero-panel__aside" aria-label="今日学习节奏">
          <div className="ui-hero-metric">
            <span>学习资源</span>
            <strong>{loading ? "--" : formatNumber(resourceCount)}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>待关注</span>
            <strong>{loading ? "--" : stats.wrongQuestionCount + stats.unreadNotificationCount}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>当前身份</span>
            <strong>{userTypeLabel.slice(0, 2)}</strong>
          </div>
        </aside>
      </div>

      <div style={visualGridStyle}>
        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="学习节奏概览">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">Rhythm</span>
              <h3>学习节奏概览</h3>
              <p>把课程、练题、考试和通知放在同一张视图里。</p>
            </div>
            <strong>{loading ? "--" : formatNumber(resourceCount)}</strong>
          </header>
          <BarChart rows={rhythmRows} loading={loading} />
        </section>

        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="题目状态分布">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">Question states</span>
              <h3>题目状态分布</h3>
              <p>错题、熟题、疑惑题的沉淀情况。</p>
            </div>
            <strong>{loading ? "--" : formatNumber(questionStateTotal)}</strong>
          </header>
          <div style={donutLayoutStyle}>
            <div
              role="img"
              aria-label={`错题 ${stats.wrongQuestionCount}，熟题 ${stats.masteredQuestionCount}，疑惑题 ${stats.confusedQuestionCount}`}
              style={buildDonutStyle([
                { value: stats.wrongQuestionCount, color: "#ef4444" },
                { value: stats.masteredQuestionCount, color: "#14b8a6" },
                { value: stats.confusedQuestionCount, color: "#f59e0b" }
              ])}
            >
              <span style={donutCenterStyle}>{loading ? "--" : formatNumber(questionStateTotal)}</span>
            </div>
            <div style={legendListStyle}>
              <LegendItem color="#ef4444" label="错题" value={loading ? "--" : formatNumber(stats.wrongQuestionCount)} />
              <LegendItem color="#14b8a6" label="熟题" value={loading ? "--" : formatNumber(stats.masteredQuestionCount)} />
              <LegendItem color="#f59e0b" label="疑惑题" value={loading ? "--" : formatNumber(stats.confusedQuestionCount)} />
            </div>
          </div>
        </section>

        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="学习资源占比">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">Resources</span>
              <h3>学习资源占比</h3>
              <p>当前账号可触达资源的粗略分布。</p>
            </div>
          </header>
          <div className="ui-admin-progress-list">
            <ProgressRow label="课程" value={stats.courseCount} total={resourceTotal} loading={loading} />
            <ProgressRow label="题库" value={stats.questionBankCount} total={resourceTotal} loading={loading} />
            <ProgressRow label="考试" value={stats.examCount} total={resourceTotal} loading={loading} />
            <ProgressRow label="通知" value={stats.notificationCount} total={resourceTotal} loading={loading} />
          </div>
        </section>

        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="下一步行动">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">Next</span>
              <h3>下一步行动</h3>
              <p>按“先学习、再巩固、最后处理提醒”的顺序推进。</p>
            </div>
          </header>
          <ol className="ui-learning-steps" style={stepListStyle}>
            <li>
              <strong>打开课程或题库</strong>
              <small>先确定今天的学习来源</small>
            </li>
            <li>
              <strong>处理错题与疑惑</strong>
              <small>{loading ? "当前待关注 -- 题" : `当前待关注 ${formatNumber(stats.wrongQuestionCount + stats.confusedQuestionCount)} 题`}</small>
            </li>
            <li>
              <strong>查看考试和通知</strong>
              <small>{loading ? "未读通知 -- 条" : `未读通知 ${formatNumber(stats.unreadNotificationCount)} 条`}</small>
            </li>
          </ol>
        </section>
      </div>
    </section>
  );
}

async function loadUserWorkbenchStats(api?: UserWorkbenchApi): Promise<UserWorkbenchStats> {
  if (!api) {
    return emptyStats;
  }

  const [courses, practiceSessions, wrongQuestions, masteredQuestions, confusedQuestions, exams, unreadNotifications, notifications, questionBanks] =
    await Promise.all([
      settleValue(() => api.listCourses?.({ status: "active", page: 1, page_size: 1 })),
      settleValue(() => api.listPracticeSessions?.({ page: 1, page_size: 1 })),
      settleValue(() => api.listUserQuestionStates?.({ state_type: "wrong", page: 1, page_size: 1 })),
      settleValue(() => api.listUserQuestionStates?.({ state_type: "mastered", page: 1, page_size: 1 })),
      settleValue(() => api.listUserQuestionStates?.({ state_type: "confused", page: 1, page_size: 1 })),
      settleValue(() => api.listExams?.({ page: 1, page_size: 1 })),
      settleValue(() => api.listNotifications?.({ status: "unread", page: 1, page_size: 1 })),
      settleValue(() => api.listNotifications?.({ page: 1, page_size: 1 })),
      settleValue(() => api.listQuestionBanks?.({ page: 1, page_size: 1 }))
    ]);

  return {
    courseCount: totalOf(courses),
    practiceSessionCount: totalOf(practiceSessions),
    wrongQuestionCount: totalOf(wrongQuestions),
    masteredQuestionCount: totalOf(masteredQuestions),
    confusedQuestionCount: totalOf(confusedQuestions),
    examCount: totalOf(exams),
    unreadNotificationCount: totalOf(unreadNotifications),
    notificationCount: totalOf(notifications),
    questionBankCount: totalOf(questionBanks)
  };
}

async function settleValue<T>(loader: () => Promise<T> | T | undefined): Promise<T | undefined> {
  try {
    return await loader();
  } catch {
    return undefined;
  }
}

function totalOf(result?: PageResult<unknown>): number {
  return result?.total ?? result?.items.length ?? 0;
}

function BarChart({ rows, loading }: { rows: Array<{ label: string; value: number }>; loading: boolean }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="ui-admin-bar-chart">
      {rows.map((row) => (
        <div key={row.label} className="ui-admin-bar-row">
          <header>
            <span>{row.label}</span>
            <strong>{loading ? "--" : formatNumber(row.value)}</strong>
          </header>
          <div className="ui-admin-bar-track">
            <div className="ui-admin-bar-fill" style={{ width: `${loading ? 18 : Math.max(8, (row.value / maxValue) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressRow({ label, value, total, loading }: { label: string; value: number; total: number; loading: boolean }) {
  const percent = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className="ui-admin-progress-row">
      <header>
        <span>{label}</span>
        <strong>{loading ? "--" : `${formatPercent(percent)} / ${formatNumber(value)}`}</strong>
      </header>
      <div className="ui-admin-progress-track">
        <div className="ui-admin-progress-fill" style={{ width: `${loading ? 18 : percent}%` }} />
      </div>
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={legendItemStyle}>
      <span style={{ ...legendDotStyle, background: color }} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildDonutStyle(segments: Array<{ value: number; color: string }>): CSSProperties {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  if (total <= 0) {
    return { ...donutStyle, background: "conic-gradient(#e2e8f0 0deg 360deg)" };
  }

  let cursor = 0;
  const gradient = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      const end = cursor + (segment.value / total) * 360;
      cursor = end;
      return `${segment.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  return { ...donutStyle, background: `conic-gradient(${gradient})` };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

const visualGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14
};

const visualPanelStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 16,
  minHeight: 260,
  padding: 20,
  borderRadius: 20
};

const donutLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
  alignItems: "center",
  gap: 20
};

const donutStyle: CSSProperties = {
  position: "relative",
  width: 132,
  height: 132,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center"
};

const donutCenterStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 78,
  height: 78,
  borderRadius: "50%",
  background: "rgba(255, 255, 255, 0.92)",
  color: "#214382",
  fontWeight: 800
};

const legendListStyle: CSSProperties = {
  display: "grid",
  gap: 12
};

const legendItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "12px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  color: "#4f6998",
  fontSize: 13
};

const legendDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999
};

const stepListStyle: CSSProperties = {
  margin: 0
};
