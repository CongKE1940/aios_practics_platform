import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { createApiClient } from "@aios/api-sdk";

import type { AnalyticsPanelApi } from "./analytics-panel";
import type { ExamPanelApi } from "./exam-panel";
import type { NoticeApi } from "./notice-panel";
import type { OrganizationApi } from "./organization-panel";
import type { QuestionBankPanelApi } from "./question-bank-panel";
import type { QuestionPanelApi } from "./question-panel";
import type { UserPanelApi } from "./user-panel";

interface AdminWorkbenchProps {
  analyticsApi?: AnalyticsPanelApi;
  examApi?: ExamPanelApi;
  noticeApi?: NoticeApi;
  organizationApi?: OrganizationApi;
  questionApi?: QuestionPanelApi;
  questionBankApi?: QuestionBankPanelApi;
  userApi?: UserPanelApi;
  userType?: string;
  userDisplayName?: string;
  availablePaths?: string[];
  onNavigate?: (path: string) => void;
}

interface WorkbenchStats {
  organizationCount: number;
  gradeCount: number;
  classCount: number;
  courseCount: number;
  memberCount: number;
  teacherCount: number;
  studentCount: number;
  questionBankCount: number;
  questionCount: number;
  examCount: number;
  passRate: number;
  noticeCount: number;
  noticeReadCount: number;
  noticeUnreadCount: number;
}

type WorkbenchIconName = "organization" | "members" | "questionBank" | "exam" | "notice";

interface DashboardCard {
  title: string;
  value: string;
  helper: string;
  icon: WorkbenchIconName;
}

interface WorkbenchTask {
  title: string;
  helper: string;
  path: string;
  badge: string;
}

const emptyStats: WorkbenchStats = {
  organizationCount: 0,
  gradeCount: 0,
  classCount: 0,
  courseCount: 0,
  memberCount: 0,
  teacherCount: 0,
  studentCount: 0,
  questionBankCount: 0,
  questionCount: 0,
  examCount: 0,
  passRate: 0,
  noticeCount: 0,
  noticeReadCount: 0,
  noticeUnreadCount: 0
};

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0
};

