// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Exam, ExamAttemptAnswerInput, ExamAttemptDetail, ExamAttemptResult, PageResult } from "@aios/api-sdk";

import { StudentExamPage, type StudentExamApi } from "./student-exam-page";

afterEach(() => {
  cleanup();
});

describe("StudentExamPage", () => {
  it("starts an exam, saves an answer, and submits the attempt", async () => {
    const saveExamAttemptAnswer = vi.fn(async (_id: number, body: ExamAttemptAnswerInput) => ({
      attempt_id: 801,
      question_id: 101,
      question_version_id: 1001,
      display_order: body.display_order,
      answer: body.answer,
      score: 0
    }));
    const submitExamAttempt = vi.fn(async () => createAttemptResult());
    const api = createStudentExamApiMock({ saveExamAttemptAnswer, submitExamAttempt });

    render(<StudentExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("期中测验")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "开始考试" }));

    await waitFor(() => {
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
      expect(screen.getByLabelText("选项 A")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("选项 A"));
    fireEvent.click(screen.getByRole("button", { name: "保存答案" }));

    await waitFor(() => {
      expect(saveExamAttemptAnswer).toHaveBeenCalledWith(801, {
        display_order: 1,
        answer: { selected_keys: ["A"] }
      });
      expect(screen.getByText("答案已保存。")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "交卷" }));

    await waitFor(() => {
      expect(submitExamAttempt).toHaveBeenCalledWith(801);
      expect(screen.getByRole("heading", { name: "考试结果" })).toBeTruthy();
      expect(screen.getByText("得分：10")).toBeTruthy();
    });
  });
});

function createStudentExamApiMock(overrides: Partial<StudentExamApi> = {}): StudentExamApi {
  return {
    listExams: async (): Promise<PageResult<Exam>> => ({
      items: [
        {
          id: 301,
          tenant_id: 1,
          name: "期中测验",
          exam_mode: "fixed",
          status: "published",
          start_time: "2026-04-24T09:00:00+08:00",
          end_time: "2026-04-24T10:00:00+08:00",
          duration_minutes: 60
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    }),
    startExamAttempt: async () => createAttemptDetail(),
    saveExamAttemptAnswer: async (_id, body) => ({
      attempt_id: 801,
      question_id: 101,
      question_version_id: 1001,
      display_order: body.display_order,
      answer: body.answer,
      score: 0
    }),
    submitExamAttempt: async () => createAttemptResult(),
    getExamAttemptResult: async () => createAttemptResult(),
    ...overrides
  };
}

function createAttemptDetail(): ExamAttemptDetail {
  return {
    attempt: {
      id: 801,
      exam_id: 301,
      paper_id: 701,
      tenant_id: 1,
      user_id: 10001,
      status: "in_progress",
      objective_score: 0,
      subjective_score: 0,
      final_score: 0
    },
    questions: [
      {
        question_id: 101,
        question_version_id: 1001,
        display_order: 1,
        score: 10,
        question_type: "single_choice",
        content: {
          stem: { text: "1+1等于几？" },
          options: [
            { key: "A", text: "2" },
            { key: "B", text: "3" }
          ]
        }
      }
    ],
    answers: []
  };
}

function createAttemptResult(): ExamAttemptResult {
  return {
    attempt: {
      ...createAttemptDetail().attempt,
      status: "submitted",
      final_score: 10,
      objective_score: 10
    },
    answers: [
      {
        attempt_id: 801,
        question_id: 101,
        question_version_id: 1001,
        display_order: 1,
        answer: { selected_keys: ["A"] },
        is_correct: true,
        score: 10
      }
    ],
    objective_score: 10,
    final_score: 10
  };
}
