// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  StudentPracticeSessionDetailQuery,
  StudentPracticeSessionDetailResult
} from "@aios/api-sdk";

import {
  StudentPracticeSessionDetailPage,
  type StudentPracticeSessionDetailApi
} from "./student-practice-session-detail-page";

afterEach(() => {
  cleanup();
});

function createSessionDetailResult(
  overrides?: Partial<StudentPracticeSessionDetailResult>
): StudentPracticeSessionDetailResult {
  return {
    student_summary: {
      student_user_id: 701,
      student_name: "王同学",
      student_no: "stu_701",
      class_id: 301,
      class_name: "七年级一班",
      course_id: 10,
      course_name: "数学"
    },
    session: {
      session_id: 9001,
      started_at: "2026-04-22T10:00:00+08:00",
      finished_at: "2026-04-22T10:10:00+08:00",
      status: "finished",
      practice_mode: "random",
      source_mode: "course",
      flow_mode: "fixed_count",
      total_count: 2,
      answered_count: 1,
      correct_count: 1,
      wrong_count: 0,
      accuracy: 1
    },
    questions: [
      {
        session_question_id: 70001,
        question_id: 1001,
        question_version_id: 3001,
        display_order: 1,
        question_type: "single_choice",
        content: {
          stem: { text: "1+1等于几？" }
        },
        student_answer: {
          selected_options: ["B"]
        },
        correct_answer: {
          selected_options: ["B"]
        },
        is_answered: true,
        is_correct: true,
        answered_at: "2026-04-22T10:02:00+08:00",
        analysis: {
          text: "基础加法。"
        }
      }
    ],
    ...overrides
  };
}

describe("StudentPracticeSessionDetailPage", () => {
  it("loads session detail and renders summary/questions", async () => {
    const api: StudentPracticeSessionDetailApi = {
      getStudentPracticeSessionDetail: vi.fn(
        async (_query: StudentPracticeSessionDetailQuery) => createSessionDetailResult()
      )
    };

    render(
      <StudentPracticeSessionDetailPage
        api={api}
        path="/app/class-learning/student/session?class_id=301&course_id=10&student_user_id=701&session_id=9001"
        onNavigate={() => {}}
      />
    );

    await waitFor(() => {
      expect(api.getStudentPracticeSessionDetail).toHaveBeenCalledWith({
        class_id: 301,
        course_id: 10,
        student_user_id: 701,
        session_id: 9001
      });
    });

    expect(screen.getByRole("heading", { name: "王同学 本次练习" })).toBeTruthy();
    expect(screen.getByText("班级/课程：七年级一班 / 数学")).toBeTruthy();
    expect(screen.getByText("正确率：100%")).toBeTruthy();
    expect(screen.getByText("题干：1+1等于几？")).toBeTruthy();
    expect(screen.getByText("结果：正确")).toBeTruthy();
    expect(screen.getByText("解析：基础加法。")).toBeTruthy();
  });

  it("returns to student detail and keeps context", async () => {
    const api: StudentPracticeSessionDetailApi = {
      getStudentPracticeSessionDetail: vi.fn(async () => createSessionDetailResult())
    };
    const onNavigate = vi.fn();

    render(
      <StudentPracticeSessionDetailPage
        api={api}
        path="/app/class-learning/student/session?class_id=301&course_id=10&student_user_id=701&session_id=9001&start_at=2026-04-01T00:00:00%2B08:00&end_at=2026-04-22T23:59:59%2B08:00"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => expect(api.getStudentPracticeSessionDetail).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    const backPath = onNavigate.mock.calls[0][0];
    const backURL = new URL(backPath, "http://localhost");
    expect(backURL.pathname).toBe("/app/class-learning/student");
    expect(backURL.searchParams.get("class_id")).toBe("301");
    expect(backURL.searchParams.get("course_id")).toBe("10");
    expect(backURL.searchParams.get("student_user_id")).toBe("701");
    expect(backURL.searchParams.get("tab")).toBe("sessions");
    expect(backURL.searchParams.get("start_at")).toBe("2026-04-01T00:00:00+08:00");
    expect(backURL.searchParams.get("end_at")).toBe("2026-04-22T23:59:59+08:00");
  });

  it("shows invalid message when required query is missing", () => {
    const api: StudentPracticeSessionDetailApi = {
      getStudentPracticeSessionDetail: vi.fn(async () => createSessionDetailResult())
    };

    render(
      <StudentPracticeSessionDetailPage
        api={api}
        path="/app/class-learning/student/session?class_id=301&course_id=10&student_user_id=701"
        onNavigate={() => {}}
      />
    );

    expect(screen.getByText("练习详情参数无效。")).toBeTruthy();
    expect(api.getStudentPracticeSessionDetail).not.toHaveBeenCalled();
  });

  it("shows error message when api fails", async () => {
    const api: StudentPracticeSessionDetailApi = {
      getStudentPracticeSessionDetail: vi.fn(async () => {
        throw new Error("boom");
      })
    };

    render(
      <StudentPracticeSessionDetailPage
        api={api}
        path="/app/class-learning/student/session?class_id=301&course_id=10&student_user_id=701&session_id=9001"
        onNavigate={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("练习详情加载失败，请稍后重试。")).toBeTruthy();
    });
  });

  it("navigates to question detail page and keeps context", async () => {
    const api: StudentPracticeSessionDetailApi = {
      getStudentPracticeSessionDetail: vi.fn(async () => createSessionDetailResult())
    };
    const onNavigate = vi.fn();

    render(
      <StudentPracticeSessionDetailPage
        api={api}
        path="/app/class-learning/student/session?class_id=301&course_id=10&student_user_id=701&session_id=9001&start_at=2026-04-01T00:00:00%2B08:00&end_at=2026-04-22T23:59:59%2B08:00"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => expect(api.getStudentPracticeSessionDetail).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "查看题目详情" }));

    const nextPath = onNavigate.mock.calls[0][0];
    const nextURL = new URL(nextPath, "http://localhost");
    expect(nextURL.pathname).toBe("/app/class-learning/student/session/question");
    expect(nextURL.searchParams.get("class_id")).toBe("301");
    expect(nextURL.searchParams.get("course_id")).toBe("10");
    expect(nextURL.searchParams.get("student_user_id")).toBe("701");
    expect(nextURL.searchParams.get("session_id")).toBe("9001");
    expect(nextURL.searchParams.get("session_question_id")).toBe("70001");
    expect(nextURL.searchParams.get("start_at")).toBe("2026-04-01T00:00:00+08:00");
    expect(nextURL.searchParams.get("end_at")).toBe("2026-04-22T23:59:59+08:00");
  });
});
