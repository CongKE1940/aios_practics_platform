// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UserApp } from "./app";

afterEach(() => {
  cleanup();
});

describe("UserApp", () => {
  it("renders the learner shell", () => {
    render(<UserApp />);

    expect(screen.getByRole("heading", { name: "AIOS 学生端" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "班级学习" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "练题记录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "错题本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "熟题本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "疑惑题" })).toBeTruthy();
  });

  it("queries class learning analytics from the learner shell", async () => {
    render(
      <UserApp
        practiceApi={{
          ...createPracticeApiMock(),
          getClassPracticeSummary: async () => ({
            summary: {
              class_id: 301,
              class_name: "七年级一班",
              course_id: 10,
              course_name: "数学",
              student_count: 2,
              participated_student_count: 1,
              session_count: 3,
              answered_count: 20,
              correct_count: 16,
              wrong_count: 4,
              accuracy: 0.8,
              wrong_question_count: 2,
              confused_question_count: 1,
              last_practiced_at: "2026-04-22T10:00:00+08:00"
            },
            students: {
              items: [
                {
                  student_id: 7,
                  student_name: "李同学",
                  student_no: "stu_007",
                  session_count: 2,
                  answered_count: 12,
                  correct_count: 9,
                  wrong_count: 3,
                  accuracy: 0.75,
                  wrong_question_count: 2,
                  confused_question_count: 1,
                  last_practiced_at: "2026-04-22T10:00:00+08:00"
                }
              ],
              page: 1,
              page_size: 20,
              total: 1
            }
          })
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "班级学习" }));
    fireEvent.change(screen.getByLabelText("班级ID"), { target: { value: "301" } });
    fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "班级学习" })).toBeTruthy();
      expect(screen.getByText("七年级一班 / 数学")).toBeTruthy();
      expect(screen.getByText("李同学")).toBeTruthy();
      expect(screen.getByText("正确率：75%")).toBeTruthy();
    });
  });

  it("opens practice panel after selecting practice menu", async () => {
    render(
      <UserApp
        practiceApi={{
          createPracticeSession: async () => ({
            id: 501,
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
            questions: []
          }),
          getPracticeSession: async () => ({
            id: 501,
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
            questions: []
          }),
          nextPracticeQuestion: async () => ({
            question: {
              session_question_id: 9001,
              session_id: 501,
              question_id: 1001,
              question_version_id: 3001,
              display_order: 1,
              question_type: "single_choice",
              content: {},
              round_no: 1,
              answered: false
            },
            round_no: 1
          }),
          submitPracticeAnswer: async () => ({
            is_correct: true,
            correct_answer: {},
            analysis: {},
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
          }),
          finishPracticeSession: async () => ({
            id: 501,
            status: "finished",
            answered_count: 0,
            correct_count: 0,
            wrong_count: 0
          }),
          listPracticeSessions: async () => ({
            items: [],
            page: 1,
            page_size: 20,
            total: 0
          }),
          getPracticeSessionResults: async () => ({
            session: {
              id: 501,
              practice_mode: "random",
              source_mode: "question_list",
              flow_mode: "fixed_count",
              bank_ids: [1],
              status: "finished",
              total_count: 0,
              answered_count: 0,
              correct_count: 0,
              wrong_count: 0,
              accuracy: 0
            },
            questions: []
          }),
          createPracticeSessionFromQuestions: async () => ({
            id: 502,
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
          }),
          markPracticeQuestionMastered: async () => ({
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
          }),
          markPracticeQuestionConfused: async () => ({
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
          }),
          listUserQuestionStates: async () => ({
            items: [],
            page: 1,
            page_size: 20,
            total: 0
          })
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "练题中心" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题中心" })).toBeTruthy();
    });
  });

  it("navigates to result page after finishing practice", async () => {
    render(
      <UserApp
        practiceApi={{
          createPracticeSession: async () => ({
            id: 501,
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
          }),
          getPracticeSession: async () => ({
            id: 501,
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
            questions: []
          }),
          nextPracticeQuestion: async () => ({
            question: {
              session_question_id: 9002,
              session_id: 501,
              question_id: 1002,
              question_version_id: 3002,
              display_order: 2,
              question_type: "single_choice",
              content: {},
              round_no: 1,
              answered: false
            },
            round_no: 1
          }),
          submitPracticeAnswer: async () => ({
            is_correct: true,
            correct_answer: {},
            analysis: {},
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
          }),
          finishPracticeSession: async () => ({
            id: 501,
            status: "finished",
            answered_count: 1,
            correct_count: 1,
            wrong_count: 0
          }),
          listPracticeSessions: async () => ({ items: [], page: 1, page_size: 20, total: 0 }),
          getPracticeSessionResults: async () => ({
            session: {
              id: 501,
              practice_mode: "random",
              source_mode: "single_bank",
              flow_mode: "fixed_count",
              bank_ids: [1],
              status: "finished",
              total_count: 1,
              answered_count: 1,
              correct_count: 1,
              wrong_count: 0,
              accuracy: 1
            },
            questions: []
          }),
          createPracticeSessionFromQuestions: async () => ({
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
          }),
          markPracticeQuestionMastered: async () => ({
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
          }),
          markPracticeQuestionConfused: async () => ({
            id: 1,
            tenant_id: 1,
            user_id: 7,
            question_id: 1001,
            question_version_id: 3001,
            practice_correct_count: 1,
            practice_wrong_count: 0,
            exam_wrong_count: 0,
            is_mastered: false,
            is_confused: true
          }),
          listUserQuestionStates: async () => ({ items: [], page: 1, page_size: 20, total: 0 })
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "练题中心" }));
    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "退出练题" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题结果" })).toBeTruthy();
    });
  });

  it("navigates to review pages from the learner shell", async () => {
    render(
      <UserApp
        practiceApi={{
          createPracticeSession: async () => ({
            id: 501,
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
            questions: []
          }),
          getPracticeSession: async () => ({
            id: 501,
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
            questions: []
          }),
          nextPracticeQuestion: async () => ({
            question: {
              session_question_id: 9001,
              session_id: 501,
              question_id: 1001,
              question_version_id: 3001,
              display_order: 1,
              question_type: "single_choice",
              content: {},
              round_no: 1,
              answered: false
            },
            round_no: 1
          }),
          submitPracticeAnswer: async () => ({
            is_correct: true,
            correct_answer: {},
            analysis: {},
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
          }),
          finishPracticeSession: async () => ({
            id: 501,
            status: "finished",
            answered_count: 0,
            correct_count: 0,
            wrong_count: 0
          }),
          listPracticeSessions: async () => ({
            items: [
              {
                id: 501,
                practice_mode: "random",
                source_mode: "question_list",
                flow_mode: "fixed_count",
                bank_ids: [1],
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
          }),
          getPracticeSessionResults: async () => ({
            session: {
              id: 501,
              practice_mode: "random",
              source_mode: "question_list",
              flow_mode: "fixed_count",
              bank_ids: [1],
              status: "finished",
              total_count: 10,
              answered_count: 10,
              correct_count: 8,
              wrong_count: 2,
              accuracy: 0.8
            },
            questions: []
          }),
          createPracticeSessionFromQuestions: async () => ({
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
          }),
          markPracticeQuestionMastered: async () => ({
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
          }),
          markPracticeQuestionConfused: async () => ({
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
          }),
          listUserQuestionStates: async () => ({
            items: [
              {
                id: 1,
                tenant_id: 1,
                user_id: 7,
                question_id: 1001,
                question_version_id: 3001,
                practice_correct_count: 0,
                practice_wrong_count: 1,
                exam_wrong_count: 0,
                is_mastered: false,
                is_confused: false
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          })
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "练题记录" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题记录" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "错题本" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "错题本" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "熟题本" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "熟题本" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "疑惑题" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "疑惑题" })).toBeTruthy();
    });
  });
});

function createPracticeApiMock() {
  return {
    createPracticeSession: async () => ({
      id: 501,
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
      questions: []
    }),
    getPracticeSession: async () => ({
      id: 501,
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
      questions: []
    }),
    nextPracticeQuestion: async () => ({
      question: {
        session_question_id: 9001,
        session_id: 501,
        question_id: 1001,
        question_version_id: 3001,
        display_order: 1,
        question_type: "single_choice",
        content: {},
        round_no: 1,
        answered: false
      },
      round_no: 1
    }),
    submitPracticeAnswer: async () => ({
      is_correct: true,
      correct_answer: {},
      analysis: {},
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
    }),
    finishPracticeSession: async () => ({
      id: 501,
      status: "finished",
      answered_count: 0,
      correct_count: 0,
      wrong_count: 0
    }),
    listPracticeSessions: async () => ({
      items: [],
      page: 1,
      page_size: 20,
      total: 0
    }),
    getPracticeSessionResults: async () => ({
      session: {
        id: 501,
        practice_mode: "random",
        source_mode: "question_list",
        flow_mode: "fixed_count",
        bank_ids: [1],
        status: "finished",
        total_count: 0,
        answered_count: 0,
        correct_count: 0,
        wrong_count: 0,
        accuracy: 0
      },
      questions: []
    }),
    createPracticeSessionFromQuestions: async () => ({
      id: 502,
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
    }),
    markPracticeQuestionMastered: async () => ({
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
    }),
    markPracticeQuestionConfused: async () => ({
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
    }),
    listUserQuestionStates: async () => ({
      items: [],
      page: 1,
      page_size: 20,
      total: 0
    })
  };
}
