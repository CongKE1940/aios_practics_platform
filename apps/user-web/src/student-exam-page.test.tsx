// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Exam, ExamAttemptAnswerInput, ExamAttemptDetail, ExamAttemptResult, PageResult } from "@aios/api-sdk";

import { StudentExamPage, type StudentExamApi } from "./student-exam-page";

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
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
    vi.spyOn(window, "confirm").mockReturnValue(true);

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

  it("shows countdown, question navigation, submit confirmation, and leave protection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T09:00:00+08:00"));

    const submitExamAttempt = vi.fn(async () => createAttemptResult());
    const api = createStudentExamApiMock({
      startExamAttempt: async () => createAttemptDetail({ questionCount: 2, startAt: "2026-04-24T09:00:00+08:00" }),
      submitExamAttempt
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<StudentExamPage api={api} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("期中测验")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始考试" }));
      await Promise.resolve();
    });
    expect(screen.getByText((_content, node) => node?.textContent === "剩余时间：60:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "第 2 题" })).toBeTruthy();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "第 2 题" }));
    expect(screen.getByText("2+2等于几？")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "交卷" }));
    expect(confirm).toHaveBeenCalledWith("确认交卷吗？交卷后不能继续修改答案。");
    expect(submitExamAttempt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "交卷" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submitExamAttempt).toHaveBeenCalledWith(801);
    expect(screen.getByRole("heading", { name: "考试结果" })).toBeTruthy();
  });

  it("auto submits when countdown reaches zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T09:59:59+08:00"));

    const submitExamAttempt = vi.fn(async () => createAttemptResult());
    const api = createStudentExamApiMock({
      startExamAttempt: async () => createAttemptDetail({ startAt: "2026-04-24T09:00:00+08:00" }),
      submitExamAttempt
    });

    render(<StudentExamPage api={api} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("期中测验")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始考试" }));
      await Promise.resolve();
    });
    expect(screen.getByText((_content, node) => node?.textContent === "剩余时间：00:01")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(submitExamAttempt).toHaveBeenCalledWith(801);
    expect(screen.getByRole("heading", { name: "考试结果" })).toBeTruthy();
  });

  it("recovers an in-progress attempt after refresh", async () => {
    window.localStorage.setItem("aios.student_exam.recovery.v1", JSON.stringify({ exam_id: 301, attempt_id: 801 }));
    const getExamAttempt = vi.fn(async () =>
      createAttemptDetail({
        answers: [
          {
            attempt_id: 801,
            question_id: 101,
            question_version_id: 1001,
            display_order: 1,
            answer: { selected_keys: ["A"] },
            score: 0
          }
        ]
      })
    );
    const api = createStudentExamApiMock({ getExamAttempt });

    render(<StudentExamPage api={api} />);

    await waitFor(() => {
      expect(getExamAttempt).toHaveBeenCalledWith(801);
      expect(screen.getByText("已恢复未完成考试。")).toBeTruthy();
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
      expect(optionInput("选项 A").checked).toBe(true);
    });
  });

  it("keeps current answer and allows retry when save or submit fails", async () => {
    const saveExamAttemptAnswer = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementationOnce(async (_id: number, body: ExamAttemptAnswerInput) => ({
        attempt_id: 801,
        question_id: 101,
        question_version_id: 1001,
        display_order: body.display_order,
        answer: body.answer,
        score: 0
      }));
    const submitExamAttempt = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(createAttemptResult());
    const api = createStudentExamApiMock({ saveExamAttemptAnswer, submitExamAttempt });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<StudentExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("期中测验")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "开始考试" }));

    await waitFor(() => {
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("选项 A"));
    fireEvent.click(screen.getByRole("button", { name: "保存答案" }));

    await waitFor(() => {
      expect(screen.getByText("答案保存失败，请重试。")).toBeTruthy();
      expect(optionInput("选项 A").checked).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "保存答案" }));
    await waitFor(() => {
      expect(screen.getByText("答案已保存。")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "交卷" }));
    await waitFor(() => {
      expect(screen.getByText("交卷失败，请检查网络后重试。")).toBeTruthy();
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "交卷" }));
    await waitFor(() => {
      expect(submitExamAttempt).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("heading", { name: "考试结果" })).toBeTruthy();
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
    getExamAttempt: async () => createAttemptDetail(),
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

function optionInput(label: string): HTMLInputElement {
  const element = screen.getByLabelText(label);
  if (element instanceof HTMLInputElement) {
    return element;
  }
  const input = element.querySelector("input");
  if (!input) {
    throw new Error(`找不到选项输入框：${label}`);
  }
  return input;
}

function createAttemptDetail(
  options: { questionCount?: number; startAt?: string; answers?: ExamAttemptDetail["answers"] } = {}
): ExamAttemptDetail {
  const questionCount = options.questionCount ?? 1;
  return {
    attempt: {
      id: 801,
      exam_id: 301,
      paper_id: 701,
      tenant_id: 1,
      user_id: 10001,
      start_at: options.startAt,
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
    ].concat(
      questionCount > 1
        ? [
            {
              question_id: 102,
              question_version_id: 1002,
              display_order: 2,
              score: 10,
              question_type: "single_choice",
              content: {
                stem: { text: "2+2等于几？" },
                options: [
                  { key: "A", text: "4" },
                  { key: "B", text: "5" }
                ]
              }
            }
          ]
        : []
    ),
    answers: options.answers ?? []
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
