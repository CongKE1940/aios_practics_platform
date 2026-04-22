# 用户端最小登录闭环与动态菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `apps/user-web` 补齐最小登录闭环、动态菜单渲染、本地会话恢复与 `401` 登录失效回退，让学生端和老师端入口可以在真实后端下正常使用。

**Architecture:** 复用现有 `packages/api-sdk` 的 `login / logout / menus` 能力，在 `apps/user-web` 内新增轻量认证状态层和会话存储，把匿名应用壳改为“登录页 + 已登录壳层”两段式结构。业务页面继续沿用当前路径字符串驱动方式，但所有业务 client 均由带 token 的会话创建，并通过统一的 `401` 回退函数清空会话并返回登录页。

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, localStorage, existing `@aios/api-sdk`.

---

## 文件清单

- 新增：`apps/user-web/src/auth-types.ts`，定义用户端 session、auth action 结果和回退回调类型。
- 新增：`apps/user-web/src/auth-store.ts`，封装用户端浏览器会话存储、加载、保存与清理逻辑。
- 新增：`apps/user-web/src/login-page.tsx`，渲染 `tenant_code / username / password` 登录表单和错误提示。
- 新增：`apps/user-web/src/menu-nav.tsx`，根据 `menus?app_type=user` 结果渲染动态菜单。
- 修改：`apps/user-web/src/app.tsx`，将匿名壳层改为认证驱动壳层，接入登录、动态菜单、退出登录和 `401` 回退。
- 修改：`apps/user-web/src/app.test.tsx`，用 TDD 覆盖登录页、菜单、会话恢复、退出登录与 `401` 回退。
- 修改：`packages/api-sdk/src/client.ts`，追加向后兼容的 `onUnauthorized` 选项，用于统一 `401` 处理。
- 修改：`packages/api-sdk/src/client.test.ts`，补齐 `onUnauthorized` 行为测试。
- 修改：`docs/docs/26_stage2f_implementation_status.md`，记录用户端登录闭环补齐状态。

## 共享命名

用户端会话类型：

```ts
import type { CurrentUser, LoginRequest, LoginResponse, MenuItem } from "@aios/api-sdk";

export interface UserSessionState {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  menus: MenuItem[];
  user: CurrentUser;
}

export interface UserSessionStore {
  load(): UserSessionState | null;
  save(session: UserSessionState): void;
  clear(): void;
}

export interface UserAuthApi {
  login(body: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<boolean>;
  menus(accessToken: string): Promise<MenuItem[]>;
}
```

默认本地存储 key：

```ts
const USER_SESSION_STORAGE_KEY = "aios.user.session";
```

`401` 回退钩子命名：

```ts
type UnauthorizedHandler = () => void;
```

## 任务 1： 认证状态层与登录页红绿测试

**Files:**
- Create: `apps/user-web/src/auth-types.ts`
- Create: `apps/user-web/src/auth-store.ts`
- Create: `apps/user-web/src/login-page.tsx`
- Test: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Write the failing test**

先在 `apps/user-web/src/app.test.tsx` 顶部引入 `vi` 和 `beforeEach`，并新增以下测试：

```ts
it("shows login form when no session exists", () => {
  window.localStorage.clear();

  render(<UserApp />);

  expect(screen.getByRole("heading", { name: "AIOS 学生端" })).toBeTruthy();
  expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
  expect(screen.getByLabelText("租户编码")).toBeTruthy();
  expect(screen.getByLabelText("用户名")).toBeTruthy();
  expect(screen.getByLabelText("密码")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "练题中心" })).toBeNull();
});

it("logs in and stores user session", async () => {
  render(
    <UserApp
      authApi={{
        login: async () => ({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 7200,
          user: {
            id: 7,
            tenant_id: 1,
            display_name: "张老师",
            user_type: "teacher",
            roles: ["teacher"],
            permissions: ["practice:use", "analytics:view"]
          }
        }),
        logout: async () => true,
        menus: async () => [
          {
            id: 2,
            name: "学习中心",
            path: "/app",
            children: [
              { id: 22, name: "练题中心", path: "/app/practice", children: [] },
              { id: 27, name: "班级学习", path: "/app/class-learning", children: [] }
            ]
          }
        ]
      }}
      practiceApi={createPracticeApiMock()}
    />
  );

  fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "school-a" } });
  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "teacher01" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => {
    expect(screen.getByText("张老师")).toBeTruthy();
    expect(screen.getByRole("button", { name: "练题中心" })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("aios.user.session") ?? "{}").accessToken).toBe("access-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm test -- apps/user-web/src/app.test.tsx
```

