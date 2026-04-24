// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuestionPanel, type QuestionPanelApi } from "./question-panel";

afterEach(() => {
  cleanup();
});

describe("QuestionPanel", () => {
  it("lists questions and handles create plus version actions", async () => {
    const api: QuestionPanelApi = {
      listQuestions: vi.fn(async () => ({
        items: [
          {
            id: 1001,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            question_type: "single_choice",
            difficulty: "medium",
            current_version_id: 3001,
            current_version_no: 1,
            status: "active",
            source_type: "manual",
            creator_id: 1,
            bank_ids: [1]
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      })),
      createQuestion: vi.fn(async (body) => ({
        id: 1002,
        tenant_id: 1,
        owner_org_type: "school",
        owner_org_id: 1,
        current_version_id: 3002,
        current_version_no: 1,
        status: "active",
        source_type: "manual",
        creator_id: 1,
        bank_ids: body.bank_ids ?? [],
        question_type: body.question_type,
        difficulty: body.difficulty ?? undefined
      })),
      updateQuestion: vi.fn(async (id, body) => ({
        id,
        tenant_id: 1,
        owner_org_type: "school",
        owner_org_id: 1,
        question_type: "single_choice",
        difficulty: body.difficulty ?? "medium",
        current_version_id: 3001,
        current_version_no: 1,
        status: body.status ?? "active",
        source_type: "manual",
        creator_id: 1,
        bank_ids: [1]
      })),
      listQuestionVersions: vi.fn(async () => [
        {
          id: 3001,
          question_id: 1001,
          version_no: 1,
          content: {
            stem: { content_type: "text", text: "1+1等于几？", assets: [] }
          },
          answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
          analysis: { text: "基础算术" },
          structure_hash: "hash_1",
          change_summary: "初始版本",
          is_published: true,
          created_by: 1
        }
      ]),
      createQuestionVersion: vi.fn(async (id, body) => ({
        id: 3002,
        question_id: id,
        version_no: 2,
        content: body.content,
        answer: body.answer,
        analysis: body.analysis,
        structure_hash: "hash_2",
        change_summary: body.change_summary,
        is_published: true,
        created_by: 1
      }))
    };

    render(<QuestionPanel api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "题目管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("single_choice").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "新增题目" }));
    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "single_choice" } });
    fireEvent.change(screen.getByLabelText("难度"), { target: { value: "medium" } });
    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("题干"), { target: { value: "1+1等于几？" } });
    fireEvent.change(screen.getByLabelText("选项A"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("选项B"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("正确答案"), { target: { value: "B" } });
    fireEvent.click(screen.getAllByRole("button", { name: "新增题目" })[1]);

    await waitFor(() => {
      expect(api.createQuestion).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "详情" }));

    await waitFor(() => {
      expect(screen.getByText("版本 1")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("版本题干"), { target: { value: "1+1=？" } });
    fireEvent.change(screen.getByLabelText("版本正确答案"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("变更摘要"), { target: { value: "修复题干文案" } });
    fireEvent.click(screen.getByRole("button", { name: "新增版本" }));

    await waitFor(() => {
      expect(api.createQuestionVersion).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          change_summary: "修复题干文案"
        })
      );
    });
  });
});