export function AdminWorkbench({
  analyticsApi,
  examApi,
  noticeApi,
  organizationApi,
  questionApi,
  questionBankApi,
  userApi,
  userType,
  userDisplayName,
  availablePaths,
  onNavigate
}: AdminWorkbenchProps) {
  const fallbackApi = useMemo(() => createWorkbenchApi(), []);
  const resolvedUserType = useMemo(() => resolveWorkbenchUserType(userType, userDisplayName), [userType, userDisplayName]);
  const resolvedAnalyticsApi = analyticsApi ?? fallbackApi;
  const resolvedExamApi = examApi ?? fallbackApi;
  const resolvedNoticeApi = noticeApi ?? fallbackApi;
  const resolvedOrganizationApi = organizationApi ?? fallbackApi;
  const resolvedQuestionApi = questionApi ?? fallbackApi;
  const resolvedQuestionBankApi = questionBankApi ?? fallbackApi;
  const resolvedUserApi = userApi ?? fallbackApi;
  const [stats, setStats] = useState<WorkbenchStats>(emptyStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadWorkbenchStats({
      analyticsApi: resolvedAnalyticsApi,
      examApi: resolvedExamApi,
      noticeApi: resolvedNoticeApi,
      organizationApi: resolvedOrganizationApi,
      questionApi: resolvedQuestionApi,
      questionBankApi: resolvedQuestionBankApi,
      userApi: resolvedUserApi
    })
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
  }, [
    resolvedAnalyticsApi,
    resolvedExamApi,
    resolvedNoticeApi,
    resolvedOrganizationApi,
    resolvedQuestionApi,
    resolvedQuestionBankApi,
    resolvedUserApi
  ]);

  const cards = buildDashboardCards(stats, resolvedUserType === "sys_admin");
  const organizationRows = [
    { label: "学校/组织", value: stats.organizationCount },
    { label: "年级", value: stats.gradeCount },
    { label: "班级", value: stats.classCount }
  ];
  const contentRows = [
    { label: "课程", value: stats.courseCount },
    { label: "题库", value: stats.questionBankCount },
    { label: "题目", value: stats.questionCount },
    { label: "考试", value: stats.examCount }
  ];
  const taskRows = buildWorkbenchTasks(stats, availablePaths);
  const memberTotal = Math.max(1, stats.teacherCount + stats.studentCount);
  const noticeTotal = Math.max(1, stats.noticeReadCount + stats.noticeUnreadCount);

  return (
    <section aria-label="管理工作台" className="ui-workbench ui-workbench--admin" style={workbenchStyle} aria-busy={loading}>
      <h2 style={visuallyHiddenStyle}>工作台</h2>
      <section className="ui-hero-panel" aria-label="管理端运营总览">
        <div className="ui-hero-panel__content">
          <span className="ui-hero-panel__eyebrow">运营总览</span>
          <h2>{userDisplayName ? `${userDisplayName}，查看今日教学运营状态。` : "查看今日教学运营状态。"}</h2>
          <p>
            管理端围绕组织、成员、题库、导入、考试、公告和审计形成闭环；优先处理影响教学交付的任务，再进入明细页面核查。
          </p>
          <div className="ui-dashboard-strip" aria-label="管理重点">
            <span>租户边界</span>
            <span>题库质量</span>
            <span>考试流程</span>
            <span>审计追踪</span>
          </div>
        </div>
        <aside className="ui-hero-panel__aside" aria-label="关键待办">
          <div className="ui-hero-metric">
            <span>待关注通知</span>
            <strong>{loading ? "--" : formatNumber(stats.noticeUnreadCount)}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>教学资源</span>
            <strong>{loading ? "--" : formatNumber(stats.courseCount + stats.questionBankCount + stats.questionCount)}</strong>
          </div>
          <div className="ui-hero-metric">
            <span>考试测评</span>
            <strong>{loading ? "--" : formatNumber(stats.examCount)}</strong>
          </div>
        </aside>
      </section>

      <div className="ui-stat-grid" style={statGridStyle}>
        {cards.map((card) => (
          <article key={card.title} className="ui-stat-card" style={statCardStyle}>
            <div className="ui-stat-card__icon" style={statIconStyle} aria-hidden="true">
              {renderWorkbenchIcon(card.icon)}
            </div>
            <div className="ui-stat-card__content" style={statContentStyle}>
              <span>{card.title}</span>
              <strong>{loading ? "--" : card.value}</strong>
              <small>{loading ? "数据加载中" : card.helper}</small>
            </div>
          </article>
        ))}
      </div>

      <section className="ui-admin-card" aria-label="运营任务入口" style={taskPanelStyle}>
        <div className="ui-admin-card__header">
          <div>
            <span className="ui-kicker">下一步</span>
            <h3>运营任务入口</h3>
            <p className="ui-admin-subtle">按教学交付顺序处理题库、导入、考试、通知和审计。</p>
          </div>
        </div>
        <div className="ui-quick-grid">
          {taskRows.map((task) => (
            <button
              key={task.path}
              type="button"
              className="ui-quick-button"
              onClick={() => onNavigate?.(task.path)}
              disabled={!onNavigate}
            >
              <span className="ui-quick-button__icon" aria-hidden="true">
                {task.badge}
              </span>
              <strong>{task.title}</strong>
              <small>{loading ? "数据加载中" : task.helper}</small>
            </button>
          ))}
        </div>
      </section>

      <div style={visualGridStyle}>
        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="组织结构分布">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">组织结构</span>
              <h3>组织结构分布</h3>
              <p>学校、年级和班级是后续课程、成员与考试目标的基础。</p>
            </div>
            <strong>{loading ? "--" : formatNumber(stats.organizationCount + stats.gradeCount + stats.classCount)}</strong>
          </header>
          <BarChart rows={organizationRows} loading={loading} />
        </section>

        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="成员构成">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">成员构成</span>
              <h3>成员构成</h3>
              <p>教师与学生规模影响练题、批阅、考试统计和通知触达。</p>
            </div>
            <strong>{loading ? "--" : formatNumber(stats.memberCount)}</strong>
          </header>
          <div style={donutLayoutStyle}>
            <div
              role="img"
              aria-label={`教师 ${stats.teacherCount} 人，学生 ${stats.studentCount} 人`}
              style={buildDonutStyle([
                { value: stats.teacherCount, color: "#1f5f5b" },
                { value: stats.studentCount, color: "#b7832f" }
              ])}
            >
              <span style={donutCenterStyle}>{loading ? "--" : `${Math.round((stats.teacherCount / memberTotal) * 100)}%`}</span>
            </div>
            <div style={legendListStyle}>
              <LegendItem color="#1f5f5b" label="教师" value={loading ? "--" : formatNumber(stats.teacherCount)} />
              <LegendItem color="#b7832f" label="学生" value={loading ? "--" : formatNumber(stats.studentCount)} />
            </div>
          </div>
        </section>

        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="内容与考试规模">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">内容测评</span>
              <h3>内容与考试规模</h3>
              <p>题库、题目和考试共同构成练习与测评供给。</p>
            </div>
            <strong>{loading ? "--" : formatPercent(stats.passRate)}</strong>
          </header>
          <BarChart rows={contentRows} loading={loading} />
        </section>

        <section className="ui-admin-chart-card" style={visualPanelStyle} aria-label="通知处理进度">
          <header className="ui-admin-chart-card__header">
            <div>
              <span className="ui-kicker">通知触达</span>
              <h3>通知处理进度</h3>
              <p>未读通知是运营沟通需要继续跟进的信号。</p>
            </div>
            <strong>{loading ? "--" : formatNumber(stats.noticeCount)}</strong>
          </header>
          <div className="ui-admin-progress-list">
            <ProgressRow label="已读" value={stats.noticeReadCount} total={noticeTotal} loading={loading} />
            <ProgressRow label="未读" value={stats.noticeUnreadCount} total={noticeTotal} loading={loading} />
            <ProgressRow label="考试通过率" value={stats.passRate} total={100} suffix="%" loading={loading} />
          </div>
        </section>
      </div>

    </section>
  );
}

