import { useMemo, useState } from "react";

import { createApiClient, type LoginRequest, type MenuItem, type PracticeSessionDetail } from "@aios/api-sdk";

import { createBrowserSessionStore } from "./auth-store";
import type { UserAuthApi, UserSessionState, UserSessionStore } from "./auth-types";
import { MenuNav } from "./menu-nav";
import { LoginPage } from "./login-page";
import { ClassLearningPage, type ClassLearningApi } from "./class-learning-page";
import { StudentLearningDetailPage, type StudentLearningDetailApi } from "./student-learning-detail-page";
import { PracticePanel, type PracticePanelApi } from "./practice-panel";
import {
  PracticeHistoryPage,
  PracticeResultPage,
  PracticeSessionDetailPage,
  PracticeStateListPage,
  type PracticeReviewApi
} from "./practice-review-pages";

interface UserAppProps {
  authApi?: UserAuthApi;
  practiceApi?: PracticePanelApi & PracticeReviewApi & Partial<ClassLearningApi> & Partial<StudentLearningDetailApi>;
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
  const selectedRoute = getRoutePath(selectedPath);

  function handleUnauthorized() {
    store.clear();
    setSession(null);
    setSelectedPath("/app/courses");
    setPendingPracticeSession(null);
    setSubmitting(false);
    setErrorMessage("登录已失效，请重新登录");
  }

  const currentPracticeApi = useMemo<
    (PracticePanelApi & PracticeReviewApi & Partial<ClassLearningApi> & Partial<StudentLearningDetailApi>) | undefined
  >(() => {
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
      login: (body) => anonymous.login(body),
      logout: (accessToken) => createApiClient({ baseUrl, accessToken }).logout(),
      menus: (accessToken) => createApiClient({ baseUrl, accessToken, onUnauthorized: handleUnauthorized }).menus("user")
    };
  }, [authApi, store]);

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
      setSelectedPath("/app/courses");
      setPendingPracticeSession(null);
    }
  }

  if (!session) {
    return (
      <main>
        <h1>AIOS 学生端</h1>
        <LoginPage submitting={submitting} errorMessage={errorMessage} onSubmit={handleLogin} />
      </main>
    );
  }

  return (
    <main>
      <h1>AIOS 学生端</h1>
      <section aria-label="当前用户">
        <h2>{session.user.display_name}</h2>
        <p>{session.user.user_type}</p>
        <button type="button" onClick={handleLogout}>
          退出登录
        </button>
      </section>
      <MenuNav menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />
      <section aria-label="学习入口">
        {session.menus.length === 0 ? (
          <p>当前账号暂无可用功能</p>
        ) : (
          <>
            {selectedRoute === "/app/courses" ? <h2>我的课程</h2> : null}
            {selectedRoute.startsWith("/app/class-learning/student") ? (
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
            {selectedRoute === "/app/practice" && currentPracticeApi ? (
              <PracticePanel
                api={currentPracticeApi}
                initialSession={pendingPracticeSession}
                onInitialSessionConsumed={() => setPendingPracticeSession(null)}
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
        )}
      </section>
    </main>
  );
}

function getSessionId(path: string): number {
  const value = Number(path.split("/").pop());
  return Number.isFinite(value) ? value : 0;
}

function getRoutePath(path: string): string {
  return path.split("?")[0];
}

function isClassLearningApi(
  api:
    | (PracticePanelApi & PracticeReviewApi & Partial<ClassLearningApi> & Partial<StudentLearningDetailApi>)
    | undefined
): api is PracticePanelApi & PracticeReviewApi & ClassLearningApi & Partial<StudentLearningDetailApi> {
  return typeof api?.listClassCourseOptions === "function" && typeof api?.getClassPracticeSummary === "function";
}

function isStudentLearningDetailApi(
  api:
    | (PracticePanelApi & PracticeReviewApi & Partial<ClassLearningApi> & Partial<StudentLearningDetailApi>)
    | undefined
): api is PracticePanelApi & PracticeReviewApi & Partial<ClassLearningApi> & StudentLearningDetailApi {
  return typeof api?.getStudentPracticeDetail === "function";
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

  return "/app/courses";
}
