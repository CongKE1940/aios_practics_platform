// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuestionBankPanel, type QuestionBankPanelApi } from "./question-bank-panel";

afterEach(() => {
  cleanup();
});

describe("QuestionBankPanel", () => {
  it("lists question banks and handles create publish visibility actions", async () => {
    const api: QuestionBankPanelApi = {
      listQuestionBanks: vi.fn(async () => ({
        items: [
          {
            id: 1,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            creator_id: 1,
            course_id: 10,
            name: "高一数学基础题库",
            description: "代数基础",
            status: "draft",
            source_type: "manual"
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      })),
      createQuestionBank: vi.fn(async (body) => ({
        id: 2,
        tenant_id: 1,
        owner_org_type: "school",
        owner_org_id: 1,
        creator_id: 1,
        status: "draft",
        source_type: "manual",
        ...body
      })),
      publishQuestionBank: vi.fn(async (id) => ({
        id,
        tenant_id: 1,
        owner_org_type: "school",
        owner_org_id: 1,
        creator_id: 1,
        course_id: 10,
        name: "高一数学基础题库",
        description: "代数基础",
        status: "active",
        source_type: "manual"
      })),
      assignQuestionBankVisibility: vi.fn(async () => true)
    };

    render(<QuestionBankPanel api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "题库管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("高一数学基础题库").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "新增题库" }));
    fireEvent.change(screen.getByLabelText("题库名称"), { target: { value: "高一数学提升题库" } });
    fireEvent.change(screen.getByLabelText("课程ID"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("题库说明"), { target: { value: "函数与导数" } });
    fireEvent.click(screen.getAllByRole("button", { name: "新增题库" })[1]);

    await waitFor(() => {
      expect(api.createQuestionBank).toHaveBeenCalledWith({
        name: "高一数学提升题库",
        course_id: 10,
        description: "函数与导数"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    fireEvent.click(screen.getByRole("button", { name: "发布题库" }));

    await waitFor(() => {
      expect(api.publishQuestionBank).toHaveBeenCalledWith(1);
    });

    fireEvent.change(screen.getByLabelText("下发目标类型"), { target: { value: "class" } });
    fireEvent.change(screen.getByLabelText("下发目标ID"), { target: { value: "301" } });
    fireEvent.change(screen.getByLabelText("下发用途"), { target: { value: "practice" } });
    fireEvent.click(screen.getByRole("button", { name: "下发题库" }));

    await waitFor(() => {
      expect(api.assignQuestionBankVisibility).toHaveBeenCalledWith(1, {
        grants: [
          {
            grant_type: "class",
            target_type: "class",
            target_id: 301,
            permission_type: "practice",
            inherit_to_children: false
          }
        ]
      });
    });
  });
});
