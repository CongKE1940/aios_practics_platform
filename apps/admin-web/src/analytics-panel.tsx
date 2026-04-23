import { useEffect, useState } from "react";

import type { AdminOverviewResult } from "@aios/api-sdk";

export interface AnalyticsPanelApi {
  getAdminOverview(): Promise<AdminOverviewResult>;
}

interface MetricItem {
  label: string;
  value: number;
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

  const metrics: MetricItem[] = overview
    ? [
        { label: "学校数", value: overview.summary.school_count },
        { label: "班级数", value: overview.summary.class_count },
        { label: "课程数", value: overview.summary.course_count },
        { label: "在校学生", value: overview.summary.active_student_count },
        { label: "活跃教师", value: overview.summary.active_teacher_count },
        { label: "近 7 天练题会话", value: overview.summary.practice_session_count_7d },
        { label: "已发布考试", value: overview.summary.published_exam_count },
        { label: "已交卷次数", value: overview.summary.submitted_exam_attempt_count },
        { label: "待批阅题目", value: overview.summary.pending_review_count },
        { label: "近 30 天学籍变更", value: overview.summary.recent_transition_count_30d }
      ]
    : [];

  return (
    <section aria-label="数据看板面板">
      <h2>数据看板</h2>
      <button type="button" onClick={() => void loadOverview()}>
        刷新看板
      </button>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}
      {!loading && overview ? (
        <>
          <section aria-label="核心指标">
            <h3>核心指标</h3>
            <ul>
              {metrics.map((metric) => (
                <li key={metric.label}>
                  <strong>{metric.label}</strong>
                  <span>{metric.value}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="最近学籍变更">
            <h3>最近学籍变更</h3>
            <ul>
              {overview.recent_transitions.map((item) => (
                <li key={item.transition_id}>
                  <span>{item.student_name}</span>
                  <span>{item.transition_type}</span>
                  <span>{item.from_class_name ?? "-"}</span>
                  <span>{item.to_class_name ?? "-"}</span>
                  <span>{formatDateTime(item.occurred_at)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="最近审计日志">
            <h3>最近审计日志</h3>
            <ul>
              {overview.recent_audit_logs.map((item) => (
                <li key={item.id}>
                  <span>{item.module_name}</span>
                  <span>{item.action_name}</span>
                  <span>{item.resource_type}</span>
                  <span>{item.operator_name ?? "-"}</span>
                  <span>{formatDateTime(item.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </section>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return value;
}