Expected: FAIL，提示 `UserApp` 不存在 `authApi` / 登录表单 / 会话存储相关实现。

- [ ] **Step 3: Write minimal implementation**

新增 `apps/user-web/src/auth-types.ts`：

```ts
import type { CurrentUser, LoginRequest, LoginResponse, MenuItem } from "@aios/api-sdk";

export interface UserSessionState {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  menus: MenuItem[];
  user: CurrentUser;
}

export interface UserSessionStore {
  load(): UserSessionState | null;
  save(session: UserSessionState): void;
  clear(): void;
}

export interface UserAuthApi {
  login(body: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<boolean>;
  menus(accessToken: string): Promise<MenuItem[]>;
}
```

新增 `apps/user-web/src/auth-store.ts`：

```ts
import type { UserSessionState, UserSessionStore } from "./auth-types";

const storageKey = "aios.user.session";

export function createBrowserSessionStore(): UserSessionStore {
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
        return JSON.parse(raw) as UserSessionState;
      } catch {
        window.localStorage.removeItem(storageKey);
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
```

新增 `apps/user-web/src/login-page.tsx`：

```tsx
import { useState, type FormEvent } from "react";
import type { LoginRequest } from "@aios/api-sdk";

interface LoginPageProps {
  submitting: boolean;
  errorMessage: string;
  onSubmit(values: LoginRequest): Promise<void>;
}

const defaultForm: LoginRequest = {
  tenant_code: "",
  username: "",
  password: ""
};

export function LoginPage({ submitting, errorMessage, onSubmit }: LoginPageProps) {
  const [form, setForm] = useState<LoginRequest>(defaultForm);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(form);
    setForm((current) => ({ ...current, password: "" }));
  }

  return (
    <form aria-label="登录表单" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="tenant_code">租户编码</label>
        <input
          id="tenant_code"
          value={form.tenant_code}
          onChange={(event) => setForm((current) => ({ ...current, tenant_code: event.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="username">用户名</label>
        <input
          id="username"
          value={form.username}
          onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
        />
      </div>
      {errorMessage ? <p>{errorMessage}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? "登录中..." : "登录"}
      </button>
    </form>
  );
}
```

在 `apps/user-web/src/app.tsx` 中先加最小认证入口：

```tsx
interface UserAppProps {
  authApi?: UserAuthApi;
  practiceApi?: PracticePanelApi & PracticeReviewApi & Partial<ClassLearningApi>;
  sessionStore?: UserSessionStore;
}

const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
const [session, setSession] = useState<UserSessionState | null>(() => store.load());
const [submitting, setSubmitting] = useState(false);
const [errorMessage, setErrorMessage] = useState("");
```

并补登录提交逻辑：

```tsx
async function handleLogin(form: LoginRequest) {
  setSubmitting(true);
  setErrorMessage("");
  try {
    const result = await auth.login(form);
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
    setErrorMessage(error instanceof Error ? error.message : "登录失败");
  } finally {
    setSubmitting(false);
  }
}
```

未登录时直接返回：

```tsx
if (!session) {
  return (
    <main>
      <h1>AIOS 学生端</h1>
      <LoginPage submitting={submitting} errorMessage={errorMessage} onSubmit={handleLogin} />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm test -- apps/user-web/src/app.test.tsx
```

Expected: PASS，至少上述两个新测试通过。

- [ ] **Step 5: Commit**

```powershell
git add apps/user-web/src/auth-types.ts apps/user-web/src/auth-store.ts apps/user-web/src/login-page.tsx apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：补齐用户端登录会话骨架"
```

## 任务 2： 动态菜单壳层与退出登录

**Files:**
- Create: `apps/user-web/src/menu-nav.tsx`
- Modify: `apps/user-web/src/app.tsx`
- Test: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Write the failing test**

向 `apps/user-web/src/app.test.tsx` 添加以下测试：

