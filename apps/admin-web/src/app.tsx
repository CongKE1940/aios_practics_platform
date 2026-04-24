import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createApiClient,
  type LoginOrganization,
  type LoginRequest,
  type LoginResponse,
  type MenuItem
} from "@aios/api-sdk";
import { AppShell, EmptyState, StatusNotice } from "@aios/ui-web";

import sceneBackground from "../../../docs/images/背景.png";
import brandIcon from "../../../docs/images/图标.png";

import { AdminWorkbench } from "./admin-workbench";
import { AnalyticsPanel, type AnalyticsPanelApi } from "./analytics-panel";
import { ChallengePanel } from "./challenge-panel";
import { ExamPanel, type ExamPanelApi } from "./exam-panel";
import { HistoryPanel, type HistoryPanelApi } from "./history-panel";
import { ImportPanel, type ImportPanelApi } from "./import-panel";
import { NoticePanel, type NoticeApi } from "./notice-panel";
import { OrganizationPanel, type OrganizationApi } from "./organization-panel";
import { PaperAssemblyPanel } from "./paper-assembly-panel";
import { QuestionBankPanel, type QuestionBankPanelApi } from "./question-bank-panel";
import { QuestionEditorPanel } from "./question-editor-panel";
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

  return (
    <div className="ui-app-frame">
      <img src={sceneBackground} alt="" className="ui-scene-image ui-scene-image--shell" />
      <AppShell
        brand={
          <div className="ui-brand-block">
            <div className="ui-brand-block__row">
              <img src={brandIcon} alt="" className="ui-brand-block__icon" />
              <strong>智慧教育平台</strong>
            </div>
          </div>
        }
        sidebar={
          <nav aria-label="管理菜单" className="ui-nav-tree">
            <div className="ui-nav-tree__title">
              <strong>管理导航</strong>
            </div>
            <ul>
              <li>
                <button
                  type="button"
                  className={["ui-nav-tree__item", selectedPath === "" ? "is-active" : ""].filter(Boolean).join(" ")}
                  aria-pressed={selectedPath === ""}
                  onClick={() => setSelectedPath("")}
                >
                  工作台
                </button>
              </li>
              {session.menus.map((menu) => (
                <AdminMenuNode key={menu.id} menu={menu} selectedPath={selectedPath} onSelect={setSelectedPath} />
              ))}
            </ul>
          </nav>
        }
        header={
          <div className="ui-topbar">
            <div className="ui-topbar__title">
              <span className="ui-topbar__menu" aria-hidden="true">
                ≡
              </span>
              <strong>{selectedPath === "" ? "工作台" : resolveAdminPageTitle(selectedPath)}</strong>
            </div>
            <section className="ui-user-chip" aria-label="当前用户">
              <div className="ui-user-chip__avatar" aria-hidden="true">
                {session.user.display_name.slice(0, 1)}
              </div>
              <div>
                <p>{session.user.display_name}</p>
                <strong>{getUserTypeLabel(session.user.user_type)}</strong>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleLogout}>
                退出登录
              </button>
            </section>
          </div>
        }
      >
        {selectedPath === "" ? (
          <AdminWorkbench
            analyticsApi={currentAnalyticsApi}
            noticeApi={currentNoticeApi}
            menus={session.menus}
            userDisplayName={session.user.display_name}
            onSelect={setSelectedPath}
          />
        ) : (
          <div className="ui-admin-route">
            <div className="ui-admin-route__crumb">{resolveAdminBreadcrumb(selectedPath, session.menus)}</div>
            {isKnownAdminPath(selectedPath) ? (
              currentView
            ) : (
              <EmptyState title="请选择左侧功能入口。" description="" />
            )}
          </div>
        )}
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
      {selectedPath === "/admin/org" && organizationApi ? <OrganizationPanel api={organizationApi} view="schools" /> : null}
      {selectedPath === "/admin/org/schools" && organizationApi ? (
        <OrganizationPanel api={organizationApi} view="schools" />
      ) : null}
      {selectedPath === "/admin/org/grades" && organizationApi ? (
        <OrganizationPanel api={organizationApi} view="grades" />
      ) : null}
      {selectedPath === "/admin/org/classes" && organizationApi ? (
        <OrganizationPanel api={organizationApi} view="classes" />
      ) : null}
      {selectedPath === "/admin/courses" && organizationApi ? (
        <OrganizationPanel api={organizationApi} view="courses" />
      ) : null}
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

interface AdminMenuNodeProps {
  menu: MenuItem;
  selectedPath: string;
  onSelect(path: string): void;
  depth?: number;
}

