// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuestionEditorPanel } from "./question-editor-panel";
import type { QuestionPanelApi } from "./question-panel";

afterEach(() => {
  cleanup();
});

describe("QuestionEditorPanel", () => {
  it("edits versions with variable option count", async () => {
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
              { key: "B", content_type: "text", text: "2", assets: [] },
              { key: "C", content_type: "text", text: "3", assets: [] }
            ]
          },
          answer: { judge_mode: "by_option_key", correct_keys: ["C"] },
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

    render(<QuestionEditorPanel api={api} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("1+1等于几？")).toBeTruthy();
    });
    expect(screen.getByLabelText("选项 C")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "增加选项" }));
    fireEvent.change(screen.getByLabelText("选项 D"), { target: { value: "4" } });
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[3]);
    fireEvent.change(screen.getByLabelText("变更摘要"), { target: { value: "保留三项选项" } });
    fireEvent.click(screen.getByRole("button", { name: "保存为新版本" }));

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
          change_summary: "保留三项选项"
        })
      );
    });
  });
});
