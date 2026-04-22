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
});
