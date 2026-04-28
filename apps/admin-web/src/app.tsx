import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createApiClient,
  type LoginOrganization,
  type LoginRequest,
  type LoginResponse,
  type MenuItem
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
import { ChallengePanel } from "./challenge-panel";
import { ClassManagementPanel } from "./class-management-panel";
import { CourseManagementPanel } from "./course-management-panel";
import { ExamPanel, type ExamPanelApi } from "./exam-panel";
import { GradeManagementPanel } from "./grade-management-panel";
import { HistoryPanel, type HistoryPanelApi } from "./history-panel";
import { ImportPanel, type ImportPanelApi } from "./import-panel";
import { NoticePanel, type NoticeApi } from "./notice-panel";
import { type OrganizationApi } from "./organization-panel";
import { PaperAssemblyPanel } from "./paper-assembly-panel";
import { QuestionBankPanel, type QuestionBankPanelApi } from "./question-bank-panel";
import { QuestionEditorPanel } from "./question-editor-panel";
import { QuestionPanel, type QuestionPanelApi } from "./question-panel";
import { RbacPanel, type RbacPanelApi } from "./rbac-panel";
import { SchoolManagementPanel } from "./school-management-panel";
import { UserPanel, type UserPanelApi } from "./user-panel";

interface AuthApi {
  listLoginOrganizations(): Promise<LoginOrganization[]>;
  login(body: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<boolean>;
  menus(accessToken: string): Promise<MenuItem[]>;
}

interface AdminAppProps {
  authApi?: AuthApi;
  noticeApi?: NoticeApi;
  orgApi?: OrganizationApi;
  questionBankApi?: QuestionBankPanelApi;
  questionApi?: QuestionPanelApi;
  importApi?: ImportPanelApi;
  examApi?: ExamPanelApi;
  userApi?: UserPanelApi;
  rbacApi?: RbacPanelApi;
  analyticsApi?: AnalyticsPanelApi;
  historyApi?: HistoryPanelApi;
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
  orgApi,
  questionBankApi,
  questionApi,
  importApi,
  examApi,
  userApi,
  rbacApi,
  analyticsApi,
  historyApi,
  sessionStore
}: AdminAppProps) {
  const [form, setForm] = useState<LoginRequest>(defaultForm);
  const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
  const [session, setSession] = useState<SessionState | null>(() => normalizeSession(store.load()));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const api = useMemo<AuthApi>(() => {
    if (authApi) {
      return authApi;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    const anonymous = createApiClient({ baseUrl });

    return {
      listLoginOrganizations: () => anonymous.listLoginOrganizations(),
      login: (body) => anonymous.login(body),
      logout: async () => true,
      menus: (accessToken) => createApiClient({ baseUrl, accessToken }).menus("admin")
    };
  }, [authApi]);

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

  const currentNoticeApi = useMemo<NoticeApi | undefined>(() => {
    if (noticeApi) {
      return noticeApi;
    }
    if (!session || selectedPath !== "/admin/notices") {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [noticeApi, selectedPath, session]);

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
    if (!session || selectedPath !== "/admin/analytics") {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    try {
      const result = await api.login(form);
      const menus = normalizeAdminMenus(await api.menus(result.access_token), result.user.permissions ?? []);
      const nextSession = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresIn: result.expires_in,
        menus,
        user: result.user
      };
      store.save(nextSession);
      setSession(nextSession);
      setSelectedPath("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    store.clear();
    setSession(null);
    setSelectedPath("");
    setForm((current) => ({ ...current, password: "" }));
  }

  if (!session) {
    return (
      <main className="ui-auth-page">
        <img src={sceneBackground} alt="" className="ui-scene-image" />
        <section className="ui-auth-hero">
          <span className="ui-auth-hero__sr">AIOS 管理端登录背景</span>
        </section>
        <section className="ui-auth-card">
          <form onSubmit={handleSubmit} aria-label="登录表单" className="ui-auth-form">
            <header className="ui-auth-form__header">
              <img src={brandIcon} alt="" className="ui-brand-mark" />
              <h1>欢迎回来</h1>
              <p>科技连接未来，创新改变世界</p>
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

  const currentView = renderAdminView({
    selectedPath,
    organizationApi,
    currentUserApi,
    currentRbacApi,
    currentNoticeApi,
    currentQuestionBankApi,
    currentQuestionApi,
    currentImportApi,
    currentExamApi,
    currentAnalyticsApi,
    currentHistoryApi,
    onNavigate: setSelectedPath
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
            <AdminMenuTree menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />
            <SidebarUserMenu
              displayName={session.user.display_name}
              userTypeLabel={getUserTypeLabel(session.user.user_type)}
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
          {selectedPath === "" ? (
            <AdminWorkbench
              analyticsApi={currentAnalyticsApi}
              noticeApi={currentNoticeApi}
              menus={session.menus}
              userDisplayName={session.user.display_name}
              onSelect={setSelectedPath}
            />
          ) : isKnownAdminPath(selectedPath) ? (
            currentView
          ) : (
            <EmptyState title="请选择左侧功能入口。" description="" />
          )}
        </div>
      </AppShell>
    </div>
  );
}

interface RenderAdminViewArgs {
  selectedPath: string;
  organizationApi?: OrganizationApi;
  currentUserApi?: UserPanelApi;
  currentRbacApi?: RbacPanelApi;
  currentNoticeApi?: NoticeApi;
  currentQuestionBankApi?: QuestionBankPanelApi;
  currentQuestionApi?: QuestionPanelApi;
  currentImportApi?: ImportPanelApi;
  currentExamApi?: ExamPanelApi;
  currentAnalyticsApi?: AnalyticsPanelApi;
  currentHistoryApi?: HistoryPanelApi;
  onNavigate(path: string): void;
}

function renderAdminView({
  selectedPath,
  organizationApi,
  currentUserApi,
  currentRbacApi,
  currentNoticeApi,
  currentQuestionBankApi,
  currentQuestionApi,
  currentImportApi,
  currentExamApi,
  currentAnalyticsApi,
  currentHistoryApi,
  onNavigate
}: RenderAdminViewArgs) {
  return (
    <>
      {selectedPath === "/admin/org" && organizationApi ? <SchoolManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/org/schools" && organizationApi ? <SchoolManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/org/grades" && organizationApi ? <GradeManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/org/classes" && organizationApi ? <ClassManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/courses" && organizationApi ? <CourseManagementPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/users" && currentUserApi ? <UserPanel api={currentUserApi} /> : null}
      {selectedPath === "/admin/roles" && currentRbacApi ? <RbacPanel api={currentRbacApi} /> : null}
      {selectedPath === "/admin/notices" && currentNoticeApi ? <NoticePanel api={currentNoticeApi} /> : null}
      {selectedPath === "/admin/question-banks" && currentQuestionBankApi ? (
        <QuestionBankPanel api={currentQuestionBankApi} />
      ) : null}
      {selectedPath === "/admin/questions" && currentQuestionApi ? (
        <QuestionPanel api={currentQuestionApi} onNavigate={onNavigate} />
      ) : null}
      {selectedPath === "/admin/questions/editor" && currentQuestionApi ? <QuestionEditorPanel api={currentQuestionApi} /> : null}
      {selectedPath === "/admin/imports" && currentImportApi ? <ImportPanel api={currentImportApi} /> : null}
      {selectedPath === "/admin/exams" && currentExamApi ? <ExamPanel api={currentExamApi} onNavigate={onNavigate} /> : null}
      {selectedPath === "/admin/exams/assembly" ? <PaperAssemblyPanel /> : null}
      {selectedPath === "/admin/challenges" ? <ChallengePanel /> : null}
      {selectedPath === "/admin/analytics" && currentAnalyticsApi ? <AnalyticsPanel api={currentAnalyticsApi} /> : null}
      {selectedPath === "/admin/history" && currentHistoryApi ? <HistoryPanel api={currentHistoryApi} /> : null}
    </>
  );
}

function isKnownAdminPath(selectedPath: string): boolean {
  return [
    "/admin/org",
    "/admin/org/schools",
    "/admin/org/grades",
    "/admin/org/classes",
    "/admin/courses",
    "/admin/users",
    "/admin/roles",
    "/admin/notices",
    "/admin/question-banks",
    "/admin/questions",
    "/admin/questions/editor",
    "/admin/imports",
    "/admin/exams",
    "/admin/exams/assembly",
    "/admin/challenges",
    "/admin/analytics",
    "/admin/history"
  ].includes(selectedPath);
}

function getUserTypeLabel(userType: LoginResponse["user"]["user_type"]): string {
  switch (userType) {
    case "sys_admin":
      return "平台管理员";
    case "school_admin":
      return "学校管理员";
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    default:
      return userType;
  }
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
    menus: normalizeAdminMenus(session.menus, session.user.permissions ?? [])
  };
}

function normalizeAdminMenus(menus: MenuItem[], permissions: string[] = []): MenuItem[] {
  return normalizeAdminNavigationMenus(menus, permissions);
}