function AdminMenuNode({ menu, selectedPath, onSelect, depth = 0 }: AdminMenuNodeProps) {
  const nextPath = getFirstMenuPath(menu);
  const hasChildren = menu.children.length > 0;
  const isExactSelected = Boolean(menu.path) && selectedPath === menu.path;
  const isTrailActive = hasChildren && menuContainsPath(menu, selectedPath);

  return (
    <li>
      {nextPath ? (
        <button
          type="button"
          className={[
            hasChildren ? "ui-nav-tree__group-trigger" : "ui-nav-tree__item",
            isExactSelected ? "is-active" : "",
            isTrailActive ? "is-open" : "",
            depth > 0 ? "is-child" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={isExactSelected}
          aria-expanded={hasChildren ? isTrailActive : undefined}
          onClick={() => onSelect(nextPath)}
        >
          <span>{menu.name}</span>
          {hasChildren ? (
            <span aria-hidden="true" className="ui-nav-tree__caret">
              {isTrailActive ? "⌄" : "›"}
            </span>
          ) : null}
        </button>
      ) : (
        <span className="ui-nav-tree__group">{menu.name}</span>
      )}
      {hasChildren ? (
        <ul>
          {menu.children.map((child) => (
            <AdminMenuNode
              key={child.id}
              menu={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
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

function menuContainsPath(menu: MenuItem, targetPath: string): boolean {
  if (menu.path === targetPath) {
    return true;
  }

  return menu.children.some((child) => menuContainsPath(child, targetPath));
}

function resolveAdminPageTitle(selectedPath: string): string {
  switch (selectedPath) {
    case "/admin/org":
      return "学校与组织管理";
    case "/admin/org/schools":
      return "学校与组织管理";
    case "/admin/org/grades":
      return "年级管理";
    case "/admin/org/classes":
      return "班级管理";
    case "/admin/courses":
      return "课程管理";
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
    case "/admin/questions/editor":
      return "题目编辑器";
    case "/admin/imports":
      return "导入中心";
    case "/admin/exams":
      return "考试管理";
    case "/admin/exams/assembly":
      return "随机组卷";
    case "/admin/challenges":
      return "质疑处理";
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

function resolveAdminBreadcrumb(selectedPath: string, menus: MenuItem[]): string {
  const labels = findMenuTrail(menus, selectedPath);
  if (labels.length === 0) {
    return resolveAdminPageTitle(selectedPath);
  }
  return labels.join(" / ");
}

function findMenuTrail(menus: MenuItem[], selectedPath: string, trail: string[] = []): string[] {
  for (const menu of menus) {
    const nextTrail = [...trail, menu.name];
    if (menu.path === selectedPath) {
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
  const hasOrganizationRoot = menus.some((menu) => menu.path === "/admin/org" || menu.children.some((child) => child.path === "/admin/org/schools"));
  const hasCoursesRoot = menus.some((menu) => menu.path === "/admin/courses");
  const hasExamEntry = menus.some((menu) => menu.path === "/admin/exams" || menu.children.some((child) => child.path === "/admin/exams"));
  const hasAssemblyEntry = menus.some((menu) =>
    menu.path === "/admin/exams/assembly" || menu.children.some((child) => child.path === "/admin/exams/assembly")
  );
  const hasChallengeEntry = menus.some((menu) =>
    menu.path === "/admin/challenges" || menu.children.some((child) => child.path === "/admin/challenges")
  );

  if (hasOrganizationRoot && hasCoursesRoot && hasExamEntry && hasAssemblyEntry && hasChallengeEntry) {
    return menus;
  }

  const normalized: MenuItem[] = [];

  for (const menu of menus) {
    if (menu.name !== "系统管理") {
      normalized.push(menu);
      continue;
    }

    const orgChild = menu.children.find((child) => child.path === "/admin/org" || child.name === "组织管理");
    const otherChildren = menu.children.filter((child) => child !== orgChild);

    if (orgChild && !hasOrganizationRoot) {
      normalized.push({
        id: orgChild.id,
        name: "组织管理",
        path: "/admin/org",
        children: [
          { id: orgChild.id * 10 + 1, name: "学校与组织管理", path: "/admin/org/schools", children: [] },
          { id: orgChild.id * 10 + 2, name: "年级管理", path: "/admin/org/grades", children: [] },
          { id: orgChild.id * 10 + 3, name: "班级管理", path: "/admin/org/classes", children: [] }
        ]
      });
    }

    if (orgChild && !hasCoursesRoot) {
      normalized.push({
        id: orgChild.id * 100 + 1,
        name: "课程管理",
        path: "/admin/courses",
        children: []
      });
    }

    const nextChildren = [...otherChildren];
    if (!hasExamEntry && permissions.includes("exam:manage")) {
      nextChildren.push({ id: 39, name: "考试管理", path: "/admin/exams", children: [] });
    }
    if (!hasAssemblyEntry && permissions.includes("exam:manage")) {
      nextChildren.push({ id: 40, name: "随机组卷", path: "/admin/exams/assembly", children: [] });
    }
    if (!hasChallengeEntry && permissions.includes("question:manage")) {
      nextChildren.push({ id: 41, name: "质疑处理", path: "/admin/challenges", children: [] });
    }

    normalized.push({
      ...menu,
      path: "/admin/system",
      children: nextChildren
    });
  }

  return normalized;
}
