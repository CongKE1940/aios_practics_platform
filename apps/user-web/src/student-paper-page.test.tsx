// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ExamAttemptAnswerInput,
  ExamInput,
  ExamPaperPracticeRecord,
  PracticeSessionFromQuestionsInput
} from "@aios/api-sdk";

import { StudentPaperPage, type StudentPaperApi } from "./student-paper-page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudentPaperPage", () => {
  it("loads public papers and creates paper practice", async () => {
    const createPracticeSessionFromQuestions = vi.fn(async (_body: PracticeSessionFromQuestionsInput) => createPracticeSession());
    const onPracticeCreated = vi.fn();
    const onNavigate = vi.fn();

    render(
      <StudentPaperPage
        api={createStudentPaperApiMock({ createPracticeSessionFromQuestions })}
        onPracticeCreated={onPracticeCreated}
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("函数公开试卷")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看试卷" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "函数公开试卷" })).toBeTruthy();
      expect(screen.getByText(/1\+1等于几/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "按试卷练习" }));

    await waitFor(() => {
      expect(createPracticeSessionFromQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          question_ids: [101],
          practice_mode: "sequential",
          flow_mode: "fixed_count",
          question_count: 1
        })
      );
      expect(onPracticeCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 501 }));
      expect(onNavigate).toHaveBeenCalledWith("/app/practice");
    });
  });

  it("starts a paper self-test, submits answers, and shows records", async () => {
    const createExam = vi.fn(async (body: ExamInput) => createExamDetail(body));
    const saveExamAttemptAnswer = vi.fn(async (_id: number, body: ExamAttemptAnswerInput) => ({
      attempt_id: 801,
      question_id: 101,
      question_version_id: 1001,
      display_order: body.display_order,
      answer: body.answer,
      score: 0
    }));
    const submitExamAttempt = vi.fn(async () => createAttemptResult());
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <StudentPaperPage
        api={createStudentPaperApiMock({ createExam, saveExamAttemptAnswer, submitExamAttempt })}
        onPracticeCreated={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("函数公开试卷")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看试卷" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "开始试卷测试" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "开始试卷测试" }));

    await waitFor(() => {
      const answerRegion = screen.getByLabelText("试卷测试作答区");
      expect(answerRegion).toBeTruthy();
      expect(within(answerRegion).getByText(/1\+1等于几/)).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText("选项 A"));
    fireEvent.click(screen.getByRole("button", { name: "保存答案" }));

    await waitFor(() => {
      expect(saveExamAttemptAnswer).toHaveBeenCalledWith(801, {
        display_order: 1,
        answer: { selected_keys: ["A"] }
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "交卷" }));

    await waitFor(() => {
      expect(submitExamAttempt).toHaveBeenCalledWith(801);
      expect(screen.getByRole("heading", { name: "测试成绩" })).toBeTruthy();
      expect(screen.getByText("本次测试已交卷，成绩已写入试卷记录。")).toBeTruthy();
    });
    expect(createExam).toHaveBeenCalledWith(
      expect.objectContaining({
        exam_mode: "paper",
        paper_id: 701,
        duration_minutes: 60
      })
    );
  });
});

function createStudentPaperApiMock(overrides: Partial<StudentPaperApi> = {}): StudentPaperApi {
  return {
    listExamPapers: async () => ({
      items: [createPaper()],
      page: 1,
      page_size: 10,
      total: 1
    }),
    getExamPaper: async () => createPaperDetail(),
    listExamPaperPracticeRecords: async () => ({
      items: [createRecord()],
      page: 1,
      page_size: 20,
      total: 1
    }),
    createExam: async (body) => createExamDetail(body),
    publishExam: async (id) => ({ ...createExamDetail({ name: "函数公开试卷 自测", exam_mode: "paper", paper_id: 701 }), id, status: "published" }),
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
    createPracticeSessionFromQuestions: async () => createPracticeSession(),
    ...overrides
  };
}

function createPaper() {
  return {
    id: 701,
    tenant_id: 1,
    creator_id: 7,
    paper_type: "fixed",
    paper_name: "函数公开试卷",
    source_type: "manual",
    status: "published",
    total_score: 10,
    question_count: 1,
    created_at: "2026-04-24T09:00:00+08:00",
    updated_at: "2026-04-24T09:00:00+08:00"
  };
}

function createPaperDetail() {
  return {
    ...createPaper(),
    questions: [
      {
        question_id: 101,
        question_version_id: 1001,
        question_type: "single_choice",
        score: 10,
        display_order: 1,
        content: {
          stem: { text: "1+1等于几？" },
          options: [
            { key: "A", text: "2" },
            { key: "B", text: "3" }
          ]
        },
        answer: { judge_mode: "single", correct_keys: ["A"] },
        analysis: { text: "基础加法。" }
      }
    ],
    paper_rules: []
  };
}

function createRecord(): ExamPaperPracticeRecord {
  return {
    exam_id: 302,
    attempt_id: 801,
    paper_id: 701,
    exam_name: "函数公开试卷 自测",
    paper_name: "函数公开试卷",
    status: "submitted",
    duration_minutes: 60,
    total_score: 10,
    objective_score: 10,
    subjective_score: 0,
    final_score: 10,
    start_at: "2026-04-24T09:00:00+08:00",
    submit_at: "2026-04-24T09:10:00+08:00"
  };
}

function createExamDetail(input: Partial<ExamInput> = {}) {
  return {
    id: 302,
    tenant_id: 1,
    owner_org_type: "user",
    owner_org_id: 10001,
    creator_id: 10001,
    name: input.name ?? "函数公开试卷 自测",
    exam_mode: input.exam_mode ?? "paper",
    paper_id: input.paper_id ?? 701,
    status: "draft",
    start_time: input.start_time ?? "2026-04-24T09:00:00+08:00",
    end_time: input.end_time ?? "2026-05-24T09:00:00+08:00",
    duration_minutes: input.duration_minutes ?? 60,
    total_score: 10,
    targets: input.targets ?? [{ target_type: "user", target_id: 10001 }],
    fixed_questions: [],
    paper_rules: [],
    paper: createPaperDetail()
  };
}

function createAttemptDetail() {
  return {
    attempt: {
      id: 801,
      exam_id: 302,
      paper_id: 701,
      tenant_id: 1,
      user_id: 10001,
      status: "in_progress",
      objective_score: 0,
      subjective_score: 0,
      final_score: 0,
      start_at: "2026-04-24T09:00:00+08:00"
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

function createAttemptResult() {
  return {
    attempt: {
      ...createAttemptDetail().attempt,
      status: "submitted",
      objective_score: 10,
      final_score: 10
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

function createPracticeSession() {
  return {
    id: 501,
    tenant_id: 1,
    user_id: 10001,
    practice_mode: "sequential",
    source_mode: "question_list",
    flow_mode: "fixed_count",
    bank_scope: {},
    bank_ids: [],
    exclude_mastered: false,
    question_count: 1,
    random_seed: 0,
    round_no: 1,
    status: "active",
    questions: []
  };
}
