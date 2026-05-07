// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
            stem: { content_type: "text", text: "1+1等于几？", assets: [] },
            options: [
              { key: "A", content_type: "text", text: "1", assets: [] },
              { key: "B", content_type: "text", text: "2", assets: [] }
            ]
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
      })),
      listQuestionBanks: vi.fn(async () => ({
        items: [
          {
            id: 1,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            creator_id: 1,
            course_id: null,
            name: "题库-1",
            description: "",
            status: "active",
            source_type: "manual"
          }
        ],
        page: 1,
        page_size: 100,
        total: 1
      }))
    };

    render(<QuestionPanel api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "题目管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("单选题").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    const createModal = within(screen.getByLabelText("题目管理弹层"));
    fireEvent.change(createModal.getByLabelText("题型"), { target: { value: "single_choice" } });
    fireEvent.change(createModal.getByLabelText("难度"), { target: { value: "medium" } });
    fireEvent.change(createModal.getByLabelText("所属题库"), { target: { value: "1" } });
    fireEvent.change(createModal.getByLabelText("题干"), { target: { value: "1+1等于几？" } });
    fireEvent.change(createModal.getByLabelText("选项 A"), { target: { value: "1" } });
    fireEvent.change(createModal.getByLabelText("选项 B"), { target: { value: "2" } });
    fireEvent.click(createModal.getByRole("button", { name: "增加选项" }));
    fireEvent.change(createModal.getByLabelText("选项 C"), { target: { value: "3" } });
    fireEvent.click(createModal.getByRole("button", { name: "增加选项" }));
    fireEvent.change(createModal.getByLabelText("选项 D"), { target: { value: "4" } });
    fireEvent.click(createModal.getAllByRole("button", { name: "删除" })[3]);
    fireEvent.change(createModal.getByLabelText("正确答案"), { target: { value: "C" } });
    fireEvent.click(createModal.getByRole("button", { name: "新增题目" }));

    await waitFor(() => {
      expect(api.createQuestion).toHaveBeenCalled();
    });
    expect(api.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: { judge_mode: "by_option_key", correct_keys: ["C"] },
        content: expect.objectContaining({
          options: [
            expect.objectContaining({ key: "A", text: "1" }),
            expect.objectContaining({ key: "B", text: "2" }),
            expect.objectContaining({ key: "C", text: "3" })
          ]
        })
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "详情" }));

    await waitFor(() => {
      expect(screen.getByText("版本 1")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("版本题干"), { target: { value: "1+1=？" } });
    fireEvent.click(screen.getByRole("button", { name: "增加选项" }));
    fireEvent.change(screen.getByLabelText("选项 C"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("版本正确答案"), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText("变更摘要"), { target: { value: "修复题干文案" } });
    fireEvent.click(screen.getByRole("button", { name: "新增版本" }));

    await waitFor(() => {
      expect(api.createQuestionVersion).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          answer: { judge_mode: "by_option_key", correct_keys: ["C"] },
          content: expect.objectContaining({
            options: [
              expect.objectContaining({ key: "A", text: "1" }),
              expect.objectContaining({ key: "B", text: "2" }),
              expect.objectContaining({ key: "C", text: "3" })
            ]
          }),
          change_summary: "修复题干文案"
        })
      );
    });
  });
});
