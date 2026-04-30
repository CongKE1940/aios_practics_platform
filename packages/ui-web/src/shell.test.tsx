// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell, EmptyState, StatusNotice } from "./shell";

afterEach(() => {
  cleanup();
});

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