async function loadWorkbenchStats(apis: {
  analyticsApi?: AnalyticsPanelApi;
  examApi?: ExamPanelApi;
  noticeApi?: NoticeApi;
  organizationApi?: OrganizationApi;
  questionApi?: QuestionPanelApi;
  questionBankApi?: QuestionBankPanelApi;
  userApi?: UserPanelApi;
}): Promise<WorkbenchStats> {
  const [overview, organizationStats, memberStats, questionBankCount, questionCount, examStats, noticeStats] = await Promise.all([
    settleValue(() => apis.analyticsApi?.getAdminOverview()),
    loadOrganizationStats(apis.organizationApi),
    loadMemberStats(apis.userApi),
    settleValue(() => apis.questionBankApi?.listQuestionBanks({ page: 1, page_size: 1 }).then((result) => result.total)),
    settleValue(() => apis.questionApi?.listQuestions({ page: 1, page_size: 1 }).then((result) => result.total)),
    loadExamStats(apis.examApi),
    loadNoticeStats(apis.noticeApi)
  ]);

  const overviewSummary = overview?.summary;
  const teacherCount = memberStats.teacherCount || overviewSummary?.active_teacher_count || 0;
  const studentCount = memberStats.studentCount || overviewSummary?.active_student_count || 0;

  return {
    organizationCount: organizationStats.organizationCount || overviewSummary?.school_count || 0,
    gradeCount: organizationStats.gradeCount,
    classCount: organizationStats.classCount || overviewSummary?.class_count || 0,
    courseCount: organizationStats.courseCount || overviewSummary?.course_count || 0,
    memberCount: teacherCount + studentCount,
    teacherCount,
    studentCount,
    questionBankCount: questionBankCount ?? 0,
    questionCount: questionCount ?? 0,
    examCount: examStats.examCount || overviewSummary?.published_exam_count || 0,
    passRate: examStats.passRate,
    noticeCount: noticeStats.noticeCount,
    noticeReadCount: noticeStats.noticeReadCount,
    noticeUnreadCount: noticeStats.noticeUnreadCount
  };
}

async function loadOrganizationStats(api?: OrganizationApi) {
  if (!api) {
    return { organizationCount: 0, gradeCount: 0, classCount: 0, courseCount: 0 };
  }

  const [schools, grades, classes, courses] = await Promise.all([
    settleValue(() => api.listSchools()),
    settleValue(() => api.listGrades()),
    settleValue(() => api.listClasses()),
    settleValue(() => api.listCourses())
  ]);

  return {
    organizationCount: schools?.total ?? schools?.items.length ?? 0,
    gradeCount: grades?.total ?? grades?.items.length ?? 0,
    classCount: classes?.total ?? classes?.items.length ?? 0,
    courseCount: courses?.total ?? courses?.items.length ?? 0
  };
}

async function loadMemberStats(api?: UserPanelApi) {
  if (!api) {
    return { teacherCount: 0, studentCount: 0 };
  }

  const [teachers, students] = await Promise.all([
    settleValue(() => api.listUsers({ user_type: "teacher", page: 1, page_size: 1 })),
    settleValue(() => api.listUsers({ user_type: "student", page: 1, page_size: 1 }))
  ]);

  return {
    teacherCount: teachers?.total ?? 0,
    studentCount: students?.total ?? 0
  };
}

