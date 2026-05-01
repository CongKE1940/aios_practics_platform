// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PageResult, Question, QuestionBank, QuestionBankInput, QuestionInput, QuestionListQuery } from "@aios/api-sdk";

import { TeacherQuestionBankPage, type TeacherQuestionBankApi } from "./teacher-question-bank-page";

afterEach(() => {
  cleanup();
});

describe("TeacherQuestionBankPage", () => {
  it("creates a bank with visibility and share grants", async () => {
    const createQuestionBank = vi.fn(async (body: QuestionBankInput) => createQuestionBankItem({ id: 2, ...body }));
    const api = createApiMock({
      listQuestionBanks: vi.fn(async () => createBankPage([])),
      createQuestionBank
    });

    render(<TeacherQuestionBankPage api={api} userType="teacher" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "创建题库" })).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("题库名称"), { target: { value: "函数专项题库" } });
    fireEvent.change(screen.getAllByLabelText("课程 ID")[0], { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("租户管理员可见"));
    fireEvent.click(screen.getByLabelText("共享给全部教师"));
    fireEvent.change(screen.getByLabelText("指定教师 ID"), { target: { value: "21,22" } });
    fireEvent.change(screen.getByLabelText("班级 ID"), { target: { value: "301" } });
    fireEvent.change(screen.getByLabelText("学生 ID"), { target: { value: "501" } });
    fireEvent.click(screen.getByRole("button", { name: "新建题库" }));

    await waitFor(() => {
      expect(createQuestionBank).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "函数专项题库",
          course_id: 10,
          visibility_grants: expect.arrayContaining([
            expect.objectContaining({ grant_type: "visibility", target_type: "student", target_id: 0, permission_type: "view" }),
            expect.objectContaining({ grant_type: "visibility", target_type: "tenant_admin", target_id: 0, permission_type: "view" }),
            expect.objectContaining({ grant_type: "share", target_type: "teacher", target_id: 0, permission_type: "share" }),
            expect.objectContaining({ grant_type: "share", target_type: "teacher", target_id: 21, permission_type: "share" }),
            expect.objectContaining({ grant_type: "share", target_type: "class", target_id: 301, permission_type: "practice" }),
            expect.objectContaining({ grant_type: "share", target_type: "student", target_id: 501, permission_type: "practice" })
          ])
        })
      );
    });
  });

  it("creates a question under the selected bank", async () => {
    const createQuestion = vi.fn(async (body: QuestionInput) => createQuestionItem(body));
    const api = createApiMock({
      listQuestionBanks: vi.fn(async () => createBankPage([createQuestionBankItem({ id: 1, name: "课堂题库", course_id: 10 })])),
      createQuestion
    });

    render(<TeacherQuestionBankPage api={api} userType="student" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "创建题目" })).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("题干"), { target: { value: "1+1 等于几？" } });
    fireEvent.change(screen.getByLabelText("选项 A"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("选项 B"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("正确答案"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "新建题目" }));

    await waitFor(() => {
      expect(createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          question_type: "single_choice",
          bank_ids: [1],
          course_ids: [10],
          answer: expect.objectContaining({ judge_mode: "by_option_key", correct_keys: ["B"] })
        })
      );
    });
  });
});

function createApiMock(overrides: Partial<TeacherQuestionBankApi> = {}): TeacherQuestionBankApi {
  return {
    listQuestionBanks: async () => createBankPage([]),
    createQuestionBank: async (body) => createQuestionBankItem({ id: 1, ...body }),
    publishQuestionBank: async (id) => createQuestionBankItem({ id, status: "active" }),
    listQuestions: async (_query?: QuestionListQuery) => createQuestionPage([]),
    createQuestion: async (body) => createQuestionItem(body),
    ...overrides
  };
}

function createBankPage(items: QuestionBank[]): PageResult<QuestionBank> {
  return { items, page: 1, page_size: 20, total: items.length };
}

function createQuestionPage(items: Question[]): PageResult<Question> {
  return { items, page: 1, page_size: 50, total: items.length };
}

function createQuestionBankItem(overrides: Partial<QuestionBank> & Partial<QuestionBankInput> = {}): QuestionBank {
  return {
    id: overrides.id ?? 1,
    tenant_id: 1,
    owner_org_type: "school",
    owner_org_id: 1,
    creator_id: 7,
    course_id: overrides.course_id ?? 10,
    name: overrides.name ?? "我的题库",
    description: overrides.description,
    status: overrides.status ?? "draft",
    source_type: "manual"
  };
}

function createQuestionItem(input: QuestionInput): Question {
  return {
    id: 1001,
    tenant_id: 1,
    owner_org_type: "school",
    owner_org_id: 1,
    question_type: input.question_type,
    difficulty: input.difficulty,
    current_version_id: 3001,
    current_version_no: 1,
    current_content: input.content,
    status: "active",
    source_type: "manual",
    creator_id: 7,
    bank_ids: input.bank_ids,
    course_ids: input.course_ids
  };
}
