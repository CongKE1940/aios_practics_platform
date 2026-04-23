// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExamDetail, ExamInput } from "@aios/api-sdk";

import { TeacherExamPage, type TeacherExamApi } from "./teacher-exam-page";

afterEach(() => {
  cleanup();
});

describe("TeacherExamPage", () => {
  it("creates a fixed exam draft and keeps the exam list visible", async () => {
    const createExam = vi.fn(async (body: ExamInput) => createExamDetail({ ...body, id: 2 }));
    const api = createExamApiMock({ createExam });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("期中测验")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("考试名称"), { target: { value: "单元测试" } });
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-04-24T09:00" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-04-24T10:00" } });
    fireEvent.change(screen.getByLabelText("考试时长"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("发布范围"), { target: { value: "class:301" } });
    fireEvent.change(screen.getByLabelText("固定题目"), { target: { value: "1001:3001:2:1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => {
      expect(createExam).toHaveBeenCalledWith({
        name: "单元测试",
        exam_mode: "fixed",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [{ target_type: "class", target_id: 301 }],
        fixed_questions: [{ question_id: 1001, question_version_id: 3001, score: 2, display_order: 1 }]
      });
      expect(screen.getByText("草稿已保存：单元测试")).toBeTruthy();
      expect(screen.getByText("期中测验")).toBeTruthy();
    });
  });

  it("creates a random assembly draft", async () => {
    const createExam = vi.fn(async (body: ExamInput) => createExamDetail({ ...body, id: 3 }));
    const api = createExamApiMock({ createExam });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("期中测验")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("考试名称"), { target: { value: "随机小测" } });
    fireEvent.change(screen.getByLabelText("组卷方式"), { target: { value: "random_assembly" } });
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-04-25T09:00" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-04-25T09:30" } });
    fireEvent.change(screen.getByLabelText("考试时长"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("发布范围"), { target: { value: "course:10" } });
    fireEvent.change(screen.getByLabelText("抽题规则"), { target: { value: "single_choice:2:10:1|2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => {
      expect(createExam).toHaveBeenCalledWith({
        name: "随机小测",
        exam_mode: "random_assembly",
        start_time: "2026-04-25T09:00:00+08:00",
        end_time: "2026-04-25T09:30:00+08:00",
        duration_minutes: 30,
        targets: [{ target_type: "course", target_id: 10 }],
        paper_rules: [{ question_type: "single_choice", score_per_question: 2, question_count: 10, bank_ids: [1, 2] }]
      });
    });
  });

  it("publishes a draft exam", async () => {
    const publishExam = vi.fn(async (id: number) =>
      createExamDetail({
        id,
        name: "期中测验",
        exam_mode: "fixed",
        status: "published",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [],
        fixed_questions: []
      })
    );
    const api = createExamApiMock({ publishExam });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(publishExam).toHaveBeenCalledWith(1);
      expect(screen.getByText("考试已发布：期中测验")).toBeTruthy();
    });
  });
});

function createExamApiMock(overrides: Partial<TeacherExamApi> = {}): TeacherExamApi {
  return {
    listExams: async () => ({
      items: [
        {
          id: 1,
          tenant_id: 1,
          name: "期中测验",
          exam_mode: "fixed",
          status: "draft",
          start_time: "2026-04-24T09:00:00+08:00",
          end_time: "2026-04-24T10:00:00+08:00",
          duration_minutes: 60
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    }),
    createExam: async (body) => createExamDetail({ ...body, id: 2 }),
    publishExam: async (id) =>
      createExamDetail({
        id,
        name: "期中测验",
        exam_mode: "fixed",
        status: "published",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [],
        fixed_questions: []
      }),
    ...overrides
  };
}

function createExamDetail(input: ExamInput & { id: number; status?: string }): ExamDetail {
  return {
    id: input.id,
    tenant_id: 1,
    name: input.name,
    exam_mode: input.exam_mode,
    status: input.status ?? "draft",
    start_time: input.start_time,
    end_time: input.end_time,
    duration_minutes: input.duration_minutes,
    targets: input.targets,
    fixed_questions: input.fixed_questions ?? [],
    paper_rules: input.paper_rules ?? []
  };
}