async function loadExamStats(api?: ExamPanelApi) {
  if (!api) {
    return { examCount: 0, passRate: 0 };
  }

  const exams = await settleValue(() => api.listExams({ page: 1, page_size: 100 }));
  if (!exams) {
    return { examCount: 0, passRate: 0 };
  }

  const overviewResults = await Promise.all(
    exams.items.map((exam) => settleValue(() => api.getExamOverview({ exam_id: exam.id, page: 1, page_size: 100 })))
  );
  const passSummary = overviewResults.reduce(
    (summary, overview) => {
      if (!overview) {
        return summary;
      }
      const totalScore = overview.summary.total_score || 100;
      const passLine = totalScore * 0.6;
      const reviewedStudents = overview.students.items.filter((student) => typeof student.final_score === "number");
      return {
        passed: summary.passed + reviewedStudents.filter((student) => (student.final_score ?? 0) >= passLine).length,
        total: summary.total + reviewedStudents.length
      };
    },
    { passed: 0, total: 0 }
  );

  return {
    examCount: exams.total,
    passRate: passSummary.total > 0 ? Math.round((passSummary.passed / passSummary.total) * 100) : 0
  };
}

async function loadNoticeStats(api?: NoticeApi) {
  if (!api) {
    return { noticeCount: 0, noticeReadCount: 0, noticeUnreadCount: 0 };
  }

  const [notices, readNotifications, unreadNotifications] = await Promise.all([
    settleValue(() => api.listNotices({ page: 1, page_size: 1 })),
    settleValue(() => api.listNotifications?.({ status: "read", page: 1, page_size: 1 })),
    settleValue(() => api.listNotifications?.({ status: "unread", page: 1, page_size: 1 }))
  ]);

  return {
    noticeCount: notices?.total ?? 0,
    noticeReadCount: readNotifications?.total ?? 0,
    noticeUnreadCount: unreadNotifications?.total ?? 0
  };
}

async function settleValue<T>(loader: () => Promise<T> | T | undefined): Promise<T | undefined> {
  try {
    return await loader();
  } catch {
    return undefined;
  }
}

function buildDashboardCards(stats: WorkbenchStats, isSystemAdmin: boolean): DashboardCard[] {
  const sharedCards: DashboardCard[] = [
    {
      title: "成员数",
      value: formatNumber(stats.memberCount),
      helper: `教师数 ${formatNumber(stats.teacherCount)} / 学生数 ${formatNumber(stats.studentCount)}`,
      icon: "members"
    },
    {
      title: "题库数",
      value: formatNumber(stats.questionBankCount),
      helper: `题目数 ${formatNumber(stats.questionCount)}`,
      icon: "questionBank"
    },
    {
      title: "考试数",
      value: formatNumber(stats.examCount),
      helper: `通过率 ${formatPercent(stats.passRate)}`,
      icon: "exam"
    }
  ];

  if (isSystemAdmin) {
    return [
      {
        title: "组织数",
        value: formatNumber(stats.organizationCount),
        helper: `年级数 ${formatNumber(stats.gradeCount)} / 班级数 ${formatNumber(stats.classCount)}`,
        icon: "organization"
      },
      ...sharedCards
    ];
  }

  return [
    ...sharedCards,
    {
      title: "公告数",
      value: formatNumber(stats.noticeCount),
      helper: `已读人数 ${formatNumber(stats.noticeReadCount)} / 未读人数 ${formatNumber(stats.noticeUnreadCount)}`,
      icon: "notice"
    }
  ];
}

