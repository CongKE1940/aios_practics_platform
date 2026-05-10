import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

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
  type Notice
} from "@aios/api-sdk";
import { AppShell, EmptyState, SidebarUserMenu, StatusNotice } from "@aios/ui-web";

import sceneBackground from "../../../docs/images/背景.png";
import brandIcon from "../../../docs/images/图标.png";

import {
  AdminMenuTree,
  normalizeAdminNavigationMenus,
  resolveAdminNavigationBreadcrumb
} from "./admin-navigation";
import { AdminWorkbench } from "./admin-workbench";
import { AnalyticsPanel, type AnalyticsPanelApi } from "./analytics-panel";
import { ChallengePanel, type ChallengePanelApi } from "./challenge-panel";
import { ClassManagementPanel } from "./class-management-panel";
import { CourseManagementPanel } from "./course-management-panel";
import { DictionaryItemPanel, DictionaryPanel, type DictionaryPanelApi } from "./dictionary-panel";
import { ExamPanel, type ExamPanelApi } from "./exam-panel";
import { GradeManagementPanel } from "./grade-management-panel";
import { HistoryPanel, type HistoryPanelApi } from "./history-panel";
import { ImportPanel, type ImportPanelApi } from "./import-panel";
import { NoticePanel, type NoticeApi } from "./notice-panel";
import { NotificationPanel, type AdminNotificationApi } from "./notification-panel";
import { type OrganizationApi } from "./organization-panel";
import { PaperManagementPanel, type PaperManagementApi } from "./paper-assembly-panel";
import { ProfilePanel, type ProfilePanelApi } from "./profile-panel";
import { QuestionBankPanel, type QuestionBankPanelApi } from "./question-bank-panel";
import { QuestionEditorPanel } from "./question-editor-panel";
import { QuestionPanel, type QuestionPanelApi } from "./question-panel";
import { RbacPanel, type RbacPanelApi } from "./rbac-panel";
import { SchoolManagementPanel } from "./school-management-panel";
import { UserPanel, type UserPanelApi } from "./user-panel";

interface AuthApi {
  listLoginOrganizations(): Promise<LoginOrganization[]>;
  login(body: LoginRequest): Promise<LoginResponse>;
  changeInitialPassword?(body: ChangeInitialPasswordRequest): Promise<boolean>;
  logout(): Promise<boolean>;
  menus(accessToken: string): Promise<MenuItem[]>;
}

interface AdminAppProps {
  authApi?: AuthApi;
  noticeApi?: NoticeApi;
  notificationApi?: AdminNotificationApi;
  orgApi?: OrganizationApi;
  questionBankApi?: QuestionBankPanelApi;
  questionApi?: QuestionPanelApi;
  importApi?: ImportPanelApi;
  examApi?: ExamPanelApi;
  userApi?: UserPanelApi;
  rbacApi?: RbacPanelApi;
  dictionaryApi?: DictionaryPanelApi;
  analyticsApi?: AnalyticsPanelApi;
  historyApi?: HistoryPanelApi;
  profileApi?: ProfilePanelApi;
  challengeApi?: ChallengePanelApi;
  sessionStore?: SessionStore;
}

export interface SessionState {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  menus: MenuItem[];
  user: LoginResponse["user"];
}

export interface SessionStore {
  load(): SessionState | null;
  save(session: SessionState): void;
  clear(): void;
}

const defaultForm: LoginRequest = {
  tenant_code: "",
  username: "admin",
  password: ""
};

