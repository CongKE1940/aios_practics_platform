import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  ApiError,
  PASSWORD_CHANGE_REQUIRED_CODE,
  createApiClient,
  type ChangeInitialPasswordRequest,
  type LoginOrganization,
  type LoginRequest,
  type LoginResponse,
  type ManagedUser,
  type MenuItem,
  type Notice,
  type PracticeSessionDetail
} from "@aios/api-sdk";
import { AppShell, EmptyState, PageSection, SidebarUserMenu, StatusNotice } from "@aios/ui-web";

import sceneBackground from "../../../docs/images/背景.png";
import brandIcon from "../../../docs/images/图标.png";

import { createBrowserSessionStore } from "./auth-store";
import type { UserAuthApi, UserSessionState, UserSessionStore } from "./auth-types";
import { MenuNav, normalizeUserNavigationMenus } from "./menu-nav";
import { LoginPage } from "./login-page";
import { NotificationCenterPage, type NotificationCenterApi } from "./notification-center-page";
import { SystemAnnouncementPage, type SystemAnnouncementApi } from "./system-announcement-page";
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
import { ProfilePage, type UserProfileApi } from "./profile-page";

type UserPracticeApi = PracticePanelApi &
  PracticeReviewApi &
  Partial<CourseOverviewApi> &
  Partial<NotificationCenterApi> &
  Partial<SystemAnnouncementApi> &
  Partial<QuestionFeedbackPageApi> &
  Partial<TeacherQuestionBankApi> &
  Partial<ClassLearningApi> &
  Partial<StudentLearningDetailApi> &
  Partial<StudentPracticeSessionDetailApi> &
  Partial<StudentPracticeSessionQuestionDetailApi> &
  Partial<StudentExamApi> &
  Partial<TeacherExamApi> &
  Partial<UserProfileApi>;

interface UserAppProps {
  authApi?: UserAuthApi;
  practiceApi?: UserPracticeApi;
  sessionStore?: UserSessionStore;
}

