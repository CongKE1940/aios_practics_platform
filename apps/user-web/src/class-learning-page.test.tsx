// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassLearningPage, type ClassLearningApi } from "./class-learning-page";

afterEach(() => {
  cleanup();
});

describe("ClassLearningPage", () => {
  it("loads class course options and queries after selecting a course node", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => ({
        items: [
          {
            class_id: 301,
            class_name: "七年级一班",
            courses: [
              { course_id: 10, course_name: "数学" },
              { course_id: 11, course_name: "语文" }
            ]
          }
        ]
      })),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>(async () => ({
        summary: {
          class_id: 301,
          class_name: "七年级一班",
          course_id: 10,
          course_name: "数学",
          student_count: 1,
          participated_student_count: 1,
          session_count: 1,
          answered_count: 5,
          correct_count: 4,
          wrong_count: 1,
          accuracy: 0.8,
          wrong_question_count: 1,
          confused_question_count: 0
        },
        students: {
          items: [],
          page: 1,
          page_size: 20,
          total: 0
        }
      }))
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => expect(api.listClassCourseOptions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "七年级一班" }));
    fireEvent.click(screen.getByRole("button", { name: "数学" }));
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-04-22" } });
    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    await waitFor(() => {
      expect(api.getClassPracticeSummary).toHaveBeenCalledWith({
        class_id: 301,
        course_id: 10,
        start_at: "2026-04-01T00:00:00+08:00",
        end_at: "2026-04-22T23:59:59+08:00",
        page: 1,
        page_size: 20
      });
    });
    expect(screen.getByText("七年级一班 / 数学")).toBeTruthy();
  });

  it("auto-selects the only course node and allows querying without manual selection", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => ({
        items: [
          {
            class_id: 302,
            class_name: "七年级二班",
            courses: [{ course_id: 20, course_name: "英语" }]
          }
        ]
      })),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>(async () => ({
        summary: {
          class_id: 302,
          class_name: "七年级二班",
          course_id: 20,
          course_name: "英语",
          student_count: 0,
          participated_student_count: 0,
          session_count: 0,
          answered_count: 0,
          correct_count: 0,
          wrong_count: 0,
          accuracy: 0,
          wrong_question_count: 0,
          confused_question_count: 0
        },
        students: {
          items: [],
          page: 1,
          page_size: 20,
          total: 0
        }
      }))
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("当前已选：七年级二班 / 英语")).toBeTruthy();
      expect(screen.getByRole("button", { name: "英语" }).getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    await waitFor(() => {
      expect(api.getClassPracticeSummary).toHaveBeenCalledWith({
        class_id: 302,
        course_id: 20,
        start_at: undefined,
        end_at: undefined,
        page: 1,
        page_size: 20
      });
    });
  });

  it("keeps cascade expanded and selected state visible across collapse and re-expand", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => ({
        items: [
          {
            class_id: 301,
            class_name: "七年级一班",
            courses: [
              { course_id: 10, course_name: "数学" },
              { course_id: 11, course_name: "语文" }
            ]
          },
          {
            class_id: 302,
            class_name: "七年级二班",
            courses: [{ course_id: 12, course_name: "英语" }]
          }
        ]
      })),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>()
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => expect(api.listClassCourseOptions).toHaveBeenCalledTimes(1));

    const classOneButton = screen.getByRole("button", { name: "七年级一班" });
    expect(classOneButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(classOneButton);
    expect(classOneButton.getAttribute("aria-expanded")).toBe("true");

    const mathButton = screen.getByRole("button", { name: "数学" });
    const chineseButton = screen.getByRole("button", { name: "语文" });
    expect(mathButton.getAttribute("aria-pressed")).toBe("false");
    expect(chineseButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(mathButton);
    expect(screen.getByText("当前已选：七年级一班 / 数学")).toBeTruthy();
    expect(screen.getByRole("button", { name: "数学" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "语文" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "七年级一班" }));
    expect(screen.getByRole("button", { name: "七年级一班" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "数学" })).toBeNull();
    expect(screen.getByText("当前已选：七年级一班 / 数学")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "七年级一班" }));
    expect(screen.getByRole("button", { name: "七年级一班" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "数学" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "语文" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows empty state when no class course options exist", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => ({
        items: []
      })),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>()
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("暂无可查看的班级课程")).toBeTruthy();
    });
  });

  it("shows error state when class course options fail to load", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => {
        throw new Error("network error");
      }),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>()
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("班级课程加载失败，请稍后重试。")).toBeTruthy();
    });
  });

  it("rejects querying before selecting a course node", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => ({
        items: [
          {
            class_id: 301,
            class_name: "七年级一班",
            courses: [
              { course_id: 10, course_name: "数学" },
              { course_id: 11, course_name: "语文" }
            ]
          }
        ]
      })),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>()
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => expect(api.listClassCourseOptions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    expect(screen.getByText("请选择班级和课程。")).toBeTruthy();
    expect(api.getClassPracticeSummary).not.toHaveBeenCalled();
  });
});
