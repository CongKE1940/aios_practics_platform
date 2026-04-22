// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PracticeHistoryPage,
  PracticeResultPage,
  PracticeSessionDetailPage,
  PracticeStateListPage,
  type PracticeReviewApi
} from "./practice-review-pages";

afterEach(() => {
  cleanup();
});

describe("practice review pages", () => {
  it("renders result summary and action buttons", async () => {
    const api: PracticeReviewApi = {
      listPracticeSessions: vi.fn(),
      getPracticeSessionResults: vi.fn(async () => ({
        session: {
          id: 501,
          practice_mode: "random",
          source_mode: "question_list",
          flow_mode: "fixed_count",
          bank_ids: [1, 2],
          status: "finished",
          total_count: 10,
          answered_count: 10,
          correct_count: 8,
          wrong_count: 2,
          accuracy: 0.8
        },
        questions: [
          {
            session_question_id: 9001,
            question_id: 1001,
            question_version_id: 3001,
            display_order: 1,
            question_type: "single_choice",
            content: {
              stem: { content_type: "text", text: "1+1等于几？", assets: [] }
            },
            correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
            is_correct: true,
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
          }
        ]
      })),
      createPracticeSessionFromQuestions: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticeResultPage api={api} sessionId={501} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题结果" })).toBeTruthy();
    });
    expect(screen.getByText(/本次共 10 题/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看本次明细" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "进入错题本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续练习" })).toBeTruthy();
  });

  it("renders history sessions and navigates to detail", async () => {
    const navigate = vi.fn();
    const api: PracticeReviewApi = {
      listPracticeSessions: vi.fn(async () => ({
        items: [
          {
            id: 501,
            practice_mode: "random",
            source_mode: "question_list",
            flow_mode: "fixed_count",
            bank_ids: [1, 2],
            status: "finished",
            total_count: 10,
            answered_count: 10,
            correct_count: 8,
            wrong_count: 2,
            accuracy: 0.8
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      })),
      getPracticeSessionResults: vi.fn(),
      createPracticeSessionFromQuestions: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticeHistoryPage api={api} onNavigate={navigate} />);

    await waitFor(() => {
      expect(screen.getByText("会话 #501")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    expect(navigate).toHaveBeenCalledWith("/app/practice/history/501");
  });

  it("renders state list and continues practice from loaded questions", async () => {
    const navigate = vi.fn();
    const practiceCreated = vi.fn();
    const api: PracticeReviewApi = {
      listPracticeSessions: vi.fn(),
      getPracticeSessionResults: vi.fn(),
      createPracticeSessionFromQuestions: vi.fn(async () => ({
        id: 777,
        tenant_id: 1,
        user_id: 7,
        practice_mode: "random",
        source_mode: "question_list",
        flow_mode: "fixed_count",
        bank_scope: { source_mode: "question_list" },
        bank_ids: [1],
        exclude_mastered: false,
        question_count: 10,
        random_seed: 20260422,
        round_no: 1,
        status: "active",
        questions: []
      })),
      listUserQuestionStates: vi.fn(async () => ({
        items: [
          {
            id: 1,
            tenant_id: 1,
            user_id: 7,
            question_id: 1001,
            question_version_id: 3001,
            question_type: "single_choice",
            content: {
              stem: { content_type: "text", text: "1+1等于几？", assets: [] }
            },
            practice_correct_count: 0,
            practice_wrong_count: 3,
            exam_wrong_count: 0,
            is_mastered: false,
            is_confused: true
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }))
    };

    render(
      <PracticeStateListPage
        api={api}
        stateType="wrong"
        bankId={1}
        onNavigate={navigate}
        onPracticeCreated={practiceCreated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "继续练习" }));

    await waitFor(() => {
      expect(api.createPracticeSessionFromQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          question_ids: [1001],
          practice_mode: "random",
          flow_mode: "fixed_count",
          question_count: 10,
          exclude_mastered: false
        })
      );
    });
    expect(practiceCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 777 }));
    expect(navigate).toHaveBeenCalledWith("/app/practice");
  });

  it("renders session detail answer, correct answer, analysis, and state", async () => {
    const api: PracticeReviewApi = {
      listPracticeSessions: vi.fn(),
      getPracticeSessionResults: vi.fn(async () => ({
        session: {
          id: 501,
          practice_mode: "random",
          source_mode: "question_list",
          flow_mode: "fixed_count",
          bank_ids: [1],
          status: "finished",
          total_count: 1,
          answered_count: 1,
          correct_count: 1,
          wrong_count: 0,
          accuracy: 1
        },
        questions: [
          {
            session_question_id: 9001,
            question_id: 1001,
            question_version_id: 3001,
            display_order: 1,
            question_type: "single_choice",
            content: {
              stem: { content_type: "text", text: "1+1等于几？", assets: [] }
            },
            answer: { selected_keys: ["B"] },
            correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
            is_correct: true,
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
              is_mastered: true,
              is_confused: false
            }
          }
        ]
      })),
      createPracticeSessionFromQuestions: vi.fn(),
      listUserQuestionStates: vi.fn()
    };

    render(<PracticeSessionDetailPage api={api} sessionId={501} />);

    await waitFor(() => {
      expect(screen.getByText("你的答案：B")).toBeTruthy();
    });
    expect(screen.getByText("正确答案：B")).toBeTruthy();
    expect(screen.getByText("解析：基础算术")).toBeTruthy();
    expect(screen.getByText("状态：非错题 / 已标熟 / 未标疑惑")).toBeTruthy();
  });
});
