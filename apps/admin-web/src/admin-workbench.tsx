import { useEffect, useState, type CSSProperties } from "react";

import type { AdminOverviewResult } from "@aios/api-sdk";

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
  userType: string;
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

interface DashboardCard {
  title: string;
  value: string;
  helper: string;
  accent: string;
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

export function AdminWorkbench({
  analyticsApi,
  examApi,
  noticeApi,
  organizationApi,
  questionApi,
  questionBankApi,
  userApi,
  userType
}: AdminWorkbenchProps) {
  const [stats, setStats] = useState<WorkbenchStats>(emptyStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadWorkbenchStats({ analyticsApi, examApi, noticeApi, organizationApi, questionApi, questionBankApi, userApi })
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
  }, [analyticsApi, examApi, noticeApi, organizationApi, questionApi, questionBankApi, userApi]);

  const cards = buildDashboardCards(stats, userType === "sys_admin");

  return (
    <section aria-label="管理工作台" className="ui-workbench ui-workbench--admin" style={workbenchStyle} aria-busy={loading}>
      <div className="ui-stat-grid" style={statGridStyle}>
        {cards.map((card) => (
          <article key={card.title} className="ui-stat-card" style={statCardStyle}>
            <div className="ui-stat-card__icon" style={statIconStyle} aria-hidden="true">
              {card.accent}
            </div>
            <div className="ui-stat-card__content" style={statContentStyle}>
              <span>{card.title}</span>
              <strong>{loading ? "--" : card.value}</strong>
              <small>{loading ? "数据加载中" : card.helper}</small>
            </div>
          </article>
        ))}
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

  const exams = await settleValue(() => api.listExams({ page: 1, page_size: 10 }));
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
      accent: "员"
    },
    {
      title: "题库数",
      value: formatNumber(stats.questionBankCount),
      helper: `题目数 ${formatNumber(stats.questionCount)}`,
      accent: "题"
    },
    {
      title: "考试数",
      value: formatNumber(stats.examCount),
      helper: `通过率 ${formatPercent(stats.passRate)}`,
      accent: "考"
    }
  ];

  if (isSystemAdmin) {
    return [
      {
        title: "组织数",
        value: formatNumber(stats.organizationCount),
        helper: `年级数 ${formatNumber(stats.gradeCount)} / 班级数 ${formatNumber(stats.classCount)}`,
        accent: "组"
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
      accent: "告"
    }
  ];
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
  margin: 0
};

const statCardStyle: CSSProperties = {
  minHeight: 146
};

const statIconStyle: CSSProperties = {
  flex: "0 0 auto"
};

const statContentStyle: CSSProperties = {
  minWidth: 0
};