export function AdminApp({
  authApi,
  noticeApi,
  notificationApi,
  orgApi,
  questionBankApi,
  questionApi,
  importApi,
  examApi,
  userApi,
  rbacApi,
  dictionaryApi,
  analyticsApi,
  historyApi,
  profileApi,
  challengeApi,
  sessionStore
}: AdminAppProps) {
  const [form, setForm] = useState<LoginRequest>(defaultForm);
  const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
  const [session, setSession] = useState<SessionState | null>(() => normalizeSession(store.load()));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPath, setSelectedPath] = useState("/admin/workbench");
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [pendingAnnouncements, setPendingAnnouncements] = useState<Notice[]>([]);
  const [passwordChangeState, setPasswordChangeState] = useState<ChangeInitialPasswordRequest | null>(null);
  const [passwordChangeConfirm, setPasswordChangeConfirm] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
  const refreshedMenuTokenRef = useRef("");

  const api = useMemo<AuthApi>(() => {
    if (authApi) {
      return authApi;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    const anonymous = createApiClient({ baseUrl });

    return {
      listLoginOrganizations: () => anonymous.listLoginOrganizations(),
      login: (body) => anonymous.login(body),
      changeInitialPassword: (body) => anonymous.changeInitialPassword(body),
      logout: async () => true,
      menus: (accessToken) => createApiClient({ baseUrl, accessToken }).menus("admin")
    };
  }, [authApi]);

  useEffect(() => {
    if (!session) {
      refreshedMenuTokenRef.current = "";
      return;
    }
    if (refreshedMenuTokenRef.current === session.accessToken) {
      return;
    }

    refreshedMenuTokenRef.current = session.accessToken;
    const accessToken = session.accessToken;
    let active = true;

    api
      .menus(accessToken)
      .then((menus) => {
        if (!active) {
          return;
        }
        const normalizedMenus = normalizeAdminMenus(menus);
        setSession((current) => {
          if (!current || current.accessToken !== accessToken || areMenuTreesEqual(current.menus, normalizedMenus)) {
            return current;
          }
          const nextSession = {
            ...current,
            menus: normalizedMenus
          };
          store.save(nextSession);
          return nextSession;
        });
      })
      .catch(() => {
        // 保留已缓存菜单，避免短暂网络问题打断当前操作。
      });

    return () => {
      active = false;
    };
  }, [api, session, store]);

  useEffect(() => {
    if (session) {
      return;
    }

    let active = true;
    setOrganizationsLoading(true);
    setOrganizationsError("");

    api
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
  }, [api, session]);

  const organizationApi = useMemo<OrganizationApi | undefined>(() => {
    if (orgApi) {
      return orgApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [orgApi, session]);

  const currentUserApi = useMemo<UserPanelApi | undefined>(() => {
    if (userApi) {
      return userApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [session, userApi]);

  const currentRbacApi = useMemo<RbacPanelApi | undefined>(() => {
    if (rbacApi) {
      return rbacApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [rbacApi, session]);

  const currentDictionaryApi = useMemo<DictionaryPanelApi | undefined>(() => {
    if (dictionaryApi) {
      return dictionaryApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [dictionaryApi, session]);

  const currentNoticeApi = useMemo<NoticeApi | undefined>(() => {
    if (noticeApi) {
      return noticeApi;
    }
    if (!session || (selectedPath !== "/admin/notices" && selectedPath !== "/admin/workbench" && selectedPath !== "")) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [noticeApi, selectedPath, session]);

  const currentNotificationApi = useMemo<AdminNotificationApi | undefined>(() => {
    if (notificationApi) {
      return notificationApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [notificationApi, session]);

  const currentQuestionBankApi = useMemo<QuestionBankPanelApi | undefined>(() => {
    if (questionBankApi) {
      return questionBankApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [questionBankApi, session]);

  const currentQuestionApi = useMemo<QuestionPanelApi | undefined>(() => {
    if (questionApi) {
      return questionApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [questionApi, session]);

  const currentImportApi = useMemo<ImportPanelApi | undefined>(() => {
    if (importApi) {
      return importApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [importApi, session]);

  const currentExamApi = useMemo<ExamPanelApi | undefined>(() => {
    if (examApi) {
      return examApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [examApi, session]);

  const currentAnalyticsApi = useMemo<AnalyticsPanelApi | undefined>(() => {
    if (analyticsApi) {
      return analyticsApi;
    }
    if (!session || (selectedPath !== "/admin/analytics" && selectedPath !== "/admin/workbench" && selectedPath !== "")) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [analyticsApi, selectedPath, session]);

  const currentHistoryApi = useMemo<HistoryPanelApi | undefined>(() => {
    if (historyApi) {
      return historyApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [historyApi, session]);

  const currentProfileApi = useMemo<ProfilePanelApi | undefined>(() => {
    if (profileApi) {
      return profileApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [profileApi, session]);

  const currentChallengeApi = useMemo<ChallengePanelApi | undefined>(() => {
    if (challengeApi) {
      return challengeApi;
    }
    if (!session || selectedPath !== "/admin/challenges") {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [challengeApi, selectedPath, session]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    try {
      const result = await api.login(form);
      await applyLoginResult(result);
    } catch (error) {
      if (isPasswordChangeRequired(error)) {
        setPasswordChangeState({
          tenant_code: form.tenant_code,
          username: form.username,
          old_password: form.password,
          new_password: ""
        });
        setPasswordChangeConfirm("");
        setForm((current) => ({ ...current, password: "" }));
        setErrorMessage("");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "登录失败");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInitialPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordChangeState) {
      return;
    }
    if (!api.changeInitialPassword) {
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
      await api.changeInitialPassword(passwordChangeState);
      const result = await api.login({
        tenant_code: passwordChangeState.tenant_code,
        username: passwordChangeState.username,
        password: passwordChangeState.new_password
      });
      setPasswordChangeState(null);
      setPasswordChangeConfirm("");
      setForm((current) => ({ ...current, password: "" }));
      await applyLoginResult(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "初始密码修改失败");
    } finally {
      setPasswordChanging(false);
    }
  }

  async function applyLoginResult(result: LoginResponse) {
    const menus = normalizeAdminMenus(await api.menus(result.access_token));
    const nextSession = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresIn: result.expires_in,
      menus,
      user: result.user
    };
    store.save(nextSession);
    setSession(nextSession);
    setSelectedPath("/admin/workbench");
  }

  async function handleLogout() {
    await api.logout();
    store.clear();
    setSession(null);
    setSelectedPath("/admin/workbench");
    setPasswordChangeState(null);
    setPasswordChangeConfirm("");
    setForm((current) => ({ ...current, password: "" }));
  }

  async function refreshUnreadNotifications() {
    if (!currentNotificationApi) {
      setHasUnreadNotifications(false);
      return;
    }
    try {
      const result = await currentNotificationApi.listNotifications({ status: "unread", page: 1, page_size: 1 });
      setHasUnreadNotifications(result.total > 0);
    } catch {
      setHasUnreadNotifications(false);
    }
  }

  async function confirmPendingAnnouncements() {
    if (!currentNotificationApi?.markAnnouncementRead) {
      setPendingAnnouncements([]);
      return;
    }
    const announcements = pendingAnnouncements;
    setPendingAnnouncements([]);
    await Promise.all(announcements.map((notice) => currentNotificationApi.markAnnouncementRead?.(notice.id)));
    await refreshUnreadNotifications();
  }

  useEffect(() => {
    if (!session || !currentNotificationApi) {
      setHasUnreadNotifications(false);
      return;
    }
    let active = true;
    currentNotificationApi
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
  }, [currentNotificationApi, session]);

  useEffect(() => {
    if (!session || !currentNotificationApi?.listAnnouncements) {
      setPendingAnnouncements([]);
      return;
    }
    let active = true;
    currentNotificationApi
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
  }, [currentNotificationApi, session]);

  if (!session) {
    if (passwordChangeState) {
      return (
        <InitialPasswordChangePage
          state={passwordChangeState}
          confirmPassword={passwordChangeConfirm}
          submitting={passwordChanging}
          errorMessage={errorMessage}
          onSubmit={handleInitialPasswordChange}
          onStateChange={setPasswordChangeState}
          onConfirmPasswordChange={setPasswordChangeConfirm}
          onBack={() => {
            setPasswordChangeState(null);
            setPasswordChangeConfirm("");
            setForm((current) => ({ ...current, password: "" }));
            setErrorMessage("");
          }}
        />
      );
    }

    return (
      <main className="ui-auth-page">
        <img src={sceneBackground} alt="" className="ui-scene-image" />
        <section className="ui-auth-hero">
          <span className="ui-auth-hero__sr">AIOS 管理端登录说明</span>
          <h1 className="ui-auth-hero__title">题练通 · 管理端</h1>
        </section>
        <section className="ui-auth-card">
          <form onSubmit={(event) => void handleSubmit(event)} aria-label="登录表单" className="ui-auth-form">
            <header className="ui-auth-form__header">
              <img src={brandIcon} alt="" className="ui-brand-mark" />
              <h2>管理端登录</h2>
            </header>
            <div className="ui-field">
              <label htmlFor="tenant_code">组织</label>
              <select
                id="tenant_code"
                name="tenant_code"
                value={form.tenant_code}
                onChange={(event) => setForm((current) => ({ ...current, tenant_code: event.target.value }))}
                disabled={organizationsLoading}
              >
                <option value="">{organizationsLoading ? "组织加载中..." : "请选择组织"}</option>
                {organizations.map((organization) => (
                  <option key={organization.tenant_code} value={organization.tenant_code}>
                    {formatOrganizationLabel(organization)}
                  </option>
                ))}
              </select>
            </div>
            {organizationsError ? (
              <StatusNotice tone="warning" title="组织列表加载失败" description={organizationsError} />
            ) : null}
            <div className="ui-field">
              <label htmlFor="username">用户名</label>
              <input
                id="username"
                name="username"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              />
            </div>
            <div className="ui-field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </div>
            {errorMessage ? <StatusNotice tone="danger" title="登录失败" description={errorMessage} /> : null}
            <button
              type="submit"
              className="ui-button ui-button--primary"
              disabled={submitting || organizationsLoading || !form.tenant_code}
            >
              {submitting ? "登录中..." : "登录"}
            </button>
            <footer className="ui-auth-form__footer">
              <button type="button" className="ui-auth-link">
                学习端入口
              </button>
              <button type="button" className="ui-auth-link">
                忘记密码？
              </button>
            </footer>
          </form>
        </section>
      </main>
    );
  }

  const canOpenSelectedPath = canOpenAdminPath(session.menus, selectedPath);
  const currentView = renderAdminView({
    selectedPath,
    currentUser: session.user,
    organizationApi,
    currentUserApi,
    currentRbacApi,
    currentDictionaryApi,
    currentNoticeApi,
    currentNotificationApi,
    currentQuestionBankApi,
    currentQuestionApi,
    currentImportApi,
    currentExamApi,
    currentAnalyticsApi,
    currentHistoryApi,
    currentProfileApi,
    currentChallengeApi,
    onUserUpdated: (user) => {
      if (!session) {
        return;
      }
      const nextSession = {
        ...session,
        user: {
          ...session.user,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          must_change_password: user.must_change_password
        }
      };
      store.save(nextSession);
      setSession(nextSession);
    },
    onNavigate: setSelectedPath,
    onUnreadMayChange: refreshUnreadNotifications
  });
  const breadcrumb = resolveAdminNavigationBreadcrumb(selectedPath, session.menus);

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
                <strong>题练通 AIOS</strong>
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
            <AdminMenuTree menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />
            <SidebarUserMenu
              displayName={session.user.display_name}
              avatarUrl={session.user.avatar_url}
              userTypeLabel={getUserTypeLabel(session.user.user_type)}
              onProfile={() => setSelectedPath("/admin/profile")}
              onNotifications={() => setSelectedPath("/admin/notifications")}
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
        <div className="ui-admin-route">
          {selectedPath === "" || selectedPath === "/admin/workbench" ? (
            <AdminWorkbench
              analyticsApi={currentAnalyticsApi}
              examApi={currentExamApi}
              noticeApi={currentNoticeApi}
              organizationApi={organizationApi}
              questionApi={currentQuestionApi}
              questionBankApi={currentQuestionBankApi}
              userApi={currentUserApi}
              userType={session.user.user_type}
              userDisplayName={session.user.display_name}
              availablePaths={collectMenuPaths(session.menus)}
              onNavigate={setSelectedPath}
            />
          ) : isKnownAdminPath(selectedPath) && canOpenSelectedPath ? (
            currentView
          ) : isKnownAdminPath(selectedPath) ? (
            <EmptyState title="无权限访问" />
          ) : (
            <EmptyState title="请选择功能入口" />
          )}
        </div>
        {pendingAnnouncements.length > 0 ? (
          <AnnouncementLoginModal announcements={pendingAnnouncements} onConfirm={() => void confirmPendingAnnouncements()} />
        ) : null}
      </AppShell>
    </div>
  );
}

interface RenderAdminViewArgs {
  selectedPath: string;
  currentUser: LoginResponse["user"];
  organizationApi?: OrganizationApi;
  currentUserApi?: UserPanelApi;
  currentRbacApi?: RbacPanelApi;
  currentDictionaryApi?: DictionaryPanelApi;
  currentNoticeApi?: NoticeApi;
  currentNotificationApi?: AdminNotificationApi;
  currentQuestionBankApi?: QuestionBankPanelApi;
  currentQuestionApi?: QuestionPanelApi;
  currentImportApi?: ImportPanelApi;
  currentExamApi?: ExamPanelApi;
  currentAnalyticsApi?: AnalyticsPanelApi;
  currentHistoryApi?: HistoryPanelApi;
  currentProfileApi?: ProfilePanelApi;
  currentChallengeApi?: ChallengePanelApi;
  onUserUpdated(user: ManagedUser): void;
  onNavigate(path: string): void;
  onUnreadMayChange(): void;
}

function renderAdminView({
  selectedPath,
  currentUser,
  organizationApi,
  currentUserApi,
  currentRbacApi,
  currentDictionaryApi,
  currentNoticeApi,
  currentNotificationApi,
  currentQuestionBankApi,
  currentQuestionApi,
  currentImportApi,
  currentExamApi,
  currentAnalyticsApi,
  currentHistoryApi,
  currentProfileApi,
  currentChallengeApi,
  onUserUpdated,
  onNavigate,
  onUnreadMayChange
}: RenderAdminViewArgs) {
  return (
    <>
      {selectedPath === "/admin/org" && organizationApi ? <SchoolManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/org/schools" && organizationApi ? <SchoolManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/org/grades" && organizationApi ? <GradeManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/org/classes" && organizationApi ? <ClassManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/courses" && organizationApi ? <CourseManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/users" && currentUserApi ? <UserPanel api={currentUserApi} currentUser={currentUser} /> : null}
      {selectedPath === "/admin/roles" && currentRbacApi ? (
        <RbacPanel api={currentRbacApi} currentUser={currentUser} title="角色权限" />
      ) : null}
      {selectedPath === "/admin/system/config" && currentRbacApi ? (
        <RbacPanel api={currentRbacApi} currentUser={currentUser} title="系统配置" />
      ) : null}
      {selectedPath === "/admin/tenant/roles" && currentRbacApi ? (
        <RbacPanel api={currentRbacApi} currentUser={currentUser} title="租户角色配置" />
      ) : null}
      {selectedPath === "/admin/dictionaries" && currentDictionaryApi ? (
        <DictionaryPanel api={currentDictionaryApi} onNavigate={onNavigate} />
      ) : null}
      {selectedPath.startsWith("/admin/dictionaries/") && currentDictionaryApi ? (
        <DictionaryItemPanel api={currentDictionaryApi} dictionaryId={parseDictionaryID(selectedPath)} onNavigate={onNavigate} />
      ) : null}
      {selectedPath === "/admin/notices" && currentNoticeApi ? <NoticePanel api={currentNoticeApi} /> : null}
      {selectedPath === "/admin/notifications" && currentNotificationApi ? (
        <NotificationPanel api={currentNotificationApi} onUnreadMayChange={onUnreadMayChange} />
      ) : null}
      {selectedPath === "/admin/question-banks" && currentQuestionBankApi ? (
        <QuestionBankPanel api={currentQuestionBankApi} />
      ) : null}
      {selectedPath === "/admin/questions" && currentQuestionApi ? (
        <QuestionPanel api={currentQuestionApi} onNavigate={onNavigate} />
      ) : null}
      {selectedPath === "/admin/questions/editor" && currentQuestionApi ? <QuestionEditorPanel api={currentQuestionApi} /> : null}
      {selectedPath === "/admin/imports" && currentImportApi ? <ImportPanel api={currentImportApi} /> : null}
      {selectedPath === "/admin/exams" && currentExamApi ? <ExamPanel api={currentExamApi} onNavigate={onNavigate} /> : null}
      {selectedPath === "/admin/exam-papers" && hasPaperManagementApi(currentExamApi) ? <PaperManagementPanel api={currentExamApi} /> : null}
      {selectedPath === "/admin/exams/assembly" && hasPaperManagementApi(currentExamApi) ? <PaperManagementPanel api={currentExamApi} /> : null}
      {selectedPath === "/admin/challenges" ? <ChallengePanel api={currentChallengeApi} /> : null}
      {selectedPath === "/admin/analytics" && currentAnalyticsApi ? <AnalyticsPanel api={currentAnalyticsApi} /> : null}
      {selectedPath === "/admin/history" && currentHistoryApi ? <HistoryPanel api={currentHistoryApi} /> : null}
      {selectedPath === "/admin/profile" && currentProfileApi ? (
        <ProfilePanel api={currentProfileApi} onUserUpdated={onUserUpdated} />
      ) : null}
    </>
  );
}

function isKnownAdminPath(selectedPath: string): boolean {
  return [
    "/admin/workbench",
    "/admin/org",
    "/admin/org/schools",
    "/admin/org/grades",
    "/admin/org/classes",
    "/admin/courses",
    "/admin/users",
    "/admin/roles",
    "/admin/dictionaries",
    "/admin/notices",
    "/admin/notifications",
    "/admin/question-banks",
    "/admin/questions",
    "/admin/questions/editor",
    "/admin/imports",
    "/admin/exams",
    "/admin/exam-papers",
    "/admin/exams/assembly",
    "/admin/challenges",
    "/admin/analytics",
    "/admin/history",
    "/admin/profile",
    "/admin/system/config",
    "/admin/tenant/roles"
  ].includes(selectedPath) || selectedPath.startsWith("/admin/dictionaries/");
}

function isPasswordChangeRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === PASSWORD_CHANGE_REQUIRED_CODE;
}

interface InitialPasswordChangePageProps {
  state: ChangeInitialPasswordRequest;
  confirmPassword: string;
  submitting: boolean;
  errorMessage: string;
  onSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
  onStateChange(state: ChangeInitialPasswordRequest): void;
  onConfirmPasswordChange(value: string): void;
  onBack(): void;
}

function InitialPasswordChangePage({
  state,
  confirmPassword,
  submitting,
  errorMessage,
  onSubmit,
  onStateChange,
  onConfirmPasswordChange,
  onBack
}: InitialPasswordChangePageProps) {
  return (
    <main className="ui-auth-page">
      <img src={sceneBackground} alt="" className="ui-scene-image" />
      <section className="ui-auth-hero">
        <span className="ui-auth-hero__sr">AIOS 管理端初始密码修改背景</span>
      </section>
      <section className="ui-auth-card">
        <form onSubmit={(event) => void onSubmit(event)} aria-label="初始密码修改表单" className="ui-auth-form">
          <header className="ui-auth-form__header">
            <img src={brandIcon} alt="" className="ui-brand-mark" />
            <h1>修改初始密码</h1>
            <p>{state.username}</p>
          </header>
          <InitialPasswordChangeFields
            state={state}
            confirmPassword={confirmPassword}
            submitting={submitting}
            errorMessage={errorMessage}
            onStateChange={onStateChange}
            onConfirmPasswordChange={onConfirmPasswordChange}
            onBack={onBack}
          />
        </form>
      </section>
    </main>
  );
}

interface InitialPasswordChangeFieldsProps {
  state: ChangeInitialPasswordRequest;
  confirmPassword: string;
  submitting: boolean;
  errorMessage?: string;
  onStateChange(state: ChangeInitialPasswordRequest): void;
  onConfirmPasswordChange(value: string): void;
  onBack(): void;
}

function InitialPasswordChangeFields({
  state,
  confirmPassword,
  submitting,
  errorMessage,
  onStateChange,
  onConfirmPasswordChange,
  onBack
}: InitialPasswordChangeFieldsProps) {
  return (
    <div className="ui-auth-form__stack" aria-label="初始密码修改">
      <StatusNotice tone="warning" title="需要修改初始密码" />
      <div className="ui-field">
        <label htmlFor="initial_new_password">新密码</label>
        <input
          id="initial_new_password"
          name="initial_new_password"
          type="password"
          value={state.new_password}
          onChange={(event) => onStateChange({ ...state, new_password: event.target.value })}
        />
      </div>
      <div className="ui-field">
        <label htmlFor="initial_confirm_password">确认新密码</label>
        <input
          id="initial_confirm_password"
          name="initial_confirm_password"
          type="password"
          value={confirmPassword}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
        />
      </div>
      {errorMessage ? <StatusNotice tone="danger" title="初始密码修改失败" description={errorMessage} /> : null}
      <button type="submit" className="ui-button ui-button--primary" disabled={submitting}>
        {submitting ? "修改中..." : "修改密码并登录"}
      </button>
      <button type="button" className="ui-button ui-button--ghost" disabled={submitting} onClick={onBack}>
        返回登录
      </button>
    </div>
  );
}

function hasPaperManagementApi(api?: ExamPanelApi): api is ExamPanelApi & PaperManagementApi {
  return Boolean(
    api?.listExamPapers &&
      api.createExamPaper &&
      api.getExamPaper &&
      api.updateExamPaper &&
      api.publishExamPaper &&
      api.listQuestions &&
      api.listQuestionBanks &&
      api.listCourses
  );
}

function parseDictionaryID(path: string): number {
  const [, , , rawID] = path.split("/");
  const parsed = Number(rawID);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getUserTypeLabel(userType: LoginResponse["user"]["user_type"]): string {
  switch (userType) {
    case "sys_admin":
      return "平台管理员";
    case "tenant_admin":
      return "租户管理员";
    case "school_admin":
      return "学校/组织管理员";
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    default:
      return userType;
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
          {announcements.length > 1 ? <p>还有 {announcements.length - 1} 条未读公告</p> : null}
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

function formatOrganizationLabel(organization: LoginOrganization): string {
  return `${organization.tenant_name}（${organization.tenant_code}）`;
}

function createBrowserSessionStore(): SessionStore {
  const storageKey = "aios.admin.session";

  return {
    load() {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }

      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      try {
        return normalizeSession(JSON.parse(raw) as SessionState);
      } catch {
        return null;
      }
    },
    save(session) {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    clear() {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }
      window.localStorage.removeItem(storageKey);
    }
  };
}

function normalizeSession(session: SessionState | null): SessionState | null {
  if (!session) {
    return null;
  }

  return {
    ...session,
    menus: normalizeAdminMenus(session.menus)
  };
}

function normalizeAdminMenus(menus: MenuItem[]): MenuItem[] {
  return normalizeAdminNavigationMenus(menus);
}

function canOpenAdminPath(menus: MenuItem[], selectedPath: string): boolean {
  if (
    selectedPath === "" ||
    selectedPath === "/admin/workbench" ||
    selectedPath === "/admin/profile" ||
    selectedPath === "/admin/notifications"
  ) {
    return true;
  }
  if (selectedPath.startsWith("/admin/dictionaries/")) {
    return hasMenuPath(menus, "/admin/dictionaries");
  }
  return hasMenuPath(menus, selectedPath);
}

function hasMenuPath(menus: MenuItem[], selectedPath: string): boolean {
  for (const menu of menus) {
    if (menu.path === selectedPath) {
      return true;
    }
    if (hasMenuPath(menu.children, selectedPath)) {
      return true;
    }
  }
  return false;
}

function collectMenuPaths(menus: MenuItem[]): string[] {
  return menus.flatMap((menu) => [
    ...(menu.path ? [menu.path] : []),
    ...collectMenuPaths(menu.children)
  ]);
}

function areMenuTreesEqual(left: MenuItem[], right: MenuItem[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
