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
  menus?: unknown;
  onSelect?: (path: string) => void;
}

interface WorkbenchStats {
  organizationCount: number;
  gradeCount: number;
  classCount: number;
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

const emptyStats: WorkbenchStats = {
  organizationCount: 0,
  gradeCount: 0,
  classCount: 0,
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
  userDisplayName
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

  return (
    <section aria-label="管理工作台" className="ui-workbench ui-workbench--admin" style={workbenchStyle} aria-busy={loading}>
      <h2 style={visuallyHiddenStyle}>工作台</h2>
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
      <div role="separator" aria-label="工作台内容分割线" style={contentDividerStyle} />
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
    return { organizationCount: 0, gradeCount: 0, classCount: 0 };
  }

  const [schools, grades, classes] = await Promise.all([
    settleValue(() => api.listSchools()),
    settleValue(() => api.listGrades()),
    settleValue(() => api.listClasses())
  ]);

  return {
    organizationCount: schools?.total ?? schools?.items.length ?? 0,
    gradeCount: grades?.total ?? grades?.items.length ?? 0,
    classCount: classes?.total ?? classes?.items.length ?? 0
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
  padding: 22,
  display: "block"
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

const contentDividerStyle: CSSProperties = {
  height: 1,
  width: "100%",
  marginTop: 22,
  background: "rgba(15, 23, 42, 0.12)"
};