```ts
it("renders user menus from server response", async () => {
  window.localStorage.setItem(
    "aios.user.session",
    JSON.stringify({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresIn: 7200,
      user: {
        id: 7,
        tenant_id: 1,
        display_name: "李同学",
        user_type: "student",
        roles: ["student"],
        permissions: ["practice:use"]
      },
      menus: [
        {
          id: 2,
          name: "学习中心",
          path: "/app",
          children: [
            { id: 21, name: "我的课程", path: "/app/courses", children: [] },
            { id: 22, name: "练题中心", path: "/app/practice", children: [] }
          ]
        }
      ]
    })
  );

  render(<UserApp practiceApi={createPracticeApiMock()} />);

  expect(screen.getByText("李同学")).toBeTruthy();
  expect(screen.getByRole("button", { name: "我的课程" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "练题中心" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "班级学习" })).toBeNull();
});

it("clears session and returns to login page after logout", async () => {
  window.localStorage.setItem(
    "aios.user.session",
    JSON.stringify({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresIn: 7200,
      user: {
        id: 7,
        tenant_id: 1,
        display_name: "李同学",
        user_type: "student",
        roles: ["student"],
        permissions: ["practice:use"]
      },
      menus: [
        {
          id: 2,
          name: "学习中心",
          path: "/app",
          children: [{ id: 21, name: "我的课程", path: "/app/courses", children: [] }]
        }
      ]
    })
  );

  render(
    <UserApp
      authApi={{
        login: async () => {
          throw new Error("should not login");
        },
        logout: async () => true,
        menus: async () => []
      }}
      practiceApi={createPracticeApiMock()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

  await waitFor(() => {
    expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
    expect(window.localStorage.getItem("aios.user.session")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm test -- apps/user-web/src/app.test.tsx
```

Expected: FAIL，当前尚未按菜单树渲染导航，也没有退出登录行为。

- [ ] **Step 3: Write minimal implementation**

新增 `apps/user-web/src/menu-nav.tsx`：

```tsx
import type { MenuItem } from "@aios/api-sdk";

interface MenuNavProps {
  menus: MenuItem[];
  selectedPath: string;
  onSelect(path: string): void;
}

export function MenuNav({ menus, selectedPath, onSelect }: MenuNavProps) {
  if (menus.length === 0) {
    return <p>当前账号暂无可用功能</p>;
  }

  return (
    <nav aria-label="学习菜单">
      <ul>
        {menus.map((menu) => (
          <li key={menu.id}>
            <span>{menu.name}</span>
            {menu.children.length > 0 ? (
              <ul>
                {menu.children.map((child) => (
                  <li key={child.id}>
                    <button type="button" aria-pressed={selectedPath === child.path} onClick={() => onSelect(child.path)}>
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
  );
}
```

在 `apps/user-web/src/app.tsx` 中加入顶部用户区与登出：

```tsx
async function handleLogout() {
  try {
    await auth.logout();
  } finally {
    store.clear();
    setSession(null);
    setSelectedPath("/app/courses");
    setPendingPracticeSession(null);
  }
}
```

并将硬编码按钮替换为：

```tsx
<section aria-label="当前用户">
  <h2>{session.user.display_name}</h2>
  <p>{session.user.user_type}</p>
  <button type="button" onClick={handleLogout}>
    退出登录
  </button>
</section>
<MenuNav menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />
```

默认路径函数：

```ts
function getFirstAvailablePath(menus: MenuItem[]): string {
  for (const menu of menus) {
    if (menu.children.length > 0) {
      return menu.children[0].Path ?? menu.children[0].path;
    }
  }
  return "/app/courses";
}
```

实现时使用 SDK 的 TS 类型字段名 `path`，不要写成大写 `Path`：

```ts
function getFirstAvailablePath(menus: MenuItem[]): string {
  for (const menu of menus) {
    if (menu.children.length > 0) {
      return menu.children[0].path;
    }
  }
  return "/app/courses";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm test -- apps/user-web/src/app.test.tsx
```

Expected: PASS，动态菜单与退出登录测试通过。

- [ ] **Step 5: Commit**

```powershell
git add apps/user-web/src/menu-nav.tsx apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：改造用户端动态菜单壳层"
```

## 任务 3： 统一 `401` 登录失效回退

**Files:**
- Modify: `packages/api-sdk/src/client.ts`
- Modify: `packages/api-sdk/src/client.test.ts`
- Modify: `apps/user-web/src/app.tsx`
- Test: `apps/user-web/src/app.test.tsx`

- [ ] **Step 1: Write the failing tests**

在 `packages/api-sdk/src/client.test.ts` 中新增：

