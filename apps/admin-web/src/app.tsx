import { useMemo, useState, type FormEvent } from "react";

import { createApiClient, type LoginRequest, type LoginResponse, type MenuItem } from "@aios/api-sdk";
import { PermissionButton } from "@aios/ui-web";

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
  tenant_code: "platform",
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

  const api = useMemo<AuthApi>(() => {
    if (authApi) {
      return authApi;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    const anonymous = createApiClient({ baseUrl });

    return {
      login: (body) => anonymous.login(body),
      logout: async () => true,
      menus: (accessToken) => createApiClient({ baseUrl, accessToken }).menus("admin")
    };
  }, [authApi]);

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
      <main>
        <h1>AIOS 管理端</h1>
        <form onSubmit={handleSubmit} aria-label="登录表单">
          <div>
            <label htmlFor="tenant_code">租户编码</label>
            <input
              id="tenant_code"
              name="tenant_code"
              value={form.tenant_code}
              onChange={(event) => setForm((current) => ({ ...current, tenant_code: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              name="username"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="password">密码</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>
          {errorMessage ? <p>{errorMessage}</p> : null}
          <button type="submit" disabled={submitting}>
            登录
          </button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>AIOS 管理端</h1>
      <section aria-label="当前用户">
        <h2>{session.user.display_name}</h2>
        <p>{session.user.user_type}</p>
        <button type="button" onClick={handleLogout}>
          退出登录
        </button>
      </section>
      <section aria-label="阶段 1">
        <h2>基础平台能力</h2>
        <PermissionButton
          permissions={session.user.permissions ?? []}
          requiredPermissions={["notice:manage"]}
        >
          新增公告
        </PermissionButton>
      </section>
      <nav aria-label="管理菜单">
        <ul>
          {session.menus.map((menu) => (
            <li key={menu.id}>
              <span>{menu.name}</span>
              {menu.children.length > 0 ? (
                <ul>
                  {menu.children.map((child) => (
                    <li key={child.id}>
                      <button type="button" onClick={() => setSelectedPath(child.path)}>
                        {child.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </nav>
      <section aria-label="当前视图">
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
        {selectedPath !== "/admin/org" &&
        selectedPath !== "/admin/users" &&
        selectedPath !== "/admin/roles" &&
        selectedPath !== "/admin/notices" &&
        selectedPath !== "/admin/question-banks" &&
        selectedPath !== "/admin/questions" &&
        selectedPath !== "/admin/imports" &&
        selectedPath !== "/admin/analytics" &&
        selectedPath !== "/admin/history" ? (
          <p>请选择左侧功能入口。</p>
        ) : null}
      </section>
    </main>
  );
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