export function UserApp({ authApi, practiceApi, sessionStore }: UserAppProps) {
  const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
  const initialSession = useMemo(() => normalizeUserSession(store.load()), [store]);
  const [session, setSession] = useState<UserSessionState | null>(initialSession);
  const [selectedPath, setSelectedPath] = useState(() => getFirstAvailablePath(initialSession?.menus ?? []));
  const [pendingPracticeSession, setPendingPracticeSession] = useState<PracticeSessionDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [pendingAnnouncements, setPendingAnnouncements] = useState<Notice[]>([]);
  const [passwordChangeState, setPasswordChangeState] = useState<ChangeInitialPasswordRequest | null>(null);
  const [passwordChangeConfirm, setPasswordChangeConfirm] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
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
      changeInitialPassword: (body) => anonymous.changeInitialPassword(body),
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

  useEffect(() => {
    if (!session || !currentPracticeApi || !isNotificationCenterApi(currentPracticeApi)) {
      setHasUnreadNotifications(false);
      return;
    }

    let active = true;
    currentPracticeApi
      .listNotifications({ status: "unread", page: 1, page_size: 1 })
      .then((result) => {
        if (active) {
          setHasUnreadNotifications(result.total > 0);
        }
      })
      .catch(() => {
        if (active) {
          setHasUnreadNotifications(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPracticeApi, session]);

  useEffect(() => {
    if (!session || !currentPracticeApi || !isSystemAnnouncementApi(currentPracticeApi)) {
      setPendingAnnouncements([]);
      return;
    }

    let active = true;
    currentPracticeApi
      .listAnnouncements({ notice_type: "system", read_status: "unread", page: 1, page_size: 5 })
      .then((result) => {
        if (active) {
          setPendingAnnouncements(result.items);
        }
      })
      .catch(() => {
        if (active) {
          setPendingAnnouncements([]);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPracticeApi, session]);

  async function refreshUnreadNotifications() {
    if (!currentPracticeApi || !isNotificationCenterApi(currentPracticeApi)) {
      setHasUnreadNotifications(false);
      return;
    }
    try {
      const result = await currentPracticeApi.listNotifications({ status: "unread", page: 1, page_size: 1 });
      setHasUnreadNotifications(result.total > 0);
    } catch {
      setHasUnreadNotifications(false);
    }
  }

  async function confirmPendingAnnouncements() {
    if (!currentPracticeApi || !isSystemAnnouncementApi(currentPracticeApi)) {
      setPendingAnnouncements([]);
      return;
    }
    const announcements = pendingAnnouncements;
    setPendingAnnouncements([]);
    await Promise.all(announcements.map((notice) => currentPracticeApi.markAnnouncementRead(notice.id)));
    await refreshUnreadNotifications();
  }

  async function handleLogin(form: LoginRequest) {
    setSubmitting(true);
    setErrorMessage("");

    try {
      let result;
      try {
        result = await auth.login(form);
      } catch (error) {
        if (isPasswordChangeRequired(error)) {
          setPasswordChangeState({
            tenant_code: form.tenant_code,
            username: form.username,
            old_password: form.password,
            new_password: ""
          });
          setPasswordChangeConfirm("");
          setErrorMessage("");
        } else {
          setErrorMessage(error instanceof Error ? error.message : "登录失败");
        }
        return;
      }

      await applyLoginResult(result);
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

  async function handleInitialPasswordChange() {
    if (!passwordChangeState) {
      return;
    }
    if (!auth.changeInitialPassword) {
      setErrorMessage("当前接口暂不支持初始密码修改。");
      return;
    }
    if (passwordChangeState.new_password !== passwordChangeConfirm) {
      setErrorMessage("两次输入的新密码不一致。");
      return;
    }
    if (passwordChangeState.new_password.length < 8 || passwordChangeState.new_password === passwordChangeState.old_password) {
      setErrorMessage("新密码至少 8 位，且不能与初始密码相同。");
      return;
    }

    setPasswordChanging(true);
    setErrorMessage("");
    try {
      await auth.changeInitialPassword(passwordChangeState);
      const result = await auth.login({
        tenant_code: passwordChangeState.tenant_code,
        username: passwordChangeState.username,
        password: passwordChangeState.new_password
      });
      setPasswordChangeState(null);
      setPasswordChangeConfirm("");
      await applyLoginResult(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "初始密码修改失败");
    } finally {
      setPasswordChanging(false);
    }
  }

  async function applyLoginResult(result: LoginResponse) {
    const menus = normalizeUserNavigationMenus(await auth.menus(result.access_token));
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
      setPasswordChangeState(null);
      setPasswordChangeConfirm("");
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
            passwordChangeState={passwordChangeState}
            passwordChangeConfirm={passwordChangeConfirm}
            passwordChanging={passwordChanging}
            onSubmit={handleLogin}
            onPasswordChangeStateChange={setPasswordChangeState}
            onPasswordChangeConfirmChange={setPasswordChangeConfirm}
            onPasswordChangeSubmit={handleInitialPasswordChange}
            onPasswordChangeBack={() => {
              setPasswordChangeState(null);
              setPasswordChangeConfirm("");
              setErrorMessage("");
            }}
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
    setSelectedPath,
    onUserUpdated: (user) => {
      if (!session) {
        return;
      }
      const nextSession = {
        ...session,
        user: {
          ...session.user,
          display_name: user.display_name,
          must_change_password: user.must_change_password
        }
      };
      store.save(nextSession);
      setSession(nextSession);
    },
    onUnreadMayChange: refreshUnreadNotifications
  });
  const breadcrumb = resolveUserBreadcrumb(selectedPath, session.menus);

  return (
    <div className="ui-app-frame">
      <img src={sceneBackground} alt="" className="ui-scene-image ui-scene-image--shell" />
      <AppShell
        sidebarCollapsed={sidebarCollapsed}
        brand={
          <div className="ui-sidebar-brand-row">
            <div className="ui-brand-block">
              <div className="ui-brand-block__row">
                <img src={brandIcon} alt="" className="ui-brand-block__icon" />
                <strong>智慧教育平台</strong>
              </div>
            </div>
            <button
              type="button"
              className="ui-sidebar-toggle"
              aria-label={sidebarCollapsed ? "展开左侧导航" : "收起左侧导航"}
              aria-pressed={sidebarCollapsed}
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
        }
        sidebar={
          <>
            <MenuNav menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />
            <SidebarUserMenu
              displayName={session.user.display_name}
              userTypeLabel={getUserTypeLabel(session.user.user_type)}
              onProfile={() => setSelectedPath("/app/profile")}
              onNotifications={() => setSelectedPath("/app/notifications")}
              hasUnreadNotifications={hasUnreadNotifications}
              onLogout={handleLogout}
            />
          </>
        }
        header={
          <div className="ui-topbar ui-topbar--breadcrumb" aria-label="当前位置">
            <div className="ui-breadcrumb-only">
              {breadcrumb.map((item, index) => (
                <span key={`${item}-${index}`}>
                  {index > 0 ? <span className="ui-breadcrumb-only__separator">/ </span> : null}
                  {index === breadcrumb.length - 1 ? <strong>{item}</strong> : item}
                </span>
              ))}
            </div>
          </div>
        }
      >
        {session.menus.length === 0 ? (
          <div className="ui-admin-route ui-user-route">
            <PageSection title="当前学习内容" description="">
              <EmptyState title="当前账号暂无可用功能" description="请联系管理员分配课程或权限。" />
            </PageSection>
          </div>
        ) : (
          <div className="ui-admin-route ui-user-route">{content}</div>
        )}
        {errorMessage ? <StatusNotice tone="danger" title="当前会话异常" description={errorMessage} /> : null}
        {pendingAnnouncements.length > 0 ? (
          <AnnouncementLoginModal announcements={pendingAnnouncements} onConfirm={() => void confirmPendingAnnouncements()} />
        ) : null}
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
  onUserUpdated(user: ManagedUser): void;
  onUnreadMayChange(): void;
}

function renderUserContent({
  selectedPath,
  selectedRoute,
  session,
  currentPracticeApi,
  pendingPracticeSession,
  setPendingPracticeSession,
  setSelectedPath,
  onUserUpdated,
  onUnreadMayChange
}: RenderUserContentArgs) {
  const isStudentSessionQuestionRoute = selectedRoute.startsWith("/app/class-learning/student/session/question");
  const isStudentSessionRoute = selectedRoute.startsWith("/app/class-learning/student/session");

  return (
    <>
      {selectedRoute === "/app/workbench" ? (
        <UserWorkbenchPage
          menus={session.menus}
          api={currentPracticeApi}
          userDisplayName={session.user.display_name}
          userTypeLabel={getUserTypeLabel(session.user.user_type)}
          onNavigate={setSelectedPath}
        />
      ) : null}
      {selectedRoute === "/app/profile" ? (
        currentPracticeApi && isUserProfileApi(currentPracticeApi) ? (
          <ProfilePage api={currentPracticeApi} onUserUpdated={onUserUpdated} />
        ) : (
          <p>当前个人信息功能暂不可用。</p>
        )
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
          <NotificationCenterPage api={currentPracticeApi} onUnreadMayChange={onUnreadMayChange} />
        ) : (
          <p>当前通知中心暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/announcements" ? (
        currentPracticeApi && isSystemAnnouncementApi(currentPracticeApi) ? (
          <SystemAnnouncementPage api={currentPracticeApi} onUnreadMayChange={onUnreadMayChange} />
        ) : (
          <p>当前系统公告暂不可用。</p>
        )
      ) : null}
      {selectedRoute === "/app/teacher-banks" ? (
        currentPracticeApi && isTeacherQuestionBankApi(currentPracticeApi) ? (
          <TeacherQuestionBankPage api={currentPracticeApi} userType={session.user.user_type} />
        ) : (
          <p>当前题库功能暂不可用。</p>
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

function normalizeUserSession(session: UserSessionState | null): UserSessionState | null {
  if (!session) {
    return null;
  }

  return {
    ...session,
    menus: normalizeUserNavigationMenus(session.menus)
  };
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

function isSystemAnnouncementApi(api: UserPracticeApi | undefined): api is UserPracticeApi & SystemAnnouncementApi {
  return typeof api?.listAnnouncements === "function" && typeof api?.markAnnouncementRead === "function";
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
    typeof api?.listQuestions === "function" &&
    typeof api?.createQuestion === "function"
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
    typeof api?.createExam === "function" &&
    typeof api?.publishExam === "function" &&
    typeof api?.startExamAttempt === "function" &&
    typeof api?.saveExamAttemptAnswer === "function" &&
    typeof api?.submitExamAttempt === "function" &&
    typeof api?.getExamAttemptResult === "function"
  );
}

function isUserProfileApi(api: UserPracticeApi | undefined): api is UserPracticeApi & UserProfileApi {
  return (
    typeof api?.getMyProfile === "function" &&
    typeof api?.updateMyProfile === "function" &&
    typeof api?.changeMyPassword === "function"
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

function isPasswordChangeRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === PASSWORD_CHANGE_REQUIRED_CODE;
}

function getFirstAvailablePath(menus: MenuItem[]): string {
  for (const menu of menus) {
    if (menu.children.length > 0) {
      const childPath = getFirstAvailablePath(menu.children);
      if (childPath && childPath !== "/app/workbench") {
        return childPath;
      }
    }

    if (menu.path && menu.path !== "/app/workbench") {
      return menu.path;
    }
  }

  return "/app/workbench";
}

function resolveUserBreadcrumb(selectedPath: string, menus: MenuItem[]): string[] {
  const routePath = getRoutePath(selectedPath);
  const labels = findMenuTrail(menus, routePath);
  if (labels.length > 0) {
    return labels;
  }

  return [getUserPageTitle(routePath)];
}

function findMenuTrail(menus: MenuItem[], selectedPath: string, trail: string[] = []): string[] {
  for (const menu of menus) {
    const nextTrail = [...trail, menu.name];
    if (getRoutePath(menu.path ?? "") === selectedPath) {
      return nextTrail;
    }
    if (menu.children.length > 0) {
      const childTrail = findMenuTrail(menu.children, selectedPath, nextTrail);
      if (childTrail.length > 0) {
        return childTrail;
      }
    }
  }
  return [];
}

function getUserPageTitle(selectedRoute: string): string {
  if (selectedRoute.startsWith("/app/class-learning/student/session/question")) {
    return "单题详情";
  }
  if (selectedRoute.startsWith("/app/class-learning/student/session")) {
    return "练题详情";
  }
  if (selectedRoute.startsWith("/app/class-learning/student")) {
    return "学生学习详情";
  }
  if (selectedRoute.startsWith("/app/practice/results/")) {
    return "练题结果";
  }
  if (selectedRoute.startsWith("/app/practice/history/")) {
    return "历史详情";
  }

  switch (selectedRoute) {
    case "/app/workbench":
      return "工作台";
    case "/app/profile":
      return "个人信息";
    case "/app/courses":
      return "课程中心";
    case "/app/notifications":
      return "通知中心";
    case "/app/announcements":
      return "系统公告";
    case "/app/teacher-banks":
      return "我的题库";
    case "/app/questions/feedback":
      return "题目互动";
    case "/app/class-learning":
      return "班级学习";
    case "/app/exams":
      return "考试中心";
    case "/app/practice":
      return "练题中心";
    case "/app/practice/history":
      return "练题历史";
    case "/app/practice/wrong":
      return "错题本";
    case "/app/practice/mastered":
      return "熟题本";
    case "/app/practice/confused":
      return "疑惑题";
    default:
      return "当前内容";
  }
}

function AnnouncementLoginModal({ announcements, onConfirm }: { announcements: Notice[]; onConfirm(): void }) {
  const firstAnnouncement = announcements[0];
  return (
    <div className="ui-admin-modal-backdrop">
      <section className="ui-admin-modal" aria-label="未读系统公告">
        <div className="ui-admin-modal__header">
          <div>
            <h3>未读系统公告</h3>
            <p>{firstAnnouncement.title}</p>
          </div>
        </div>
        <div className="ui-admin-modal__body">
          <dl className="ui-admin-meta-list">
            <div>
              <dt>公告内容</dt>
              <dd>{firstAnnouncement.content}</dd>
            </div>
            <div>
              <dt>发布人</dt>
              <dd>{firstAnnouncement.publisher_name || firstAnnouncement.publisher_id}</dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd>{formatDateTime(firstAnnouncement.publish_at)}</dd>
            </div>
          </dl>
          {announcements.length > 1 ? <p>还有 {announcements.length - 1} 条未读公告，可在系统公告页继续查看。</p> : null}
        </div>
        <div className="ui-admin-modal__footer">
          <button type="button" className="ui-button ui-button--primary" onClick={onConfirm}>
            我已知晓
          </button>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function getUserTypeLabel(userType: UserSessionState["user"]["user_type"]): string {
  switch (userType) {
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    case "school_admin":
      return "学校/组织管理员";
    case "tenant_admin":
      return "租户管理员";
    case "sys_admin":
      return "系统管理员";
    default:
      return userType;
  }
}