```ts
it("calls onUnauthorized when response status is 401", async () => {
  const onUnauthorized = vi.fn();
  const client = createApiClient({
    baseUrl: "http://127.0.0.1:18081/api/v1",
    accessToken: "access-1",
    onUnauthorized,
    fetch: async () =>
      new Response(JSON.stringify({ code: 40101, message: "令牌无效" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
  });

  await expect(client.me()).rejects.toThrow("令牌无效");
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});
```

在 `apps/user-web/src/app.test.tsx` 中新增：

```ts
it("returns to login page when a protected api call responds 401", async () => {
  window.localStorage.setItem(
    "aios.user.session",
    JSON.stringify({
      accessToken: "expired-token",
      refreshToken: "refresh-1",
      expiresIn: 7200,
      user: {
        id: 7,
        tenant_id: 1,
        display_name: "张老师",
        user_type: "teacher",
        roles: ["teacher"],
        permissions: ["practice:use", "analytics:view"]
      },
      menus: [
        {
          id: 2,
          name: "学习中心",
          path: "/app",
          children: [{ id: 27, name: "班级学习", path: "/app/class-learning", children: [] }]
        }
      ]
    })
  );

  render(
    <UserApp
      practiceApi={{
        ...createPracticeApiMock(),
        listClassCourseOptions: async () => {
          const error = new Error("令牌无效") as Error & { status?: number };
          error.status = 401;
          throw error;
        }
      }}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "班级学习" }));

  await waitFor(() => {
    expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
    expect(screen.getByText("登录已失效，请重新登录")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/app.test.tsx
```

Expected: FAIL，SDK 还没有 `onUnauthorized` 钩子，用户端也没有统一 `401` 回退。

- [ ] **Step 3: Write minimal implementation**

为 `packages/api-sdk/src/client.ts` 的选项增加可选回调：

```ts
export interface ApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: FetchLike;
  headers?: HeadersInit;
  onUnauthorized?: () => void;
}
```

在 `request()` 与 `rawTextRequest()` 中统一触发：

```ts
if (response.status === 401) {
  options.onUnauthorized?.();
}
```

完整位置应放在抛出 `ApiError` 之前：

```ts
const envelope = (await response.json()) as ApiEnvelope<TData>;
if (!response.ok || envelope.code !== 0) {
  if (response.status === 401) {
    options.onUnauthorized?.();
  }
  throw new ApiError({
    code: envelope.code || response.status,
    message: envelope.message || response.statusText,
    status: response.status,
    requestId: envelope.request_id
  });
}
```

在 `apps/user-web/src/app.tsx` 中实现统一回退：

```tsx
function handleUnauthorized() {
  store.clear();
  setSession(null);
  setSelectedPath("/app/courses");
  setPendingPracticeSession(null);
  setErrorMessage("登录已失效，请重新登录");
}
```

创建带 token client 时挂上该回调：

```tsx
return createApiClient({
  baseUrl,
  accessToken: session.accessToken,
  onUnauthorized: handleUnauthorized
});
```

为避免业务 mock 不经过 SDK 时仍能回退，在 `app.tsx` 中给页面容器加一个统一错误包裹：

```tsx
function isUnauthorizedError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 401;
}
```

并在调用登录与业务页面桥接时，针对 `401` 触发 `handleUnauthorized()`。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm test -- packages/api-sdk/src/client.test.ts apps/user-web/src/app.test.tsx
```

Expected: PASS，401 会清空 session 并退回登录页。

- [ ] **Step 5: Commit**

```powershell
git add packages/api-sdk/src/client.ts packages/api-sdk/src/client.test.ts apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "新增：补齐用户端登录失效回退"
```

## 任务 4： 会话恢复、现有页面回归与文档同步

**Files:**
- Modify: `apps/user-web/src/app.tsx`
- Modify: `apps/user-web/src/app.test.tsx`
- Modify: `docs/docs/26_stage2f_implementation_status.md`

- [ ] **Step 1: Write the failing tests**

在 `apps/user-web/src/app.test.tsx` 中新增：

```ts
it("restores session from localStorage on startup", async () => {
  window.localStorage.setItem(
    "aios.user.session",
    JSON.stringify({
      accessToken: "access-restore",
      refreshToken: "refresh-restore",
      expiresIn: 7200,
      user: {
        id: 9,
        tenant_id: 1,
        display_name: "王同学",
        user_type: "student",
        roles: ["student"],
        permissions: ["practice:use"]
      },
      menus: [
        {
          id: 2,
          name: "学习中心",
          path: "/app",
          children: [
            { id: 21, name: "我的课程", path: "/app/courses", children: [] },
            { id: 22, name: "练题中心", path: "/app/practice", children: [] }
          ]
        }
      ]
    })
  );

  render(<UserApp practiceApi={createPracticeApiMock()} />);

  await waitFor(() => {
    expect(screen.getByText("王同学")).toBeTruthy();
    expect(screen.getByRole("button", { name: "我的课程" })).toBeTruthy();
  });
});

