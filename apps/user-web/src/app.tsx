import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  createApiClient,
  type LoginOrganization,
  type LoginRequest,
  type MenuItem,
  type PracticeSessionDetail
} from "@aios/api-sdk";
import { AppShell, EmptyState, PageSection, StatusNotice } from "@aios/ui-web";

import sceneBackground from "../../../docs/images/背景.png";

import { createBrowserSessionStore } from "./auth-store";
import type { UserAuthApi, UserSessionState, UserSessionStore } from "./auth-types";
import { MenuNav } from "./menu-nav";
import { LoginPage } from "./login-page";
import { NotificationCenterPage, type NotificationCenterApi } from "./notification-center-page";
import { ClassLearningPage, type ClassLearningApi } from "./class-learning-page";
import { CourseOverviewPage, type CourseOverviewApi } from "./course-overview-page";
import { QuestionFeedbackPage, type QuestionFeedbackPageApi } from "./question-feedback-page";
import { StudentLearningDetailPage, type StudentLearningDetailApi } from "./student-learning-detail-page";
import {
  StudentPracticeSessionDetailPage,
  type StudentPracticeSessionDetailApi
} from "./student-practice-session-detail-page";
import {
  StudentPracticeSessionQuestionDetailPage,
  type StudentPracticeSessionQuestionDetailApi
} from "./student-practice-session-question-detail-page";
import { PracticePanel, type PracticePanelApi } from "./practice-panel";
import {
  PracticeHistoryPage,
  PracticeResultPage,
  PracticeSessionDetailPage,
  PracticeStateListPage,
  type PracticeReviewApi
} from "./practice-review-pages";
import { StudentExamPage, type StudentExamApi } from "./student-exam-page";
import { TeacherQuestionBankPage, type TeacherQuestionBankApi } from "./teacher-question-bank-page";
import { TeacherExamPage, type TeacherExamApi } from "./teacher-exam-page";
import { UserWorkbenchPage } from "./user-workbench-page";

type UserPracticeApi = PracticePanelApi &
  PracticeReviewApi &
  Partial<CourseOverviewApi> &
  Partial<NotificationCenterApi> &
  Partial<QuestionFeedbackPageApi> &
  Partial<TeacherQuestionBankApi> &
  Partial<ClassLearningApi> &
  Partial<StudentLearningDetailApi> &
  Partial<StudentPracticeSessionDetailApi> &
  Partial<StudentPracticeSessionQuestionDetailApi> &
  Partial<StudentExamApi> &
  Partial<TeacherExamApi>;

interface UserAppProps {
  authApi?: UserAuthApi;
  practiceApi?: UserPracticeApi;
  sessionStore?: UserSessionStore;
}

