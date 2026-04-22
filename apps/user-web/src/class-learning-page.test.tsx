// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassLearningPage, type ClassLearningApi } from "./class-learning-page";

afterEach(() => {
  cleanup();
});

describe("ClassLearningPage", () => {
  it("validates class and course before querying", () => {
    const api = {
      getClassPracticeSummary: vi.fn<ClassLearningApi["getClassPracticeSummary"]>()
    };

    render(<ClassLearningPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    expect(screen.getByText("班级ID和课程ID必须为正整数。")).toBeTruthy();
    expect(api.getClassPracticeSummary).not.toHaveBeenCalled();
  });

  it("sends class, course, and date range to analytics api", async () => {
    const api = {
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
    fireEvent.change(screen.getByLabelText("班级ID"), { target: { value: "301" } });
    fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "10" } });
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
    expect(screen.getByText("暂无学生练题数据。")).toBeTruthy();
  });
});