function buildWorkbenchTasks(stats: WorkbenchStats, availablePaths?: string[]): WorkbenchTask[] {
  const tasks = [
    {
      title: "维护题库与题目",
      helper: `题库 ${formatNumber(stats.questionBankCount)} 个，题目 ${formatNumber(stats.questionCount)} 道`,
      path: "/admin/questions",
      badge: "题"
    },
    {
      title: "处理导入任务",
      helper: "下载模板、创建任务、查看行级错误和失败报告",
      path: "/admin/imports",
      badge: "入"
    },
    {
      title: "推进考试流程",
      helper: `当前考试 ${formatNumber(stats.examCount)} 场，通过率 ${formatPercent(stats.passRate)}`,
      path: "/admin/exams",
      badge: "考"
    },
    {
      title: "发布公告通知",
      helper: `未读 ${formatNumber(stats.noticeUnreadCount)} 条，已读 ${formatNumber(stats.noticeReadCount)} 条`,
      path: "/admin/notices",
      badge: "告"
    },
    {
      title: "核查数据看板",
      helper: "查看指标、异常、趋势和教学运营概览",
      path: "/admin/analytics",
      badge: "数"
    },
    {
      title: "追踪审计快照",
      helper: "回看实体变更、学籍变更和任课变更记录",
      path: "/admin/history",
      badge: "审"
    }
  ];
  if (!availablePaths) {
    return tasks;
  }
  const pathSet = new Set(availablePaths);
  return tasks.filter((task) => pathSet.has(task.path));
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

function ProgressRow({
  label,
  value,
  total,
  suffix = "",
  loading
}: {
  label: string;
  value: number;
  total: number;
  suffix?: string;
  loading: boolean;
}) {
  const percent = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className="ui-admin-progress-row">
      <header>
        <span>{label}</span>
        <strong>{loading ? "--" : `${formatNumber(value)}${suffix}`}</strong>
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

function renderWorkbenchIcon(icon: WorkbenchIconName) {
  const commonProps = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    focusable: "false" as const
  };

  switch (icon) {
    case "organization":
      return (
        <svg {...commonProps}>
          <path d="M4 21V7.8L12 4l8 3.8V21" />
          <path d="M8 21v-7h8v7" />
          <path d="M8 10h.01" />
          <path d="M12 10h.01" />
          <path d="M16 10h.01" />
        </svg>
      );
    case "members":
      return (
        <svg {...commonProps}>
          <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
          <path d="M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M20 20v-1a3 3 0 0 0-2.2-2.9" />
          <path d="M16.5 4.4a3 3 0 0 1 0 5.2" />
        </svg>
      );
    case "questionBank":
      return (
        <svg {...commonProps}>
          <path d="M5 4h10.5A3.5 3.5 0 0 1 19 7.5V20H8.5A3.5 3.5 0 0 1 5 16.5V4Z" />
          <path d="M8 4v12.5A3.5 3.5 0 0 0 11.5 20" />
          <path d="M11 8h4" />
          <path d="M11 12h3" />
        </svg>
      );
    case "exam":
      return (
        <svg {...commonProps}>
          <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5" />
          <path d="m8.5 13 2 2 4-5" />
          <path d="M8.5 18h6" />
        </svg>
      );
    case "notice":
      return (
        <svg {...commonProps}>
          <path d="M6 10v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" />
          <path d="M4 10h16" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          <path d="M10 14h4" />
        </svg>
      );
  }
}

function createWorkbenchApi() {
  const session = readStoredAdminSession();
  if (!session?.accessToken) {
    return undefined;
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
  return createApiClient({ baseUrl, accessToken: session.accessToken });
}

function resolveWorkbenchUserType(userType?: string, userDisplayName?: string): string {
  if (userType) {
    return userType;
  }

  const storedUserType = readStoredAdminSession()?.user?.user_type;
  if (storedUserType) {
    return storedUserType;
  }

  if (userDisplayName?.includes("系统管理员") || userDisplayName?.includes("平台管理员")) {
    return "sys_admin";
  }

  return "school_admin";
}

function readStoredAdminSession(): { accessToken?: string; user?: { user_type?: string } } | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  const raw = window.localStorage.getItem("aios.admin.session");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as { accessToken?: string; user?: { user_type?: string } };
  } catch {
    return null;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number): string {
  return `${value}%`;
}

const workbenchStyle: CSSProperties = {
  minHeight: "100%",
  padding: 0,
  display: "grid",
  gap: 14
};

const statGridStyle: CSSProperties = {
  alignItems: "stretch",
  margin: 0,
  gridAutoRows: 132
};

const statCardStyle: CSSProperties = {
  height: 132,
  maxHeight: 132,
  minHeight: 0,
  overflow: "hidden",
  boxSizing: "border-box"
};

const statIconStyle: CSSProperties = {
  flex: "0 0 48px",
  width: 48,
  height: 48,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center"
};

const statContentStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden"
};

const visualGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  marginTop: 0
};

const visualPanelStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 16,
  minHeight: 250,
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
  background: "var(--ui-color-surface)",
  color: "var(--ui-color-ink)",
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
  color: "var(--ui-color-text-muted)",
  fontSize: 13
};

const legendDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999
};

const taskPanelStyle: CSSProperties = {
  display: "grid",
  gap: 14
};
