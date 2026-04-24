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
      finishPracticeSession: vi.fn(async () => ({
        id: 501,
        status: "finished",
        answered_count: 1,
        correct_count: 1,
        wrong_count: 0
      })),
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

    const onFinished = vi.fn();
    render(<PracticePanel api={api} onFinished={onFinished} />);

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

    fireEvent.click(screen.getByRole("button", { name: "退出练题" }));
    await waitFor(() => {
      expect(onFinished).toHaveBeenCalledWith({
        id: 501,
        status: "finished",
        answered_count: 1,
        correct_count: 1,
        wrong_count: 0
      });
    });
  });

  it("creates fixed-count course practice session with default question count", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(async () => ({
        id: 510,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "random",
        source_mode: "course",
        flow_mode: "fixed_count",
        course_id: 10,
        bank_scope: {},
        bank_ids: [],
        exclude_mastered: true,
        question_count: 10,
        random_seed: 20260422,
        round_no: 1,
        status: "active",
        questions: []
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

    fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "course" } });
    fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(api.createPracticeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          source_mode: "course",
          course_id: 10,
          bank_ids: [],
          question_count: 10
        })
      );
    });
  });

  it("clears the opposite source input when switching practice source", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(),
      getPracticeSession: vi.fn(),
      nextPracticeQuestion: vi.fn(),
      submitPracticeAnswer: vi.fn(),
      finishPracticeSession: vi.fn(),
      markPracticeQuestionMastered: vi.fn(),
      markPracticeQuestionConfused: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticePanel api={api} />);

    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1,2" } });
    fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "course" } });

    expect((screen.getByLabelText("课程ID") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "bank" } });

    expect((screen.getByLabelText("题库ID") as HTMLInputElement).value).toBe("");
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

    fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "bank" } });
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

  it("creates continuous course practice session without question count", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(async () => ({
        id: 602,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "sequential",
        source_mode: "course",
        flow_mode: "continuous",
        course_id: 10,
        bank_scope: {},
        bank_ids: [],
        exclude_mastered: false,
        random_seed: 20260422,
        round_no: 1,
        status: "active",
        questions: [
          {
            session_question_id: 9101,
            session_id: 602,
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
      nextPracticeQuestion: vi.fn(),
      submitPracticeAnswer: vi.fn(),
      finishPracticeSession: vi.fn(),
      markPracticeQuestionMastered: vi.fn(),
      markPracticeQuestionConfused: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticePanel api={api} />);

    fireEvent.change(screen.getByLabelText("练题来源"), { target: { value: "course" } });
    fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("练题流"), { target: { value: "continuous" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(api.createPracticeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          source_mode: "course",
          course_id: 10,
          bank_ids: []
        })
      );
    });
    expect(api.createPracticeSession).toHaveBeenCalledWith(
      expect.not.objectContaining({
        question_count: expect.anything()
      })
    );
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

  it("navigates to question feedback page from current question actions", async () => {
    const api: PracticePanelApi = {
      createPracticeSession: vi.fn(async () => ({
        id: 801,
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
            session_question_id: 9301,
            session_id: 801,
            question_id: 1301,
            question_version_id: 3301,
            display_order: 1,
            question_type: "single_choice",
            content: {
              stem: { content_type: "text", text: "3+3等于几？", assets: [] },
              options: [
                { key: "A", content_type: "text", text: "5", assets: [] },
                { key: "B", content_type: "text", text: "6", assets: [] }
              ]
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

    const onNavigate = vi.fn();
    render(<PracticePanel api={api} onNavigate={onNavigate} />);

    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(screen.getByText("3+3等于几？")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "评论与质疑" }));

    expect(onNavigate).toHaveBeenCalledWith(
      "/app/questions/feedback?question_id=1301&question_version_id=3301&question_type=single_choice&stem=3%2B3%E7%AD%89%E4%BA%8E%E5%87%A0%EF%BC%9F&from=%2Fapp%2Fpractice"
    );
  });
});
