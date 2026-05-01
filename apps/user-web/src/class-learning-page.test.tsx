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
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-04-22" } });
    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    await waitFor(() => {
      expect(api.getClassPracticeSummary).toHaveBeenLastCalledWith({
        class_id: 301,
        course_id: 10,
        start_at: "2026-04-01T00:00:00+08:00",
        end_at: "2026-04-22T23:59:59+08:00",
        page: 1,
        page_size: 20
      });
    });
    expect(screen.getAllByText("七年级一班 / 数学").length).toBeGreaterThan(0);
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
      expect((screen.getByLabelText("班级课程") as HTMLSelectElement).value).toBe("302:20");
    });

    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    await waitFor(() => {
      expect(api.getClassPracticeSummary).toHaveBeenLastCalledWith({
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
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>(async () => ({
        summary: {
          class_id: 301,
          class_name: "七年级一班",
          course_id: 10,
          course_name: "数学",
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
          page_size: 10,
          total: 0
        }
      }))
    };

    render(<ClassLearningPage api={api} />);

    await waitFor(() => {
      expect(api.listClassCourseOptions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("当前已选：七年级一班 / 数学")).toBeTruthy();
    });

    const select = screen.getByLabelText("班级课程") as HTMLSelectElement;
    expect(select.value).toBe("301:10");

    fireEvent.change(select, { target: { value: "302:12" } });
    expect(screen.getByText("当前已选：七年级二班 / 英语")).toBeTruthy();
    expect(select.value).toBe("302:12");

    fireEvent.change(select, { target: { value: "301:11" } });
    expect(screen.getByText("当前已选：七年级一班 / 语文")).toBeTruthy();
    expect(select.value).toBe("301:11");
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
      expect(screen.getByText("暂无学生学习数据")).toBeTruthy();
      expect((screen.getByRole("button", { name: "查询班级学习" }) as HTMLButtonElement).disabled).toBe(true);
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
      expect(screen.getByText("network error")).toBeTruthy();
    });
  });

  it("rejects querying before selecting a course node", async () => {
    const api = {
      listClassCourseOptions: vi.fn<ClassLearningApi["listClassCourseOptions"]>(async () => ({
        items: []
      })),
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>()
    };

    const { container } = render(<ClassLearningPage api={api} />);

    await waitFor(() => expect(api.listClassCourseOptions).toHaveBeenCalledTimes(1));
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByText("请选择班级课程后再查询。")).toBeTruthy();
    expect(api.getClassPracticeSummary).not.toHaveBeenCalled();
  });
});
