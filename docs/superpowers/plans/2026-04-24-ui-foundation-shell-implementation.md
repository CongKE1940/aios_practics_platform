# UI 一期壳层与视觉基座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理端和用户端建立统一的 UI 基座、登录页与应用壳，让现有业务页面在不改业务逻辑的前提下具备正式产品观感。

**Architecture:** 以 `@aios/ui-web` 作为共享样式与基础展示组件入口，在两个 Vite 应用中挂载统一的全局样式和壳层组件。业务页继续保留原有逻辑组件，只通过新的页面容器、导航和卡片表面接入视觉系统，避免把 UI 一期做成大范围业务重写。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Testing Library、共享工作区包 `@aios/ui-web`

---

## 文件结构

### 新增文件

- `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\ui-shell.css`
  - 共享 token、全局 reset、表单/按钮/卡片/表格/状态样式、应用壳布局样式
- `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\shell.tsx`
  - 通用 `AppShell`、`AppSidebar`、`AppHeader`、`PageSection`、`EmptyState`、`StatusNotice`
- `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\shell.test.tsx`
  - 共享壳层与反馈组件渲染测试

### 修改文件

- `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\index.ts`
  - 导出壳层组件和样式入口
- `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\permission-button.tsx`
  - 接入统一按钮类名，保持权限逻辑不变
- `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\main.tsx`
  - 注入共享 UI 样式
- `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.tsx`
  - 改造管理端登录页与应用壳
- `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.test.tsx`
  - 更新管理端登录页、导航、壳层断言
- `D:\workspace\projects\aios_practice_platform\apps\user-web\src\main.tsx`
  - 注入共享 UI 样式
- `D:\workspace\projects\aios_practice_platform\apps\user-web\src\login-page.tsx`
  - 改造成正式登录卡片
- `D:\workspace\projects\aios_practice_platform\apps\user-web\src\menu-nav.tsx`
  - 改造成分组导航结构
- `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.tsx`
  - 改造用户端应用壳与内容区
- `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.test.tsx`
  - 更新用户端壳层、导航、空态断言

---

### Task 1: 建立共享 UI 基座

**Files:**
- Create: `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\ui-shell.css`
- Create: `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\shell.tsx`
- Create: `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\shell.test.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\index.ts`
- Modify: `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\permission-button.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\packages\ui-web\src\shell.test.tsx`

- [ ] **Step 1: 先写共享壳层与反馈组件测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell, EmptyState, StatusNotice } from "./shell";

describe("AppShell", () => {
  it("renders sidebar, header and content regions", () => {
    render(
      <AppShell
        brand={<span>AIOS</span>}
        sidebar={<nav aria-label="示例导航">导航</nav>}
        header={<div>当前用户</div>}
      >
        <section>主内容</section>
      </AppShell>
    );

    expect(screen.getByText("AIOS")).toBeTruthy();
    expect(screen.getByLabelText("示例导航")).toBeTruthy();
    expect(screen.getByText("当前用户")).toBeTruthy();
    expect(screen.getByText("主内容")).toBeTruthy();
  });
});

