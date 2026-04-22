// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticePanel, type PracticePanelApi } from "./practice-panel";

afterEach(() => {
  cleanup();
});

describe("PracticePanel", () => {
  it("creates fixed-count practice session and submits answer", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(async () => ({
        id: 501,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "random",
        source_mode: "single_bank",
        flow_mode: "fixed_count",
        bank_scope: {},
        bank_ids: [1],
        exclude_mastered: true,
        question_count: 10,
        random_seed: 20260422,
        round_no: 1,
        status: "active",
        questions: [
          {
            session_question_id: 9001,
            session_id: 501,
            question_id: 1001,
            question_version_id: 3001,
            display_order: 1,
            question_type: "single_choice",
            content: {
              stem: { content_type: "text", text: "1+1等于几？", assets: [] },
              options: [
                { key: "A", content_type: "text", text: "1", assets: [] },
                { key: "B", content_type: "text", text: "2", assets: [] }
              ]
            },
            round_no: 1,
            answered: false
          }
        ]
      })),
      getPracticeSession: vi.fn(),
      nextPracticeQuestion: vi.fn(),
      submitPracticeAnswer: vi.fn(async () => ({
        is_correct: true,
        correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
        analysis: { text: "基础算术" },
        state: {
          id: 1,
          tenant_id: 1,
          user_id: 7,
          question_id: 1001,
          question_version_id: 3001,
          practice_correct_count: 1,
          practice_wrong_count: 0,
          exam_wrong_count: 0,
          is_mastered: false,
          is_confused: false
        }
      })),
      finishPracticeSession: vi.fn(),
      markPracticeQuestionMastered: vi.fn(async () => ({
        id: 1,
        tenant_id: 1,
        user_id: 7,
        question_id: 1001,
        question_version_id: 3001,
        practice_correct_count: 1,
        practice_wrong_count: 0,
        exam_wrong_count: 0,
        is_mastered: true,
        is_confused: false
      })),
      markPracticeQuestionConfused: vi.fn(async () => ({
        id: 1,
        tenant_id: 1,
        user_id: 7,
        question_id: 1001,
        question_version_id: 3001,
        practice_correct_count: 1,
        practice_wrong_count: 0,
        exam_wrong_count: 0,
        is_mastered: true,
        is_confused: true
      })),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticePanel api={api} />);

    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("选项 B"));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    await waitFor(() => {
      expect(api.submitPracticeAnswer).toHaveBeenCalledWith(
        501,
        expect.objectContaining({
          session_question_id: 9001
        })
      );
    });
    expect(screen.getByText("回答正确")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "标熟" }));
    await waitFor(() => {
      expect(api.markPracticeQuestionMastered).toHaveBeenCalledWith(1001, { value: true });
    });

    fireEvent.click(screen.getByRole("button", { name: "标疑惑" }));
    await waitFor(() => {
      expect(api.markPracticeQuestionConfused).toHaveBeenCalledWith(1001, { value: true });
    });
    expect(screen.getByText("状态：已标熟 / 已标疑惑")).toBeTruthy();
  });

  it("creates continuous practice session and loads next question", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(async () => ({
        id: 601,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "sequential",
        source_mode: "single_bank",
        flow_mode: "continuous",
        bank_scope: {},
        bank_ids: [1],
        exclude_mastered: false,
        random_seed: 20260422,
        round_no: 1,
        status: "active",
        questions: [
          {
            session_question_id: 9101,
            session_id: 601,
            question_id: 1101,
            question_version_id: 3101,
            display_order: 1,
            question_type: "single_choice",
            content: {
              stem: { content_type: "text", text: "第一题", assets: [] },
              options: [
                { key: "A", content_type: "text", text: "甲", assets: [] },
                { key: "B", content_type: "text", text: "乙", assets: [] }
              ]
            },
            round_no: 1,
            answered: false
          }
        ]
      })),
      getPracticeSession: vi.fn(),
      nextPracticeQuestion: vi.fn(async () => ({
        question: {
          session_question_id: 9102,
          session_id: 601,
          question_id: 1102,
          question_version_id: 3102,
          display_order: 2,
          question_type: "single_choice",
          content: {
            stem: { content_type: "text", text: "第二题", assets: [] },
            options: [
              { key: "A", content_type: "text", text: "甲", assets: [] },
              { key: "B", content_type: "text", text: "乙", assets: [] }
            ]
          },
          round_no: 1,
          answered: false
        },
        round_no: 1
      })),
      submitPracticeAnswer: vi.fn(),
      finishPracticeSession: vi.fn(),
      markPracticeQuestionMastered: vi.fn(),
      markPracticeQuestionConfused: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticePanel api={api} />);

    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("练题流"), { target: { value: "continuous" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(screen.getByText("第一题")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));

    await waitFor(() => {
      expect(screen.getByText("第二题")).toBeTruthy();
    });
  });

  it("renders true_false questions with correct and wrong options", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(async () => ({
        id: 701,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "random",
        source_mode: "single_bank",
        flow_mode: "fixed_count",
        bank_scope: {},
        bank_ids: [1],
        exclude_mastered: false,
        question_count: 10,
        random_seed: 20260422,
        round_no: 1,
        status: "active",
        questions: [
          {
            session_question_id: 9201,
            session_id: 701,
            question_id: 1201,
            question_version_id: 3201,
            display_order: 1,
            question_type: "true_false",
            content: {
              stem: { content_type: "text", text: "地球是圆的。", assets: [] }
            },
            round_no: 1,
            answered: false
          }
        ]
      })),
      getPracticeSession: vi.fn(),
      nextPracticeQuestion: vi.fn(),
      submitPracticeAnswer: vi.fn(),
      finishPracticeSession: vi.fn(),
      markPracticeQuestionMastered: vi.fn(),
      markPracticeQuestionConfused: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticePanel api={api} />);

    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(screen.getByText("地球是圆的。")).toBeTruthy();
    });
    expect(screen.getByLabelText("选项 true")).toBeTruthy();
    expect(screen.getByLabelText("选项 false")).toBeTruthy();
  });
});
