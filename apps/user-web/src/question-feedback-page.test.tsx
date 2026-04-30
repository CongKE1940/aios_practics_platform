// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileAsset } from "@aios/api-sdk";

import { QuestionFeedbackPage, type QuestionFeedbackPageApi } from "./question-feedback-page";

afterEach(() => {
  cleanup();
});

function createApi(): QuestionFeedbackPageApi {
  return {
    createQuestionComment: vi.fn(async () => true),
    createQuestionChallenge: vi.fn(async () => true),
    uploadFile: vi.fn(async () => createFileAsset())
  };
}

function createFileAsset(overrides?: Partial<FileAsset>): FileAsset {
  return {
    id: 8001,
    source_type: "upload",
    object_key: "challenge/1.png",
    url: "https://cdn.example.com/challenge/1.png",
    status: "uploaded",
    ...overrides
  };
}

describe("QuestionFeedbackPage", () => {
  it("submits question comment", async () => {
    const api = createApi();

    render(
      <QuestionFeedbackPage
        api={api}
        path="/app/questions/feedback?question_id=1001&question_version_id=3001&question_type=single_choice&stem=1%2B1%E7%AD%89%E4%BA%8E%E5%87%A0%EF%BC%9F&from=%2Fapp%2Fpractice"
        onNavigate={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: "题目评论与质疑" })).toBeTruthy();
    expect(screen.getByText("1+1等于几？")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("评论内容"), { target: { value: "这题还可以补一个口算思路。" } });
    fireEvent.click(screen.getByRole("button", { name: "提交评论" }));

    await waitFor(() => {
      expect(api.createQuestionComment).toHaveBeenCalledWith(1001, {
        question_version_id: 3001,
        content: "这题还可以补一个口算思路。",
        comment_type: "discussion",
        is_private: false,
        parent_comment_id: null
      });
    });

    expect(screen.getByText("评论已提交。")).toBeTruthy();
    expect(screen.getByText("这题还可以补一个口算思路。")).toBeTruthy();
  });

  it("uploads attachments and submits question challenge", async () => {
    const api = createApi();

    render(
      <QuestionFeedbackPage
        api={api}
        path="/app/questions/feedback?question_id=1001&question_version_id=3001&question_type=single_choice&stem=1%2B1%E7%AD%89%E4%BA%8E%E5%87%A0%EF%BC%9F&from=%2Fapp%2Fpractice%2Fhistory%2F501"
        onNavigate={() => {}}
      />
    );

    const file = new File(["demo"], "proof.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("质疑附件"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(api.uploadFile).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("质疑类型"), { target: { value: "wrong_answer" } });
    fireEvent.change(screen.getByLabelText("质疑说明"), {
      target: { value: "答案应为 B，目前系统判定有误。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交质疑" }));

    await waitFor(() => {
      expect(api.createQuestionChallenge).toHaveBeenCalledWith(1001, {
        question_version_id: 3001,
        challenge_type: "wrong_answer",
        description: "答案应为 B，目前系统判定有误。",
        attachments: [{ url: "https://cdn.example.com/challenge/1.png", type: "image" }]
      });
    });

    expect(screen.getByText("质疑已提交。")).toBeTruthy();
    expect(screen.getByText("proof.png")).toBeTruthy();
  });

  it("returns to previous page when clicking back", () => {
    const api = createApi();
    const onNavigate = vi.fn();

    render(
      <QuestionFeedbackPage
        api={api}
        path="/app/questions/feedback?question_id=1001&question_version_id=3001&question_type=single_choice&stem=1%2B1%E7%AD%89%E4%BA%8E%E5%87%A0%EF%BC%9F&from=%2Fapp%2Fpractice%2Fhistory%2F501"
        onNavigate={onNavigate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    expect(onNavigate).toHaveBeenCalledWith("/app/practice/history/501");
  });
});