describe("feedback surfaces", () => {
  it("renders status notice and empty state copy", () => {
    render(
      <>
        <StatusNotice tone="danger" title="登录失败" description="用户名或密码错误" />
        <EmptyState title="暂无功能" description="请联系管理员分配权限" />
      </>
    );

    expect(screen.getByText("登录失败")).toBeTruthy();
    expect(screen.getByText("用户名或密码错误")).toBeTruthy();
    expect(screen.getByText("暂无功能")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试，确认它因模块不存在而失败**

```bash
pnpm test -- --run packages/ui-web/src/shell.test.tsx
```

Expected: FAIL，提示 `Cannot find module './shell'`

- [ ] **Step 3: 写最小共享壳层组件与全局样式**

```tsx
// packages/ui-web/src/shell.tsx
import type { ReactNode } from "react";

export interface AppShellProps {
  brand: ReactNode;
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}

export function AppShell({ brand, sidebar, header, children }: AppShellProps) {
  return (
    <div className="ui-shell">
      <aside className="ui-shell__sidebar">
        <div className="ui-shell__brand">{brand}</div>
        <div className="ui-shell__nav">{sidebar}</div>
      </aside>
      <div className="ui-shell__main">
        <header className="ui-shell__header">{header}</header>
        <div className="ui-shell__content">{children}</div>
      </div>
    </div>
  );
}

export function PageSection({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ui-page-section">
      <div className="ui-page-section__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="ui-page-section__actions">{actions}</div> : null}
      </div>
      <div className="ui-surface ui-page-section__body">{children}</div>
    </section>
  );
}

export function StatusNotice({
  tone,
  title,
  description
}: {
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  description?: string;
}) {
  return (
    <div className={`ui-status ui-status--${tone}`} role="status">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="ui-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
```

```css
/* packages/ui-web/src/ui-shell.css */
:root {
  color-scheme: light;
  --ui-color-bg: #f3f6fb;
  --ui-color-surface: #ffffff;
  --ui-color-surface-muted: #f8fafc;
  --ui-color-border: #d7dfeb;
  --ui-color-border-strong: #bac8dd;
  --ui-color-text: #112036;
  --ui-color-text-muted: #607089;
  --ui-color-primary: #2563eb;
  --ui-color-primary-soft: #dbeafe;
  --ui-color-success: #0f9f6e;
  --ui-color-warning: #d97706;
  --ui-color-danger: #dc2626;
  --ui-shadow-card: 0 12px 30px rgba(15, 23, 42, 0.08);
  --ui-radius-card: 8px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  background: linear-gradient(180deg, #eef4ff 0%, var(--ui-color-bg) 100%);
  color: var(--ui-color-text);
}

button, input, select, textarea {
  font: inherit;
}

.ui-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
}

.ui-shell__sidebar {
  padding: 24px 18px;
  background: #0f172a;
  color: #e5eefc;
}

.ui-shell__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ui-shell__header,
.ui-shell__content {
  padding: 24px 32px;
}

.ui-surface,
.ui-empty-state,
.ui-status {
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius-card);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}
```

```tsx
// packages/ui-web/src/index.ts
export * from "./permission-button";
export * from "./shell";
export { default as uiShellStyles } from "./ui-shell.css?inline";
```

```tsx
// packages/ui-web/src/permission-button.tsx
return (
  <button type={type} className={["ui-button", buttonProps.className].filter(Boolean).join(" ")} {...buttonProps}>
    {children}
  </button>
);
```

- [ ] **Step 4: 运行共享 UI 包测试与类型检查**

```bash
pnpm test -- --run packages/ui-web/src/shell.test.tsx packages/ui-web/src/permission-button.test.tsx
pnpm --filter @aios/ui-web typecheck
```

Expected: PASS

- [ ] **Step 5: 提交共享 UI 基座**

```bash
git add packages/ui-web/src/index.ts packages/ui-web/src/permission-button.tsx packages/ui-web/src/shell.tsx packages/ui-web/src/shell.test.tsx packages/ui-web/src/ui-shell.css
git commit -m "新增：建立共享 UI 基座与应用壳组件"
```

### Task 2: 改造管理端登录页与后台应用壳

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\main.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.test.tsx`

- [ ] **Step 1: 先扩展管理端测试，锁定新壳层结构**

```tsx
it("renders admin shell after successful login", async () => {
  const sessionStore = createMemorySessionStore();
  render(
    <AdminApp
      sessionStore={sessionStore}
      authApi={{
        listLoginOrganizations: async () => createLoginOrganizations(),
        login: async () => ({
          access_token: "access_token",
          refresh_token: "refresh_token",
          expires_in: 7200,
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["notice:manage"]
          }
        }),
        logout: async () => true,
        menus: async () => []
      }}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("option", { name: "平台管理（platform）" })).toBeTruthy();
  });

  fireEvent.change(screen.getByLabelText("组织"), { target: { value: "platform" } });
  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Test@123456" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => {
    expect(screen.getByLabelText("管理菜单")).toBeTruthy();
    expect(screen.getByText("欢迎回来，系统管理员")).toBeTruthy();
    expect(screen.getByText("基础平台能力")).toBeTruthy();
    expect(screen.getByText("请选择左侧功能入口。")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行管理端测试，确认新断言失败**

```bash
pnpm test -- --run apps/admin-web/src/app.test.tsx
```

Expected: FAIL，缺少 `欢迎回来，系统管理员` 或 `管理菜单` 壳层断言

- [ ] **Step 3: 最小实现管理端登录卡片和应用壳**

```tsx
// apps/admin-web/src/main.tsx
import { uiShellStyles } from "@aios/ui-web";

const styleElement = document.createElement("style");
styleElement.textContent = uiShellStyles;
document.head.appendChild(styleElement);
```

```tsx
// apps/admin-web/src/app.tsx
import { AppShell, EmptyState, PageSection, StatusNotice } from "@aios/ui-web";

if (!session) {
  return (
    <main className="ui-auth-page">
      <section className="ui-auth-hero">
        <p className="ui-auth-eyebrow">AIOS Practice Platform</p>
        <h1>AIOS 管理端</h1>
        <p>统一管理组织、题库、权限、导入与平台数据。</p>
      </section>
      <section className="ui-auth-card">
        <form onSubmit={handleSubmit} aria-label="登录表单">
          <label htmlFor="tenant_code">组织</label>
          <select id="tenant_code" name="tenant_code" value={form.tenant_code} />
          <label htmlFor="username">用户名</label>
          <input id="username" name="username" value={form.username} />
          <label htmlFor="password">密码</label>
          <input id="password" name="password" type="password" value={form.password} />
          {organizationsError ? (
            <StatusNotice tone="warning" title="组织列表加载失败" description={organizationsError} />
          ) : null}
          {errorMessage ? <StatusNotice tone="danger" title="登录失败" description={errorMessage} /> : null}
        </form>
      </section>
    </main>
  );
}

return (
  <AppShell
    brand={
      <>
        <strong>AIOS 管理端</strong>
        <span>现代教育工作台</span>
      </>
    }
    sidebar={
      <nav aria-label="管理菜单" className="ui-nav-tree">
        <ul>
          {session.menus.map((menu) => (
            <li key={menu.id}>
              <span>{menu.name}</span>
              {menu.children.length > 0 ? (
                <ul>
                  {menu.children.map((child) => (
                    <li key={child.id}>
                      <button type="button" className="ui-nav-tree__item" onClick={() => setSelectedPath(child.path)}>
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
    }
    header={
      <section className="ui-user-chip" aria-label="当前用户">
        <div>
          <p>欢迎回来，{session.user.display_name}</p>
          <strong>{session.user.user_type}</strong>
        </div>
        <button type="button" className="ui-button ui-button--ghost" onClick={handleLogout}>
          退出登录
        </button>
      </section>
    }
  >
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
      title={selectedPath === "/admin/org" ? "组织管理" : selectedPath === "/admin/notices" ? "公告通知" : "当前视图"}
      description="从左侧选择功能后在这里展开。"
    >
      {renderedPanel ?? <EmptyState title="请选择左侧功能入口。" description="已登录后可在左侧继续进入具体模块。" />}
    </PageSection>
  </AppShell>
);
```

- [ ] **Step 4: 运行管理端测试与类型检查**

```bash
pnpm test -- --run apps/admin-web/src/app.test.tsx
pnpm --filter @aios/admin-web typecheck
```

Expected: PASS

- [ ] **Step 5: 提交管理端壳层改造**

```bash
git add apps/admin-web/src/main.tsx apps/admin-web/src/app.tsx apps/admin-web/src/app.test.tsx
git commit -m "优化：升级管理端登录页与后台应用壳"
```

### Task 3: 改造用户端登录页、导航与学习壳层

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\main.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\login-page.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\menu-nav.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.test.tsx`

- [ ] **Step 1: 先补用户端壳层测试**

```tsx
it("renders learner shell with grouped navigation", () => {
  render(
    <UserApp
      authApi={createAuthApiMock()}
      practiceApi={createPracticeApiMock()}
      sessionStore={createSessionStore(createSession([
        { id: 21, name: "我的课程", path: "/app/courses", children: [] },
        { id: 22, name: "练题中心", path: "/app/practice", children: [] }
      ]))}
    />
  );

  expect(screen.getByText("今日学习")).toBeTruthy();
  expect(screen.getByLabelText("学习菜单")).toBeTruthy();
  expect(screen.getByText("欢迎回来，李同学")).toBeTruthy();
  expect(screen.getByText("继续选择导航，进入当前学习任务。")).toBeTruthy();
});
```

- [ ] **Step 2: 运行用户端测试，确认新壳层断言失败**

```bash
pnpm test -- --run apps/user-web/src/app.test.tsx
```

Expected: FAIL，缺少 `今日学习` 或 `欢迎回来，李同学`

- [ ] **Step 3: 最小实现用户端登录卡片、导航与学习壳层**

```tsx
// apps/user-web/src/login-page.tsx
return (
  <form aria-label="登录表单" className="ui-auth-form" onSubmit={handleSubmit}>
    <header className="ui-auth-form__header">
      <p className="ui-auth-eyebrow">学生 / 老师统一入口</p>
      <h2>登录学习工作台</h2>
      <p>选择组织后继续进入练题、考试与班级学习。</p>
    </header>
    <label htmlFor="tenant_code">组织</label>
    <select id="tenant_code" value={form.tenant_code} />
    <label htmlFor="username">用户名</label>
    <input id="username" value={form.username} />
    <label htmlFor="password">密码</label>
    <input id="password" type="password" value={form.password} />
    {organizationsError ? <StatusNotice tone="warning" title="组织列表加载失败" description={organizationsError} /> : null}
    {errorMessage ? <StatusNotice tone="danger" title="登录失败" description={errorMessage} /> : null}
    <button className="ui-button ui-button--primary" type="submit" disabled={submitting || organizationsLoading || !form.tenant_code}>
      {submitting ? "登录中..." : "登录"}
    </button>
  </form>
);
```

```tsx
// apps/user-web/src/menu-nav.tsx
export function MenuNav({ menus, selectedPath, onSelect }: MenuNavProps) {
  if (menus.length === 0) {
    return <EmptyState title="当前账号暂无可用功能" description="请联系管理员分配课程或权限。" />;
  }

  return (
    <nav aria-label="学习菜单" className="ui-nav-tree">
      <div className="ui-nav-tree__title">
        <strong>今日学习</strong>
        <span>按模块进入课程、练题和考试</span>
      </div>
      <ul>{menus.map((menu) => <MenuNode key={menu.id} menu={menu} selectedPath={selectedPath} onSelect={onSelect} />)}</ul>
    </nav>
  );
}
```

```tsx
// apps/user-web/src/app.tsx
import { AppShell, EmptyState, PageSection, StatusNotice } from "@aios/ui-web";

if (!session) {
  return (
    <main className="ui-auth-page ui-auth-page--learner">
      <section className="ui-auth-hero">
        <p className="ui-auth-eyebrow">AIOS Learning Workspace</p>
        <h1>AIOS 学生端</h1>
        <p>把课程、练题、班级学习和考试放进一个统一工作台。</p>
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

return (
  <AppShell
    brand={
      <>
        <strong>AIOS 学习工作台</strong>
        <span>课程、练题、考试一体化</span>
      </>
    }
    sidebar={<MenuNav menus={session.menus} selectedPath={selectedPath} onSelect={setSelectedPath} />}
    header={
      <section className="ui-user-chip" aria-label="当前用户">
        <div>
          <p>欢迎回来，{session.user.display_name}</p>
          <strong>{session.user.user_type}</strong>
        </div>
        <button type="button" className="ui-button ui-button--ghost" onClick={handleLogout}>
          退出登录
        </button>
      </section>
    }
  >
    <PageSection
      title={selectedRoute === "/app/courses" ? "我的课程" : selectedRoute === "/app/practice" ? "练题中心" : selectedRoute === "/app/exams" ? "考试入口" : "学习工作台"}
      description="继续选择导航，进入当前学习任务。"
    >
      {content ?? <EmptyState title="当前账号暂无可用功能" description="请联系管理员分配课程或权限。" />}
      {errorMessage ? <StatusNotice tone="danger" title="当前会话异常" description={errorMessage} /> : null}
    </PageSection>
  </AppShell>
);
```

- [ ] **Step 4: 运行用户端测试与类型检查**

```bash
pnpm test -- --run apps/user-web/src/app.test.tsx
pnpm --filter @aios/user-web typecheck
```

Expected: PASS

- [ ] **Step 5: 提交用户端壳层改造**

```bash
git add apps/user-web/src/main.tsx apps/user-web/src/login-page.tsx apps/user-web/src/menu-nav.tsx apps/user-web/src/app.tsx apps/user-web/src/app.test.tsx
git commit -m "优化：升级用户端登录页与学习工作台壳层"
```

### Task 4: 让旧业务面板接入统一表面样式

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.tsx`
- Modify: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\admin-web\src\app.test.tsx`
- Test: `D:\workspace\projects\aios_practice_platform\apps\user-web\src\app.test.tsx`

- [ ] **Step 1: 增加业务页被统一容器包裹的断言**

```tsx
it("shows the empty state inside the shared content surface", () => {
  render(
    <AdminApp
      sessionStore={createMemorySessionStore({
        accessToken: "access_token",
        refreshToken: "refresh_token",
        expiresIn: 7200,
        menus: [],
        user: {
          id: 1,
          tenant_id: 1,
          display_name: "系统管理员",
          user_type: "sys_admin",
          roles: ["sys_admin"],
          permissions: ["notice:manage"]
        }
      })}
    />
  );

  expect(screen.getByText("请选择左侧功能入口。").closest(".ui-surface")).toBeTruthy();
});

it("keeps the learner empty state inside the shared content surface", () => {
  render(
    <UserApp
      authApi={createAuthApiMock()}
      practiceApi={createPracticeApiMock()}
      sessionStore={createSessionStore(createSession([]))}
    />
  );

  expect(screen.getByText("当前账号暂无可用功能").closest(".ui-surface")).toBeTruthy();
});
```

- [ ] **Step 2: 运行壳层测试，确认旧容器未命中新样式包装**

```bash
pnpm test -- --run apps/admin-web/src/app.test.tsx apps/user-web/src/app.test.tsx
```

Expected: FAIL，`.closest(".ui-surface")` 为 `null`

- [ ] **Step 3: 最小实现统一内容容器和表面类**

```tsx
// apps/admin-web/src/app.tsx
const renderedPanel = (
  <div className="ui-stack ui-stack--lg">
    {selectedPath === "/admin/org" && organizationApi ? <OrganizationPanel api={organizationApi} /> : null}
    {selectedPath === "/admin/notices" && currentNoticeApi ? <NoticePanel api={currentNoticeApi} /> : null}
    {selectedPath === "/admin/analytics" && currentAnalyticsApi ? <AnalyticsPanel api={currentAnalyticsApi} /> : null}
  </div>
);
```

```tsx
// apps/user-web/src/app.tsx
const content = (
  <div className="ui-stack ui-stack--lg">
    {selectedRoute === "/app/courses" ? (
      <EmptyState title="我的课程" description="课程首页将在后续页面专项中继续增强。" />
    ) : null}
    {selectedRoute === "/app/practice" && currentPracticeApi ? (
      <PracticePanel
        api={currentPracticeApi}
        initialSession={pendingPracticeSession}
        onInitialSessionConsumed={() => setPendingPracticeSession(null)}
        onFinished={(summary) => setSelectedPath(`/app/practice/results/${summary.id}`)}
      />
    ) : null}
    {selectedRoute === "/app/exams" && currentPracticeApi && isStudentExamApi(currentPracticeApi) ? (
      <StudentExamPage api={currentPracticeApi} />
    ) : null}
  </div>
);
```

```css
.ui-stack {
  display: grid;
  gap: 16px;
}

.ui-stack--lg {
  gap: 24px;
}

.ui-nav-tree button,
.ui-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid transparent;
}

.ui-surface table {
  width: 100%;
  border-collapse: collapse;
}

.ui-surface th,
.ui-surface td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-color-border);
}
```

- [ ] **Step 4: 运行两端壳层测试**

```bash
pnpm test -- --run apps/admin-web/src/app.test.tsx apps/user-web/src/app.test.tsx
```

Expected: PASS

- [ ] **Step 5: 提交统一表面接入**

```bash
git add apps/admin-web/src/app.tsx apps/user-web/src/app.tsx packages/ui-web/src/ui-shell.css apps/admin-web/src/app.test.tsx apps/user-web/src/app.test.tsx
git commit -m "优化：统一两端业务内容表面样式"
```

### Task 5: 全量验证与文档同步

**Files:**
- Modify: `D:\workspace\projects\aios_practice_platform\docs\docs\28_stage6_admin_analytics_snapshot_status.md`（如需补充 UI 一期进度）
- Modify: `D:\workspace\projects\aios_practice_platform\docs\superpowers\plans\2026-04-24-ui-foundation-shell-implementation.md`（勾选执行记录，可选）

- [ ] **Step 1: 运行前端关键测试、类型检查和差异检查**

```bash
pnpm test -- --run packages/ui-web/src/permission-button.test.tsx packages/ui-web/src/shell.test.tsx apps/admin-web/src/app.test.tsx apps/user-web/src/app.test.tsx
pnpm test
pnpm typecheck
git diff --check
```

Expected:
- `pnpm test` 全部通过
- `pnpm typecheck` 通过
- `git diff --check` 无输出

- [ ] **Step 2: 启动前端服务做手工冒烟**

```bash
pnpm --filter @aios/admin-web dev -- --host 127.0.0.1 --port 5173
pnpm --filter @aios/user-web dev -- --host 127.0.0.1 --port 5174
```

Expected:
- 管理端打开后看到新登录页、左侧导航和顶部用户区
- 用户端打开后看到新登录页、学习导航和统一内容容器

- [ ] **Step 3: 如有需要，同步阶段文档**

```md
## UI 一期进度

- 已完成登录页重做
- 已完成管理端与用户端应用壳升级
- 已建立共享表单、卡片、表格、状态样式基座
```

- [ ] **Step 4: 提交验证与文档更新**

```bash
git add docs/ packages/ui-web apps/admin-web apps/user-web
git commit -m "文档：同步 UI 一期壳层改造进度"
```
