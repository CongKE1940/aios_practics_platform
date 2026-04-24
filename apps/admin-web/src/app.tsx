import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createApiClient,
  type LoginOrganization,
  type LoginRequest,
  type LoginResponse,
  type MenuItem
} from "@aios/api-sdk";
import { AppShell, EmptyState, PageSection, PermissionButton, StatusNotice } from "@aios/ui-web";

import { AnalyticsPanel, type AnalyticsPanelApi } from "./analytics-panel";
import { HistoryPanel, type HistoryPanelApi } from "./history-panel";
import { ImportPanel, type ImportPanelApi } from "./import-panel";
import { NoticePanel, type NoticeApi } from "./notice-panel";
import { OrganizationPanel, type OrganizationApi } from "./organization-panel";
import { QuestionBankPanel, type QuestionBankPanelApi } from "./question-bank-panel";
import { QuestionPanel, type QuestionPanelApi } from "./question-panel";
import { RbacPanel, type RbacPanelApi } from "./rbac-panel";
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
  userApi,
  rbacApi,
  analyticsApi,
  historyApi,
  sessionStore
}: AdminAppProps) {
  const [form, setForm] = useState<LoginRequest>(defaultForm);
  const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
  const [session, setSession] = useState<SessionState | null>(() => store.load());
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");

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
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [noticeApi, session]);

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

  const currentAnalyticsApi = useMemo<AnalyticsPanelApi | undefined>(() => {
    if (analyticsApi) {
      return analyticsApi;
    }
    if (!session) {
      return undefined;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl, accessToken: session.accessToken });
  }, [analyticsApi, session]);

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
      const menus = await api.menus(result.access_token);
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
        <section className="ui-auth-hero">
          <p className="ui-auth-eyebrow">AIOS Practice Platform</p>
          <h1>AIOS 管理端</h1>
          <p>统一管理组织、题库、权限、导入与平台数据。</p>
        </section>
        <section className="ui-auth-card">
          <form onSubmit={handleSubmit} aria-label="登录表单" className="ui-auth-form">
            <header className="ui-auth-form__header">
              <p className="ui-auth-eyebrow">平台管理入口</p>
              <h2>登录后台工作台</h2>
              <p>选择组织后进入管理端，继续处理组织、题库与平台运营。</p>
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
    currentAnalyticsApi,
    currentHistoryApi
  });

  return (
    <AppShell
      brand={
        <div className="ui-brand-block">
          <strong>AIOS 管理端</strong>
          <span>现代教育工作台</span>
        </div>
      }
      sidebar={
        <nav aria-label="管理菜单" className="ui-nav-tree">
          <div className="ui-nav-tree__title">
            <strong>管理导航</strong>
            <span>进入组织、题库、权限与平台数据模块</span>
          </div>
          <ul>
            {session.menus.map((menu) => (
              <AdminMenuNode key={menu.id} menu={menu} selectedPath={selectedPath} onSelect={setSelectedPath} />
            ))}
          </ul>
        </nav>
      }
      header={
        <section className="ui-user-chip" aria-label="当前用户">
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
      <div className="ui-stack ui-stack--lg">
        <PageSection title="基础平台能力" description="当前以统一后台壳承载现有业务模块。">
          <PermissionButton
            className="ui-button ui-button--primary"
            permissions={session.user.permissions ?? []}
            requiredPermissions={["notice:manage"]}
          >
            新增公告
          </PermissionButton>
        </PageSection>
        <PageSection
          title={selectedPath ? "模块工作区" : "当前视图"}
          description="从左侧选择功能后在这里展开。"
          actions={
            selectedPath ? (
              <span className="ui-status-chip ui-status-chip--info">当前模块：{resolveAdminPageTitle(selectedPath)}</span>
            ) : null
          }
        >
          {isKnownAdminPath(selectedPath) ? (
            currentView
          ) : (
            <EmptyState title="请选择左侧功能入口。" description="已登录后可在左侧继续进入具体模块。" />
          )}
        </PageSection>
      </div>
    </AppShell>
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
  currentAnalyticsApi?: AnalyticsPanelApi;
  currentHistoryApi?: HistoryPanelApi;
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
  currentAnalyticsApi,
  currentHistoryApi
}: RenderAdminViewArgs) {
  return (
    <>
      {selectedPath === "/admin/org" && organizationApi ? <OrganizationPanel api={organizationApi} /> : null}
      {selectedPath === "/admin/users" && currentUserApi ? <UserPanel api={currentUserApi} /> : null}
      {selectedPath === "/admin/roles" && currentRbacApi ? <RbacPanel api={currentRbacApi} /> : null}
      {selectedPath === "/admin/notices" && currentNoticeApi ? <NoticePanel api={currentNoticeApi} /> : null}
      {selectedPath === "/admin/question-banks" && currentQuestionBankApi ? (
        <QuestionBankPanel api={currentQuestionBankApi} />
      ) : null}
      {selectedPath === "/admin/questions" && currentQuestionApi ? <QuestionPanel api={currentQuestionApi} /> : null}
      {selectedPath === "/admin/imports" && currentImportApi ? <ImportPanel api={currentImportApi} /> : null}
      {selectedPath === "/admin/analytics" && currentAnalyticsApi ? <AnalyticsPanel api={currentAnalyticsApi} /> : null}
      {selectedPath === "/admin/history" && currentHistoryApi ? <HistoryPanel api={currentHistoryApi} /> : null}
    </>
  );
}

