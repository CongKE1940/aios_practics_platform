// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MenuItem } from "@aios/api-sdk";

import { CourseOverviewPage, type CourseOverviewApi } from "./course-overview-page";

afterEach(() => {
  cleanup();
});

describe("CourseOverviewPage", () => {
  it("loads course cards and navigates to practice", async () => {
    const api: CourseOverviewApi = {
      listCourses: vi.fn(async () => ({
        items: [
          {
            id: 10,
            tenant_id: 1,
            code: "math_7a",
            name: "七年级数学",
            description: "本学期基础计算与方程训练",
            start_at: "2026-02-01T08:00:00+08:00",
            end_at: "2026-07-01T18:00:00+08:00",
            status: "active"
          }
        ],
        page: 1,
        page_size: 12,
        total: 1
      }))
    };
    const onNavigate = vi.fn();
    const menus: MenuItem[] = [
      { id: 21, name: "我的课程", path: "/app/courses", children: [] },
      { id: 22, name: "练题中心", path: "/app/practice", children: [] },
      { id: 32, name: "考试中心", path: "/app/exams", children: [] }
    ];

    render(<CourseOverviewPage api={api} menus={menus} userType="student" onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(api.listCourses).toHaveBeenCalledWith({ keyword: undefined, status: undefined, page: 1, page_size: 10 });
    });

    expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
    expect(screen.getByText("七年级数学")).toBeTruthy();
    expect(screen.getByText("本学期基础计算与方程训练")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    fireEvent.click(screen.getByRole("button", { name: "进入练题" }));
    expect(onNavigate).toHaveBeenCalledWith("/app/practice");
  });
});
