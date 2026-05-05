import { useEffect, useMemo, useState } from "react";

import type { AdminOverviewResult } from "@aios/api-sdk";

export interface AnalyticsPanelApi {
  getAdminOverview(): Promise<AdminOverviewResult>;
}

interface MetricItem {
  label: string;
  value: number;
}

interface CountRankingItem {
  rank: number;
  label: string;
  count: number;
  percent: number;
}

export function AnalyticsPanel({ api }: { api: AnalyticsPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [overview, setOverview] = useState<AdminOverviewResult | null>(null);

  useEffect(() => {
    void loadOverview();
  }, [api]);

  async function loadOverview() {
    setLoading(true);
    setErrorMessage("");
    try {
      setOverview(await api.getAdminOverview());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载数据看板失败");
    } finally {
      setLoading(false);
    }
  }

  const metrics = useMemo<MetricItem[]>(
    () =>
      overview
        ? [
            { label: "学校数", value: overview.summary.school_count },
            { label: "课程数", value: overview.summary.course_count },
            { label: "在校学生", value: overview.summary.active_student_count },
            { label: "活跃教师", value: overview.summary.active_teacher_count },
            { label: "近 7 天练题会话", value: overview.summary.practice_session_count_7d },
            { label: "已发布考试", value: overview.summary.published_exam_count },
            { label: "已交卷次数", value: overview.summary.submitted_exam_attempt_count },
            { label: "待批阅题目", value: overview.summary.pending_review_count }
          ]
        : [],
    [overview]
  );

  const transitionBars = useMemo(
    () => buildCountRanking(overview?.recent_transitions.map((item) => formatTransitionType(item.transition_type)) ?? []),
    [overview]
  );
  const operationRanking = useMemo(
    () => buildCountRanking(overview?.recent_audit_logs.map((item) => `${item.module_name} / ${item.action_name}`) ?? []),
    [overview]
  );

  return (
    <section aria-label="数据看板面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">数据看板</span>
            <h2>数据看板</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--primary" onClick={() => void loadOverview()}>
              刷新看板
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading && overview ? (
        <>
          <section className="ui-admin-kpis">
            {metrics.map((metric) => (
              <article key={metric.label} className="ui-admin-kpi ui-admin-metrics-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>

          <section className="ui-admin-split ui-admin-split--2">
            <section className="ui-admin-chart-card">
              <div className="ui-admin-chart-card__header">
                <div>
                  <h3>学籍变更类型</h3>
                </div>
              </div>
              <div className="ui-admin-bar-chart">
                {transitionBars.map((item) => (
                  <div key={item.label} className="ui-admin-bar-row">
                    <header>
                      <span>{item.label}</span>
                      <span>{item.count} 次</span>
                    </header>
                    <div className="ui-admin-bar-track">
                      <div className="ui-admin-bar-fill" style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ui-admin-chart-card">
              <div className="ui-admin-chart-card__header">
                <div>
                  <h3>近期操作热度</h3>
                </div>
              </div>
              <div className="ui-admin-mini-list">
                {overview.recent_audit_logs.slice(0, 5).map((item) => (
                  <article key={item.id} className="ui-admin-mini-item">
                    <strong>{item.module_name}</strong>
                    <p>{item.action_name}</p>
                    <div className="ui-admin-row-meta">
                      <span>{item.operator_name ?? "-"}</span>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section className="ui-admin-split ui-admin-split--2">
            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>操作类型分布</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>模块 / 动作</th>
                    <th>次数</th>
                  </tr>
                </thead>
                <tbody>
                  {operationRanking.map((item) => (
                    <tr key={`${item.rank}-${item.label}`}>
                      <td>{item.rank}</td>
                      <td>{item.label}</td>
                      <td>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>学籍变更明细</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>学生</th>
                    <th>变更类型</th>
                    <th>原班级</th>
                    <th>目标班级</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recent_transitions.map((item) => (
                    <tr key={item.transition_id}>
                      <td>{item.student_name}</td>
                      <td>{item.transition_type}</td>
                      <td>{item.from_class_name ?? "-"}</td>
                      <td>{item.to_class_name ?? "-"}</td>
                      <td>{formatDateTime(item.occurred_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        </>
      ) : null}
    </section>
  );
}

function buildCountRanking(labels: string[]): CountRankingItem[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"))
    .slice(0, 5);
  const maxCount = Math.max(1, ...ranked.map((item) => item.count));

  return ranked.map((item, index) => ({
    rank: index + 1,
    label: item.label,
    count: item.count,
    percent: Math.max(12, Math.round((item.count / maxCount) * 100))
  }));
}

function formatTransitionType(value: string): string {
  switch (value) {
    case "promote":
      return "升班";
    case "transfer":
      return "转班";
    case "graduate":
      return "毕业";
    default:
      return value;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return value;
}