export function UserApp({ authApi, practiceApi, sessionStore }: UserAppProps) {
  const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
  const initialSession = useMemo(() => store.load(), [store]);
  const [session, setSession] = useState<UserSessionState | null>(initialSession);
  const [selectedPath, setSelectedPath] = useState(() => getFirstAvailablePath(initialSession?.menus ?? []));
  const [pendingPracticeSession, setPendingPracticeSession] = useState<PracticeSessionDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const selectedRoute = getRoutePath(selectedPath);

  function handleUnauthorized() {
    store.clear();
    setSession(null);
    setSelectedPath("/app/workbench");
    setPendingPracticeSession(null);
    setSubmitting(false);
    setErrorMessage("登录已失效，请重新登录");
  }

  const currentPracticeApi = useMemo<UserPracticeApi | undefined>(() => {
    if (practiceApi) {
      return wrapUnauthorizedApi(practiceApi, handleUnauthorized);
    }

    if (!session) {
      return undefined;
    }

    return createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1",
      accessToken: session.accessToken,
      onUnauthorized: handleUnauthorized
    });
  }, [practiceApi, session, store]);

  const auth = useMemo<UserAuthApi>(() => {
    if (authApi) {
      return authApi;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    const anonymous = createApiClient({ baseUrl });

    return {
      listLoginOrganizations: () => anonymous.listLoginOrganizations(),
      login: (body) => anonymous.login(body),
      logout: (accessToken) => createApiClient({ baseUrl, accessToken }).logout(),
      menus: (accessToken) => createApiClient({ baseUrl, accessToken, onUnauthorized: handleUnauthorized }).menus("user")
    };
  }, [authApi, store]);

  useEffect(() => {
    if (session) {
      return;
    }

    let active = true;
    setOrganizationsLoading(true);
    setOrganizationsError("");

    auth
      .listLoginOrganizations()
      .then((items) => {
        if (!active) {
          return;
        }
        setOrganizations(items);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setOrganizations([]);
        setOrganizationsError(error instanceof Error ? error.message : "组织列表加载失败");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setOrganizationsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [auth, session]);

  async function handleLogin(form: LoginRequest) {
    setSubmitting(true);
    setErrorMessage("");

    try {
      let result;
      try {
        result = await auth.login(form);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "登录失败");
        return;
      }

      const menus = await auth.menus(result.access_token);
      const nextSession: UserSessionState = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresIn: result.expires_in,
        menus,
        user: result.user
      };
      store.save(nextSession);
      setSession(nextSession);
      setSelectedPath(getFirstAvailablePath(menus));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    if (!session) {
      return;
    }

    try {
      await auth.logout(session.accessToken);
    } finally {
      store.clear();
      setSession(null);
      setSelectedPath("/app/workbench");
      setPendingPracticeSession(null);
    }
  }

  if (!session) {
    return (
      <main className="ui-auth-page ui-auth-page--learner">
        <img src={sceneBackground} alt="" className="ui-scene-image" />
        <section className="ui-auth-hero">
          <span className="ui-auth-hero__sr">AIOS 学习端登录背景</span>
          <h1 className="ui-auth-hero__title">AIOS 学生端</h1>
          <p className="ui-auth-hero__copy">把课程、练题、班级学习和考试放进一个统一工作台。</p>
        </section>
        <section className="ui-auth-card">
          <LoginPage
            organizations={organizations}
            organizationsLoading={organizationsLoading}
            organizationsError={organizationsError}
            submitting={submitting}
            errorMessage={errorMessage}
            onSubmit={handleLogin}
          />
        </section>
      </main>
    );
  }

  const content = renderUserContent({
    selectedPath,
    selectedRoute,
    session,
    currentPracticeApi,
    pendingPracticeSession,
    setPendingPracticeSession,
    setSelectedPath
  });

  return (
    <div className="ui-app-frame">
      <img src={sceneBackground} alt="" className="ui-scene-image ui-scene-image--shell" />
      <AppShell
        brand={
          <div className="ui-brand-block">
            <strong>AIOS 学习工作台</strong>
            <span>课程、练题、考试一体化</span>
          </div>
        }
        sidebar={<MenuNav menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />}
        header={
          <section aria-label="当前用户" className="ui-user-chip">
            <div className="ui-user-chip__avatar" aria-hidden="true">
              {session.user.display_name.slice(0, 1)}
            </div>
            <div>
              <p>欢迎回来，{session.user.display_name}</p>
              <strong>{getUserTypeLabel(session.user.user_type)}</strong>
            </div>
            <button type="button" className="ui-button ui-button--ghost" onClick={handleLogout}>
              退出登录
            </button>
          </section>
        }
      >
        {session.menus.length === 0 ? (
          <PageSection title="当前学习内容" description="">
            <EmptyState title="当前账号暂无可用功能" description="请联系管理员分配课程或权限。" />
          </PageSection>
        ) : (
          <div className="ui-stack ui-stack--lg">{content}</div>
        )}
        {errorMessage ? <StatusNotice tone="danger" title="当前会话异常" description={errorMessage} /> : null}
      </AppShell>
    </div>
  );
}

interface RenderUserContentArgs {
  selectedPath: string;
  selectedRoute: string;
  session: UserSessionState;
  currentPracticeApi?: UserPracticeApi;
  pendingPracticeSession: PracticeSessionDetail | null;
  setPendingPracticeSession: Dispatch<SetStateAction<PracticeSessionDetail | null>>;
  setSelectedPath: Dispatch<SetStateAction<string>>;
}

function renderUserContent({
  selectedPath,
  selectedRoute,
  session,
  currentPracticeApi,
  pendingPracticeSession,
  setPendingPracticeSession,
  setSelectedPath
}: RenderUserContentArgs) {
  const isStudentSessionQuestionRoute = selectedRoute.startsWith("/app/class-learning/student/session/question");
  const isStudentSessionRoute = selectedRoute.startsWith("/app/class-learning/student/session");

  return (
    <>
      {selectedRoute === "/app/workbench" ? (
        <UserWorkbenchPage
          menus={session.menus}
          userDisplayName={session.user.display_name}
          userTypeLabel={getUserTypeLabel(session.user.user_type)}
          onNavigate={setSelectedPath}
        />
      ) : null}
      {selectedRoute === "/app/courses" ? (
        currentPracticeApi && isCourseOverviewApi(currentPracticeApi) ? (
          <CourseOverviewPage
            api={currentPracticeApi}
            menus={session.menus}
            userType={session.user.user_type}
            onNavigate={setSelectedPath}
          />
        ) : (
          <p>当前课程功能暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/notifications" ? (
        currentPracticeApi && isNotificationCenterApi(currentPracticeApi) ? (
          <NotificationCenterPage api={currentPracticeApi} />
        ) : (
          <p>当前通知中心暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/teacher-banks" ? (
        currentPracticeApi && isTeacherQuestionBankApi(currentPracticeApi) ? (
          <TeacherQuestionBankPage api={currentPracticeApi} />
        ) : (
          <p>当前老师题库功能暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/questions/feedback" ? (
        currentPracticeApi && isQuestionFeedbackApi(currentPracticeApi) ? (
          <QuestionFeedbackPage api={currentPracticeApi} path={selectedPath} onNavigate={setSelectedPath} />
        ) : (
          <p>当前题目互动功能暂不可用。</p>
        )
      ) : null}
      {isStudentSessionQuestionRoute ? (
        currentPracticeApi && isStudentPracticeSessionQuestionDetailApi(currentPracticeApi) ? (
          <StudentPracticeSessionQuestionDetailPage
            api={currentPracticeApi}
            path={selectedPath}
            onNavigate={setSelectedPath}
          />
        ) : (
          <p>当前单题详情功能暂不可用。</p>
        )
      ) : null}
      {!isStudentSessionQuestionRoute && isStudentSessionRoute ? (
        currentPracticeApi && isStudentPracticeSessionDetailApi(currentPracticeApi) ? (
          <StudentPracticeSessionDetailPage api={currentPracticeApi} path={selectedPath} onNavigate={setSelectedPath} />
        ) : (
          <p>当前单次练题详情功能暂不可用。</p>
        )
      ) : null}
      {!isStudentSessionRoute && selectedRoute.startsWith("/app/class-learning/student") ? (
        currentPracticeApi && isStudentLearningDetailApi(currentPracticeApi) ? (
          <StudentLearningDetailPage api={currentPracticeApi} path={selectedPath} onNavigate={setSelectedPath} />
        ) : (
          <p>当前学生学习详情功能暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/class-learning" ? (
        currentPracticeApi && isClassLearningApi(currentPracticeApi) ? (
          <ClassLearningPage api={currentPracticeApi} onNavigate={setSelectedPath} />
        ) : (
          <p>当前班级学习功能暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/exams" ? (
        session.user.user_type === "teacher" && currentPracticeApi && isTeacherExamApi(currentPracticeApi) ? (
          <TeacherExamPage api={currentPracticeApi} />
        ) : session.user.user_type === "student" && currentPracticeApi && isStudentExamApi(currentPracticeApi) ? (
          <StudentExamPage api={currentPracticeApi} />
        ) : (
          <p>当前考试功能暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/practice" && currentPracticeApi ? (
        <PracticePanel
          api={currentPracticeApi}
          initialSession={pendingPracticeSession}
          onInitialSessionConsumed={() => setPendingPracticeSession(null)}
          onNavigate={setSelectedPath}
          onFinished={(summary) => setSelectedPath(`/app/practice/results/${summary.id}`)}
        />
      ) : null}
      {selectedRoute.startsWith("/app/practice/results/") && currentPracticeApi ? (
        <PracticeResultPage
          api={currentPracticeApi}
          sessionId={getSessionId(selectedRoute)}
          onNavigate={setSelectedPath}
          onPracticeCreated={setPendingPracticeSession}
        />
      ) : null}
      {selectedRoute === "/app/practice/history" && currentPracticeApi ? (
        <PracticeHistoryPage api={currentPracticeApi} onNavigate={setSelectedPath} />
      ) : null}
      {selectedRoute.startsWith("/app/practice/history/") && currentPracticeApi ? (
        <PracticeSessionDetailPage
          api={currentPracticeApi}
          sessionId={getSessionId(selectedRoute)}
          onNavigate={setSelectedPath}
        />
      ) : null}
      {selectedRoute === "/app/practice/wrong" && currentPracticeApi ? (
        <PracticeStateListPage
          api={currentPracticeApi}
          stateType="wrong"
          onNavigate={setSelectedPath}
          onPracticeCreated={setPendingPracticeSession}
        />
      ) : null}
      {selectedRoute === "/app/practice/mastered" && currentPracticeApi ? (
        <PracticeStateListPage
          api={currentPracticeApi}
          stateType="mastered"
          onNavigate={setSelectedPath}
          onPracticeCreated={setPendingPracticeSession}
        />
      ) : null}
      {selectedRoute === "/app/practice/confused" && currentPracticeApi ? (
        <PracticeStateListPage
          api={currentPracticeApi}
          stateType="confused"
          onNavigate={setSelectedPath}
          onPracticeCreated={setPendingPracticeSession}
        />
      ) : null}
    </>
  );
}

function getSessionId(path: string): number {
  const value = Number(path.split("/").pop());
  return Number.isFinite(value) ? value : 0;
}

function getRoutePath(path: string): string {
  return path.split("?")[0];
}

function isClassLearningApi(api: UserPracticeApi | undefined): api is UserPracticeApi & ClassLearningApi {
  return typeof api?.listClassCourseOptions === "function" && typeof api?.getClassPracticeSummary === "function";
}

function isCourseOverviewApi(api: UserPracticeApi | undefined): api is UserPracticeApi & CourseOverviewApi {
  return typeof api?.listCourses === "function";
}

function isNotificationCenterApi(api: UserPracticeApi | undefined): api is UserPracticeApi & NotificationCenterApi {
  return typeof api?.listNotifications === "function" && typeof api?.markNotificationRead === "function";
}

function isQuestionFeedbackApi(api: UserPracticeApi | undefined): api is UserPracticeApi & QuestionFeedbackPageApi {
  return (
    typeof api?.createQuestionComment === "function" &&
    typeof api?.createQuestionChallenge === "function" &&
    typeof api?.uploadFile === "function"
  );
}

function isTeacherQuestionBankApi(api: UserPracticeApi | undefined): api is UserPracticeApi & TeacherQuestionBankApi {
  return (
    typeof api?.listQuestionBanks === "function" &&
    typeof api?.createQuestionBank === "function" &&
    typeof api?.publishQuestionBank === "function" &&
    typeof api?.assignQuestionBankVisibility === "function"
  );
}

function isStudentLearningDetailApi(api: UserPracticeApi | undefined): api is UserPracticeApi & StudentLearningDetailApi {
  return typeof api?.getStudentPracticeDetail === "function";
}

function isStudentPracticeSessionDetailApi(
  api: UserPracticeApi | undefined
): api is UserPracticeApi & StudentPracticeSessionDetailApi {
  return typeof api?.getStudentPracticeSessionDetail === "function";
}

function isStudentPracticeSessionQuestionDetailApi(
  api: UserPracticeApi | undefined
): api is UserPracticeApi & StudentPracticeSessionQuestionDetailApi {
  return (
    typeof api?.getStudentPracticeSessionQuestionDetail === "function" &&
    typeof api?.upsertStudentPracticeSessionQuestionReview === "function"
  );
}

function isTeacherExamApi(api: UserPracticeApi | undefined): api is UserPracticeApi & TeacherExamApi {
  return (
    typeof api?.listExams === "function" &&
    typeof api?.createExam === "function" &&
    typeof api?.getExam === "function" &&
    typeof api?.updateExam === "function" &&
    typeof api?.publishExam === "function" &&
    typeof api?.getExamOverview === "function" &&
    typeof api?.getExamAttemptReview === "function"
  );
}

function isStudentExamApi(api: UserPracticeApi | undefined): api is UserPracticeApi & StudentExamApi {
  return (
    typeof api?.listExams === "function" &&
    typeof api?.startExamAttempt === "function" &&
    typeof api?.saveExamAttemptAnswer === "function" &&
    typeof api?.submitExamAttempt === "function" &&
    typeof api?.getExamAttemptResult === "function"
  );
}

function wrapUnauthorizedApi<T extends object>(api: T, onUnauthorized: () => void): T {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) => {
        const result = Reflect.apply(value, target, args);
        if (!(result instanceof Promise)) {
          return result;
        }

        return result.catch((error: unknown) => {
          if (isUnauthorizedError(error)) {
            onUnauthorized();
          }
          throw error;
        });
      };
    }
  });
}

function isUnauthorizedError(error: unknown): error is Error & { status: number } {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 401;
}

function getFirstAvailablePath(menus: MenuItem[]): string {
  for (const menu of menus) {
    if (menu.children.length > 0) {
      const childPath = getFirstAvailablePath(menu.children);
      if (childPath) {
        return childPath;
      }
    }

    if (menu.path) {
      return menu.path;
    }
  }

  return "/app/workbench";
}

function getUserTypeLabel(userType: UserSessionState["user"]["user_type"]): string {
  switch (userType) {
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    case "school_admin":
      return "学校管理员";
    case "sys_admin":
      return "系统管理员";
    default:
      return userType;
  }
}
