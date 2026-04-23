// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useState } from "react";

import type { StudentPracticeDetailQuery, StudentPracticeDetailResult } from "@aios/api-sdk";

import { StudentLearningDetailPage, type StudentLearningDetailApi } from "./student-learning-detail-page";

afterEach(() => {
  cleanup();
});

function createDetailResult(overrides?: Partial<StudentPracticeDetailResult>): StudentPracticeDetailResult {
  return {
    student_summary: {
      student_user_id: 701,
      student_name: "王同学",
      student_no: "stu_701",
      class_id: 301,
      class_name: "七年级一班",
      course_id: 10,
      course_name: "数学",
      session_count: 3,
      answered_count: 20,
      correct_count: 16,
      wrong_count: 4,
      accuracy: 0.8,
      wrong_question_count: 2,
      confused_question_count: 1,
      last_practiced_at: "2026-04-22T10:00:00+08:00"
    },
    active_tab: "sessions",
    sessions: {
      items: [
        {
          session_id: 9001,
          status: "finished",
          total_count: 10,
          answered_count: 10,
          correct_count: 8,
          wrong_count: 2,
          accuracy: 0.8,
          started_at: "2026-04-22T10:00:00+08:00",
          finished_at: "2026-04-22T10:10:00+08:00"
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    },
    wrong_questions: {
      items: [
        {
          question_id: 1001,
          question_version_id: 3001,
          question_type: "single_choice",
          stem: "1+1等于几？",
          practice_wrong_count: 2,
          last_wrong_at: "2026-04-22T10:05:00+08:00",
          is_confused: false,
          confused_at: null,
          last_result: "B"
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    },
    confused_questions: {
      items: [],
      page: 1,
      page_size: 20,
      total: 0
    },
    ...overrides
  };
}

describe("StudentLearningDetailPage", () => {
  it("loads sessions by default and renders student summary", async () => {
    const api: StudentLearningDetailApi = {
      getStudentPracticeDetail: vi.fn(async (_query: StudentPracticeDetailQuery) => createDetailResult())
    };

    render(
      <StudentLearningDetailPage
        api={api}
        path="/app/class-learning/student?class_id=301&course_id=10&student_user_id=701"
        onNavigate={() => {}}
      />
    );

    await waitFor(() => {
      expect(api.getStudentPracticeDetail).toHaveBeenCalledWith({
        class_id: 301,
        course_id: 10,
        student_user_id: 701,
        tab: "sessions",
        start_at: undefined,
        end_at: undefined,
        page: 1,
        page_size: 20
      });
    });

    expect(screen.getByRole("heading", { name: "王同学" })).toBeTruthy();
    expect(screen.getByText("学号：stu_701")).toBeTruthy();
    expect(screen.getByText("班级/课程：七年级一班 / 数学")).toBeTruthy();
    expect(screen.getByText("练习次数：3")).toBeTruthy();
    expect(screen.getByText("答题数：20")).toBeTruthy();
    expect(screen.getByText("正确率：80%")).toBeTruthy();

    expect(screen.getByText("session_id：9001")).toBeTruthy();
    expect(screen.getByText("status：finished")).toBeTruthy();
  });

  it("switches to wrong tab, re-fetches data, and updates URL", async () => {
    const api: StudentLearningDetailApi = {
      getStudentPracticeDetail: vi.fn(async (query: StudentPracticeDetailQuery) => {
        if (query.tab === "wrong") {
          return createDetailResult({ active_tab: "wrong" });
        }
        return createDetailResult({ active_tab: "sessions" });
      })
    };
    const navigatedPaths: string[] = [];

    function Wrapper() {
      const [path, setPath] = useState(
        "/app/class-learning/student?class_id=301&course_id=10&student_user_id=701&tab=sessions&start_at=2026-04-01T00:00:00%2B08:00&end_at=2026-04-22T23:59:59%2B08:00"
      );
      return (
        <StudentLearningDetailPage
          api={api}
          path={path}
          onNavigate={(nextPath) => {
            navigatedPaths.push(nextPath);
            setPath(nextPath);
          }}
        />
      );
    }

    render(<Wrapper />);

    await waitFor(() => expect(api.getStudentPracticeDetail).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "错题" }));

    await waitFor(() => {
      expect(api.getStudentPracticeDetail).toHaveBeenCalledTimes(2);
      expect(api.getStudentPracticeDetail).toHaveBeenLastCalledWith(expect.objectContaining({ tab: "wrong" }));
    });

    const nextUrl = new URL(navigatedPaths[0], "http://localhost");
    expect(nextUrl.pathname).toBe("/app/class-learning/student");
    expect(nextUrl.searchParams.get("tab")).toBe("wrong");
    expect(nextUrl.searchParams.get("start_at")).toBe("2026-04-01T00:00:00+08:00");
    expect(nextUrl.searchParams.get("end_at")).toBe("2026-04-22T23:59:59+08:00");
    expect(screen.getByText("1+1等于几？")).toBeTruthy();
    expect(screen.getByText("题型：single_choice")).toBeTruthy();
  });

  it("shows invalid params and does not call api", async () => {
    const api: StudentLearningDetailApi = {
      getStudentPracticeDetail: vi.fn(async () => createDetailResult())
    };

    render(
      <StudentLearningDetailPage
        api={api}
        path="/app/class-learning/student?class_id=0&course_id=10&student_user_id=701"
        onNavigate={() => {}}
      />
    );

    expect(screen.getByText("学生学习详情参数无效。")).toBeTruthy();
    expect(api.getStudentPracticeDetail).not.toHaveBeenCalled();
  });

  it("navigates back to class learning page", async () => {
    const api: StudentLearningDetailApi = {
      getStudentPracticeDetail: vi.fn(async () => createDetailResult())
    };
    const onNavigate = vi.fn();

    render(
      <StudentLearningDetailPage
        api={api}
        path="/app/class-learning/student?class_id=301&course_id=10&student_user_id=701&start_at=2026-04-01T00:00:00%2B08:00&end_at=2026-04-22T23:59:59%2B08:00"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => expect(api.getStudentPracticeDetail).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    const backPath = onNavigate.mock.calls[0][0];
    const backUrl = new URL(backPath, "http://localhost");
    expect(backUrl.pathname).toBe("/app/class-learning");
    expect(backUrl.searchParams.get("class_id")).toBe("301");
    expect(backUrl.searchParams.get("course_id")).toBe("10");
    expect(backUrl.searchParams.get("start_at")).toBe("2026-04-01T00:00:00+08:00");
    expect(backUrl.searchParams.get("end_at")).toBe("2026-04-22T23:59:59+08:00");
  });
});
