import { useEffect, useMemo, useState } from "react";

import type {
  Exam,
  ExamDetail,
  ExamListQuery,
  ExamOverviewResult,
  ExamOverviewSummary,
  PageResult
} from "@aios/api-sdk";

export interface ExamPanelApi {
  listExams(query?: ExamListQuery): Promise<PageResult<Exam>>;
  getExam(id: number): Promise<ExamDetail>;
  publishExam(id: number): Promise<ExamDetail>;
  getExamOverview(query: { exam_id: number; page?: number; page_size?: number }): Promise<ExamOverviewResult>;
}

interface ExamPanelProps {
  api: ExamPanelApi;
  onNavigate(path: string): void;
}

export function ExamPanel({ api, onNavigate }: ExamPanelProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamID, setSelectedExamID] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const [overview, setOverview] = useState<ExamOverviewResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    void loadExams();
  }, [api]);

  useEffect(() => {
    if (!selectedExamID && exams.length > 0) {
      setSelectedExamID(exams[0].id);
    }
  }, [exams, selectedExamID]);

  useEffect(() => {
    if (!selectedExamID) {
      setDetail(null);
      setOverview(null);
      return;
    }
    void loadExamDetail(selectedExamID);
  }, [api, selectedExamID]);

  async function loadExams() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listExams();
      setExams(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载考试数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadExamDetail(examID: number) {
    setDetailLoading(true);
    setErrorMessage("");
    try {
      const [detailResult, overviewResult] = await Promise.all([
        api.getExam(examID),
        api.getExamOverview({ exam_id: examID, page: 1, page_size: 8 })
      ]);
      setDetail(detailResult);
      setOverview(overviewResult);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载考试详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePublish(examID: number) {
    await api.publishExam(examID);
    await loadExams();
    await loadExamDetail(examID);
  }

  const filteredExams = useMemo(
    () =>
      exams.filter((exam) => {
        const keywordMatched =
          keyword.trim() === "" ||
          [exam.name, exam.exam_mode, exam.status].some((value) =>
            value.toLowerCase().includes(keyword.trim().toLowerCase())
          );
        const statusMatched = status === "" || exam.status === status;
        return keywordMatched && statusMatched;
      }),
    [exams, keyword, status]
  );

  const currentExam = useMemo(
    () => exams.find((item) => item.id === selectedExamID) ?? filteredExams[0] ?? null,
    [exams, filteredExams, selectedExamID]
  );

  const summary = overview?.summary ?? emptySummary(currentExam?.id ?? 0, currentExam?.name ?? "未选择考试");
  const students = overview?.students.items ?? [];

  return (
    <section aria-label="考试管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">考试管理</span>
            <h2>考试管理</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate("/admin/exams/assembly")}>
              进入随机组卷
            </button>
            <button type="button" className="ui-button ui-button--primary" onClick={() => void loadExams()}>
              刷新列表
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <>
          <section className="ui-admin-filters ui-admin-card">
            <div className="ui-admin-filters__grid">
              <div className="ui-admin-form__field">
                <label htmlFor="admin_exam_keyword">搜索考试</label>
                <input
                  id="admin_exam_keyword"
                  placeholder="输入考试名称、状态或组卷方式"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="ui-admin-form__field">
                <label htmlFor="admin_exam_status">发布状态</label>
                <select id="admin_exam_status" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">全部状态</option>
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="closed">已结束</option>
                </select>
              </div>
            </div>
          </section>

          <section className="ui-admin-kpis">
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>应参与人数</span>
              <strong>{summary.student_count}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>已交卷</span>
              <strong>{summary.submitted_count}</strong>
            </article>
            <article className="ui-admin-kpi ui-admin-metrics-card">
              <span>平均分</span>
              <strong>{summary.average_score}</strong>
            </article>
          </section>

          <div className="ui-admin-layout">
            <div className="ui-admin-main">
              <section className="ui-admin-table-card">
                <div className="ui-admin-table-card__header">
                  <div>
                    <h3>考试列表</h3>
                  </div>
                </div>
                <table className="ui-admin-table">
                  <thead>
                    <tr>
                      <th>考试名称</th>
                      <th>组卷方式</th>
                      <th>状态</th>
                      <th>开始时间</th>
                      <th>结束时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExams.map((exam) => (
                      <tr key={exam.id}>
                        <td>{exam.name}</td>
                        <td>{formatExamMode(exam.exam_mode)}</td>
                        <td>
                          <span className={statusClassName(exam.status)}>{formatExamStatus(exam.status)}</span>
                        </td>
                        <td>{formatDateTime(exam.start_time)}</td>
                        <td>{formatDateTime(exam.end_time)}</td>
                        <td>
                          <div className="ui-admin-table__actions">
                            <button type="button" className="ui-admin-link" onClick={() => setSelectedExamID(exam.id)}>
                              查看
                            </button>
                            {exam.status === "draft" ? (
                              <button type="button" className="ui-admin-link" onClick={() => void handlePublish(exam.id)}>
                                发布
                              </button>
                            ) : null}
                            {exam.exam_mode === "random_assembly" ? (
                              <button
                                type="button"
                                className="ui-admin-link"
                                onClick={() => onNavigate("/admin/exams/assembly")}
                              >
                                查看组卷规则
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="ui-admin-table-card">
                <div className="ui-admin-table-card__header">
                  <div>
                    <h3>成绩概览</h3>
                  </div>
                </div>
                <table className="ui-admin-table">
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>学号</th>
                      <th>作答状态</th>
                      <th>批阅状态</th>
                      <th>总分</th>
                      <th>提交时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length > 0 ? (
                      students.map((student) => (
                        <tr key={`${student.student_user_id}-${student.attempt_id ?? 0}`}>
                          <td>{student.student_name}</td>
                          <td>{student.student_no ?? "-"}</td>
                          <td>
                            <span className={statusClassName(student.attempt_status)}>{formatAttemptStatus(student.attempt_status)}</span>
                          </td>
                          <td>
                            <span className={statusClassName(student.review_status)}>{formatReviewStatus(student.review_status)}</span>
                          </td>
                          <td>{student.final_score ?? 0}</td>
                          <td>{formatDateTime(student.submit_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>
                          <div className="ui-admin-empty-inline">当前考试暂无成绩数据</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>

            <aside className="ui-admin-side-card">
              <section className="ui-admin-card">
                <div className="ui-admin-card__header">
                  <div>
                    <h3>考试详情</h3>
                  </div>
                </div>
                {detailLoading ? <div className="ui-status ui-status--info">加载详情中...</div> : null}
                {!detailLoading && detail ? (
                  <>
                    <dl className="ui-admin-meta-list">
                      <div>
                        <dt>考试名称</dt>
                        <dd>{detail.name}</dd>
                      </div>
                      <div>
                        <dt>组卷方式</dt>
                        <dd>{formatExamMode(detail.exam_mode)}</dd>
                      </div>
                      <div>
                        <dt>状态</dt>
                        <dd>
                          <span className={statusClassName(detail.status)}>{formatExamStatus(detail.status)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>考试时间</dt>
                        <dd>{`${formatDateTime(detail.start_time)} - ${formatDateTime(detail.end_time)}`}</dd>
                      </div>
                      <div>
                        <dt>时长</dt>
                        <dd>{detail.duration_minutes ?? 0} 分钟</dd>
                      </div>
                      <div>
                        <dt>发布范围</dt>
                        <dd>{detail.targets.map((item) => `${item.target_type}:${item.target_id}`).join("、") || "未设置"}</dd>
                      </div>
                    </dl>
                    <div className="ui-admin-side-card__actions">
                      {detail.status === "draft" ? (
                        <button type="button" className="ui-button ui-button--primary" onClick={() => void handlePublish(detail.id)}>
                          发布考试
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {!detailLoading && !detail ? <div className="ui-admin-empty-inline">请选择左侧考试查看详情</div> : null}
              </section>

              <section className="ui-admin-card">
                <div className="ui-admin-card__header">
                  <div>
                    <h3>试卷摘要</h3>
                  </div>
                </div>
                {detail ? (
                  <div className="ui-admin-mini-list">
                    <article className="ui-admin-mini-item">
                      <strong>固定题数</strong>
                      <p>{detail.fixed_questions.length} 题</p>
                    </article>
                    <article className="ui-admin-mini-item">
                      <strong>组卷规则</strong>
                      <p>{detail.paper_rules?.length ?? 0} 条</p>
                    </article>
                    <article className="ui-admin-mini-item">
                      <strong>最高分 / 最低分</strong>
                      <p>{`${summary.highest_score} / ${summary.lowest_score}`}</p>
                    </article>
                  </div>
                ) : (
                  <div className="ui-admin-empty-inline">暂无试卷摘要</div>
                )}
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}

function emptySummary(examID: number, examName: string): ExamOverviewSummary {
  return {
    exam_id: examID,
    exam_name: examName,
    exam_mode: "fixed",
    status: "draft",
    duration_minutes: 0,
    total_score: 0,
    student_count: 0,
    participated_student_count: 0,
    submitted_count: 0,
    in_progress_count: 0,
    absent_count: 0,
    average_score: 0,
    highest_score: 0,
    lowest_score: 0
  };
}

function formatDateTime(value?: string | null): string {
  return value || "-";
}

function formatExamMode(value: string): string {
  if (value === "random_assembly") {
    return "随机组卷";
  }
  return "固定试卷";
}

function formatExamStatus(value: string): string {
  switch (value) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    case "closed":
      return "已结束";
    default:
      return value;
  }
}

function formatAttemptStatus(value?: string | null): string {
  switch (value) {
    case "submitted":
      return "已交卷";
    case "in_progress":
      return "作答中";
    case "not_started":
      return "未开始";
    default:
      return value || "-";
  }
}

function formatReviewStatus(value?: string | null): string {
  switch (value) {
    case "reviewed":
      return "已批阅";
    case "pending":
      return "待批阅";
    default:
      return value || "-";
  }
}

function statusClassName(value?: string | null): string {
  switch (value) {
    case "active":
    case "published":
    case "reviewed":
    case "submitted":
      return "ui-admin-status ui-admin-status--active";
    case "draft":
    case "pending":
    case "in_progress":
      return "ui-admin-status ui-admin-status--pending";
    case "closed":
    case "inactive":
      return "ui-admin-status ui-admin-status--inactive";
    case "rejected":
      return "ui-admin-status ui-admin-status--danger";
    default:
      return "ui-admin-status ui-admin-status--draft";
  }
}