it("shows empty state when authenticated user has no available menus", async () => {
  render(
    <UserApp
      authApi={{
        login: async () => ({
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: 7200,
          user: {
            id: 11,
            tenant_id: 1,
            display_name: "访客用户",
            user_type: "student",
            roles: ["student"],
            permissions: []
          }
        }),
        logout: async () => true,
        menus: async () => []
      }}
      practiceApi={createPracticeApiMock()}
    />
  );

  fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "school-a" } });
  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "visitor" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => {
    expect(screen.getByText("当前账号暂无可用功能")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm test -- apps/user-web/src/app.test.tsx
```

Expected: FAIL，当前应用壳对默认路径、空菜单和恢复后的渲染还不稳定。

- [ ] **Step 3: Write minimal implementation**

在 `apps/user-web/src/app.tsx` 中收口默认路径与空菜单：

```tsx
useEffect(() => {
  if (!session) {
    return;
  }
  if (!selectedPath) {
    setSelectedPath(getFirstAvailablePath(session.menus));
    return;
  }
  if (!hasPath(session.menus, selectedPath)) {
    setSelectedPath(getFirstAvailablePath(session.menus));
  }
}, [session, selectedPath]);
```

补充菜单帮助函数：

```ts
function hasPath(menus: MenuItem[], path: string): boolean {
  return menus.some((menu) => menu.children.some((child) => child.path === path));
}

function getFirstAvailablePath(menus: MenuItem[]): string {
  for (const menu of menus) {
    if (menu.children.length > 0) {
      return menu.children[0].path;
    }
  }
  return "";
}
```

已登录壳层中将空菜单处理前置：

```tsx
{session.menus.length === 0 ? <p>当前账号暂无可用功能</p> : <MenuNav menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />}
```

在 `docs/docs/26_stage2f_implementation_status.md` 追加一节：

```md
## 用户端登录闭环补充

1. `user-web` 已补齐 `tenant_code / username / password` 登录页。
2. 登录成功后会保存 `aios.user.session`，并按 `GET /api/v1/menus?app_type=user` 渲染动态菜单。
3. 用户端业务接口出现 `401` 时会清空本地会话并退回登录页。
```

- [ ] **Step 4: Run tests and full verification**

Run:

```powershell
pnpm test -- apps/user-web/src/app.test.tsx
pnpm test
pnpm typecheck
pnpm build
```

Expected:

```text
PASS apps/user-web/src/app.test.tsx
all vitest suites pass
typecheck pass
build pass
```

- [ ] **Step 5: Commit**

```powershell
git add apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx docs/docs/26_stage2f_implementation_status.md
git commit -m "新增：完成用户端登录闭环"
```

## 自检

### 1. Spec coverage

本计划已覆盖 spec 中的以下要求：

1. 登录页三字段：任务 1。
2. 独立认证状态层：任务 1。
3. 动态菜单渲染：任务 2。
4. 本地会话恢复：任务 4。
5. 退出登录：任务 2。
6. `401` 统一回退：任务 3。
7. 现有业务页面继续使用带 token client：任务 1、任务 3、任务 4。
8. 测试覆盖：任务 1 到任务 4。

未覆盖项检查结果：无遗漏。

### 2. Placeholder scan

本计划未保留 `TODO / TBD / 稍后补 / 适当处理` 这类占位语句；每个任务都给出了目标文件、测试示例、命令和最小实现骨架。

### 3. Type consistency

命名已统一为：

1. `UserSessionState`
2. `UserSessionStore`
3. `UserAuthApi`
4. `createBrowserSessionStore`
5. `handleUnauthorized`
6. `getFirstAvailablePath`

`MenuItem` 字段统一使用 SDK 现有的 `path` 与 `children`，未混用后端 Go 的大写字段名。