interface AdminMenuNodeProps {
  menu: MenuItem;
  selectedPath: string;
  onSelect(path: string): void;
}

function AdminMenuNode({ menu, selectedPath, onSelect }: AdminMenuNodeProps) {
  const nextPath = getFirstMenuPath(menu);
  const hasChildren = menu.children.length > 0;
  const isSelected = nextPath !== "" && selectedPath === nextPath;

  return (
    <li>
      {nextPath ? (
        <button
          type="button"
          className={["ui-nav-tree__item", isSelected ? "is-active" : ""].filter(Boolean).join(" ")}
          aria-pressed={isSelected}
          onClick={() => onSelect(nextPath)}
        >
          {menu.name}
        </button>
      ) : (
        <span className="ui-nav-tree__group">{menu.name}</span>
      )}
      {hasChildren ? (
        <ul>
          {menu.children.map((child) => (
            <AdminMenuNode key={child.id} menu={child} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function getFirstMenuPath(menu: MenuItem): string {
  if (menu.children.length > 0) {
    for (const child of menu.children) {
      const childPath = getFirstMenuPath(child);
      if (childPath) {
        return childPath;
      }
    }
  }

  return typeof menu.path === "string" ? menu.path : "";
}

function resolveAdminPageTitle(selectedPath: string): string {
  switch (selectedPath) {
    case "/admin/org":
      return "组织管理";
    case "/admin/users":
      return "用户管理";
    case "/admin/roles":
      return "角色权限";
    case "/admin/notices":
      return "公告通知";
    case "/admin/question-banks":
      return "题库管理";
    case "/admin/questions":
      return "题目管理";
    case "/admin/imports":
      return "导入中心";
    case "/admin/analytics":
      return "数据看板";
    case "/admin/history":
      return "快照历史";
    default:
      return "当前视图";
  }
}

function isKnownAdminPath(selectedPath: string): boolean {
  return [
    "/admin/org",
    "/admin/users",
    "/admin/roles",
    "/admin/notices",
    "/admin/question-banks",
    "/admin/questions",
    "/admin/imports",
    "/admin/analytics",
    "/admin/history"
  ].includes(selectedPath);
}

function getUserTypeLabel(userType: LoginResponse["user"]["user_type"]): string {
  switch (userType) {
    case "sys_admin":
      return "系统管理员";
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
        return JSON.parse(raw) as SessionState;
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
