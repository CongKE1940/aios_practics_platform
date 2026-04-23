// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExamAttemptReviewResult, ExamDetail, ExamInput, ExamOverviewResult } from "@aios/api-sdk";

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

  it("loads exam detail and shows fixed paper preview", async () => {
    const getExam = vi.fn(async (id: number) =>
      createExamDetail({
        id,
        name: "期中测验",
        exam_mode: "fixed",
        status: "draft",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [{ target_type: "class", target_id: 301 }],
        fixed_questions: [
          { question_id: 1001, question_version_id: 3001, score: 2, display_order: 1 },
          { question_id: 1002, question_version_id: 3002, score: 3, display_order: 2 }
        ]
      })
    );
    const api = createExamApiMock({ getExam });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(getExam).toHaveBeenCalledWith(1);
      expect(screen.getByRole("heading", { name: "考试详情" })).toBeTruthy();
      expect(screen.getByText("发布范围：class:301")).toBeTruthy();
      expect(screen.getByText("第 1 题")).toBeTruthy();
      expect(screen.getByText("题目 1001 / 版本 3001 / 2 分")).toBeTruthy();
      expect(screen.getByText("第 2 题")).toBeTruthy();
      expect(screen.getByText("题目 1002 / 版本 3002 / 3 分")).toBeTruthy();
    });
  });

  it("loads exam overview statistics and score list", async () => {
    const getExamOverview = vi.fn(async (): Promise<ExamOverviewResult> => ({
      summary: {
        exam_id: 1,
        exam_name: "期中测验",
        exam_mode: "fixed",
        status: "published",
        duration_minutes: 60,
        total_score: 100,
        student_count: 2,
        participated_student_count: 1,
        submitted_count: 1,
        in_progress_count: 0,
        absent_count: 1,
        average_score: 86,
        highest_score: 86,
        lowest_score: 86
      },
      students: {
        items: [
          {
            student_user_id: 501,
            student_name: "张三",
            student_no: "S001",
            class_name: "七年级一班",
            attempt_id: 8001,
            attempt_status: "submitted",
            review_status: "reviewed",
            final_score: 86,
            objective_score: 86,
            subjective_score: 0
          },
          {
            student_user_id: 502,
            student_name: "李四",
            student_no: "S002",
            class_name: "七年级一班",
            attempt_status: "not_started",
            review_status: "not_started"
          }
        ],
        page: 1,
        page_size: 20,
        total: 2
      }
    }));
    const api = createExamApiMock({ getExamOverview });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(getExamOverview).toHaveBeenCalledWith({ exam_id: 1, page: 1, page_size: 20 });
      expect(screen.getByText("应参加人数：2")).toBeTruthy();
      expect(screen.getByText("已交卷：1")).toBeTruthy();
      expect(screen.getByText("平均分：86")).toBeTruthy();
      expect(screen.getByText("张三")).toBeTruthy();
      expect(screen.getByText("状态：已交卷")).toBeTruthy();
      expect(screen.getByText("状态：未开始")).toBeTruthy();
      expect(screen.getByText("批阅：已批阅")).toBeTruthy();
    });
  });

  it("filters exam overview list and exports current filtered csv", async () => {
    const getExamOverview = vi
      .fn<() => Promise<ExamOverviewResult>>()
      .mockResolvedValueOnce({
        summary: {
          exam_id: 1,
          exam_name: "期中测验",
          exam_mode: "fixed",
          status: "published",
          duration_minutes: 60,
          total_score: 100,
          student_count: 2,
          participated_student_count: 1,
          submitted_count: 1,
          in_progress_count: 0,
          absent_count: 1,
          average_score: 86,
          highest_score: 86,
          lowest_score: 86
        },
        students: {
          items: [],
          page: 1,
          page_size: 20,
          total: 0
        }
      })
      .mockResolvedValueOnce({
        summary: {
          exam_id: 1,
          exam_name: "期中测验",
          exam_mode: "fixed",
          status: "published",
          duration_minutes: 60,
          total_score: 100,
          student_count: 2,
          participated_student_count: 1,
          submitted_count: 1,
          in_progress_count: 0,
          absent_count: 1,
          average_score: 60,
          highest_score: 60,
          lowest_score: 60
        },
        students: {
          items: [
            {
              student_user_id: 501,
              student_name: "张三",
              student_no: "S001",
              class_name: "七年级一班",
              attempt_id: 8001,
              attempt_status: "submitted",
              review_status: "pending",
              final_score: 60,
              objective_score: 60,
              subjective_score: 0
            }
          ],
          page: 1,
          page_size: 20,
          total: 1
        }
      });
    const exportExamOverviewCsv = vi.fn(async () => "学生姓名,学号\n张三,S001\n");
    const createObjectURL = vi.fn(() => "blob:exam-overview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

    const api = createExamApiMock({ getExamOverview, exportExamOverviewCsv });
    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(getExamOverview).toHaveBeenCalledWith({ exam_id: 1, page: 1, page_size: 20 });
    });

    fireEvent.change(screen.getByLabelText("作答状态筛选"), { target: { value: "submitted" } });
    fireEvent.change(screen.getByLabelText("批阅状态筛选"), { target: { value: "pending" } });
    fireEvent.change(screen.getByLabelText("学生搜索"), { target: { value: "张" } });
    fireEvent.click(screen.getByRole("button", { name: "查询成绩" }));

    await waitFor(() => {
      expect(getExamOverview).toHaveBeenLastCalledWith({
        exam_id: 1,
        attempt_status: "submitted",
        review_status: "pending",
        keyword: "张",
        page: 1,
        page_size: 20
      });
      expect(screen.getByText("批阅：待批阅")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出 CSV" }));

    await waitFor(() => {
      expect(exportExamOverviewCsv).toHaveBeenCalledWith({
        exam_id: 1,
        attempt_status: "submitted",
        review_status: "pending",
        keyword: "张",
        page: 1,
        page_size: 20
      });
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    });
  });

  it("loads selected student attempt review and shows question detail", async () => {
    const getExamOverview = vi.fn(async (): Promise<ExamOverviewResult> => ({
      summary: {
        exam_id: 1,
        exam_name: "期中测验",
        exam_mode: "fixed",
        status: "published",
        duration_minutes: 60,
        total_score: 100,
        student_count: 1,
        participated_student_count: 1,
        submitted_count: 1,
        in_progress_count: 0,
        absent_count: 0,
        average_score: 86,
        highest_score: 86,
        lowest_score: 86
      },
      students: {
        items: [
          {
            student_user_id: 501,
            student_name: "张三",
            student_no: "S001",
            class_name: "七年级一班",
            attempt_id: 8001,
            attempt_status: "submitted",
            review_status: "reviewed",
            final_score: 86,
            objective_score: 86,
            subjective_score: 0
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }
    }));
    const getExamAttemptReview = vi.fn(async (): Promise<ExamAttemptReviewResult> => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        student_no: "S001",
        class_name: "七年级一班",
        attempt_status: "submitted",
        objective_score: 86,
        subjective_score: 0,
        final_score: 86
      },
      questions: [
        {
          question_id: 1001,
          question_version_id: 3001,
          display_order: 1,
          question_type: "single_choice",
          score: 10,
          content: {
            stem: { text: "1+1等于几？" },
            options: [
              { key: "A", text: "1" },
              { key: "B", text: "2" }
            ]
          },
          correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
          student_answer: { selected_keys: ["B"] },
          is_answered: true,
          is_correct: true,
          answer_score: 10
        },
        {
          question_id: 1002,
          question_version_id: 3002,
          display_order: 2,
          question_type: "single_choice",
          score: 10,
          content: {
            stem: { text: "2+2等于几？" },
            options: [
              { key: "A", text: "3" },
              { key: "B", text: "4" }
            ]
          },
          correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
          student_answer: { selected_keys: ["A"] },
          is_answered: true,
          is_correct: false,
          answer_score: 0
        }
      ]
    }));
    const api = createExamApiMock({ getExamOverview, getExamAttemptReview });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看答卷" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看答卷" }));

    await waitFor(() => {
      expect(getExamAttemptReview).toHaveBeenCalledWith({ attempt_id: 8001 });
      expect(screen.getByRole("heading", { name: "学生答卷" })).toBeTruthy();
      expect(screen.getByText("学生：张三")).toBeTruthy();
      expect(screen.getByText("题干：1+1等于几？")).toBeTruthy();
      expect(screen.getByText("学生答案：B")).toBeTruthy();
      expect(screen.getByText("正确答案：B")).toBeTruthy();
      expect(screen.getByText("得分：10 / 10")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "第 2 题" }));

    await waitFor(() => {
      expect(screen.getByText("题干：2+2等于几？")).toBeTruthy();
      expect(screen.getByText("学生答案：A")).toBeTruthy();
      expect(screen.getByText("结果：错误")).toBeTruthy();
    });
  });

  it("supports manual scoring for subjective exam question", async () => {
    const getExamOverview = vi.fn(async (): Promise<ExamOverviewResult> => ({
      summary: {
        exam_id: 1,
        exam_name: "期中测验",
        exam_mode: "fixed",
        status: "published",
        duration_minutes: 60,
        total_score: 100,
        student_count: 1,
        participated_student_count: 1,
        submitted_count: 1,
        in_progress_count: 0,
        absent_count: 0,
        average_score: 60,
        highest_score: 60,
        lowest_score: 60
      },
      students: {
        items: [
          {
            student_user_id: 501,
            student_name: "张三",
            student_no: "S001",
            class_name: "七年级一班",
            attempt_id: 8001,
            attempt_status: "submitted",
            review_status: "pending",
            final_score: 60,
            objective_score: 60,
            subjective_score: 0
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }
    }));
    const getExamAttemptReview = vi.fn(async (): Promise<ExamAttemptReviewResult> => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        student_no: "S001",
        class_name: "七年级一班",
        attempt_status: "submitted",
        objective_score: 60,
        subjective_score: 0,
        final_score: 60
      },
      questions: [
        {
          question_id: 1002,
          question_version_id: 3002,
          display_order: 2,
          question_type: "short_answer",
          score: 10,
          content: { stem: { text: "解释勾股定理。" } },
          correct_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
          student_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
          is_answered: true,
          answer_score: 0,
          judge_source: "manual"
        }
      ]
    }));
    const reviewExamAttemptQuestion = vi.fn(async () => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        student_no: "S001",
        class_name: "七年级一班",
        attempt_status: "submitted",
        objective_score: 60,
        subjective_score: 8,
        final_score: 68
      },
      question: {
        question_id: 1002,
        question_version_id: 3002,
        display_order: 2,
        question_type: "short_answer",
        score: 10,
        content: { stem: { text: "解释勾股定理。" } },
        correct_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
        student_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
        is_answered: true,
        answer_score: 8,
        judge_source: "manual",
        review_comment: "概念正确，但表述不够完整。",
        reviewer_user_id: 7
      }
    }));
    const api = createExamApiMock({ getExamOverview, getExamAttemptReview, reviewExamAttemptQuestion });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看答卷" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看答卷" }));

    await waitFor(() => {
      expect(screen.getByLabelText("主观题得分")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("主观题得分"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("批阅评语"), { target: { value: "概念正确，但表述不够完整。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存批阅" }));

    await waitFor(() => {
      expect(reviewExamAttemptQuestion).toHaveBeenCalledWith({
        attempt_id: 8001,
        display_order: 2,
        score: 8,
        review_comment: "概念正确，但表述不够完整。"
      });
      expect(screen.getByText("得分：8 / 10")).toBeTruthy();
      expect(screen.getByText("主观题：8")).toBeTruthy();
      expect(screen.getByText("总分：68")).toBeTruthy();
    });
  });

  it("focuses pending subjective questions and continues review in pending-only mode", async () => {
    const getExamOverview = vi.fn(async (): Promise<ExamOverviewResult> => ({
      summary: {
        exam_id: 1,
        exam_name: "期中测验",
        exam_mode: "fixed",
        status: "published",
        duration_minutes: 60,
        total_score: 100,
        student_count: 1,
        participated_student_count: 1,
        submitted_count: 1,
        in_progress_count: 0,
        absent_count: 0,
        average_score: 60,
        highest_score: 60,
        lowest_score: 60
      },
      students: {
        items: [
          {
            student_user_id: 501,
            student_name: "张三",
            student_no: "S001",
            class_name: "七年级一班",
            attempt_id: 8001,
            attempt_status: "submitted",
            review_status: "pending",
            final_score: 60,
            objective_score: 60,
            subjective_score: 0
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }
    }));
    const getExamAttemptReview = vi.fn(async (): Promise<ExamAttemptReviewResult> => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        student_no: "S001",
        class_name: "七年级一班",
        attempt_status: "submitted",
        objective_score: 60,
        subjective_score: 0,
        final_score: 60
      },
      questions: [
        {
          question_id: 1001,
          question_version_id: 3001,
          display_order: 1,
          question_type: "single_choice",
          score: 10,
          content: { stem: { text: "1+1等于几？" }, options: [{ key: "A", text: "1" }, { key: "B", text: "2" }] },
          correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
          student_answer: { selected_keys: ["B"] },
          is_answered: true,
          is_correct: true,
          answer_score: 10,
          judge_source: "auto"
        },
        {
          question_id: 1002,
          question_version_id: 3002,
          display_order: 2,
          question_type: "essay",
          score: 10,
          content: { stem: { text: "解释勾股定理（第一问）。" } },
          correct_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
          student_answer: { text: "第一问答案" },
          is_answered: true,
          answer_score: 0,
          judge_source: "manual"
        },
        {
          question_id: 1003,
          question_version_id: 3003,
          display_order: 3,
          question_type: "short_answer",
          score: 10,
          content: { stem: { text: "解释勾股定理（第二问）。" } },
          correct_answer: { text: "第二问标准答案" },
          student_answer: { text: "第二问答案" },
          is_answered: true,
          answer_score: 0,
          judge_source: "manual"
        }
      ]
    }));
    const reviewExamAttemptQuestion = vi.fn(async () => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        student_no: "S001",
        class_name: "七年级一班",
        attempt_status: "submitted",
        objective_score: 60,
        subjective_score: 8,
        final_score: 68
      },
      question: {
        question_id: 1002,
        question_version_id: 3002,
        display_order: 2,
        question_type: "essay",
        score: 10,
        content: { stem: { text: "解释勾股定理（第一问）。" } },
        correct_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
        student_answer: { text: "第一问答案" },
        is_answered: true,
        answer_score: 8,
        judge_source: "manual",
        review_comment: "第一问已批阅。",
        reviewer_user_id: 7
      }
    }));
    const api = createExamApiMock({ getExamOverview, getExamAttemptReview, reviewExamAttemptQuestion });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看答卷" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看答卷" }));

    await waitFor(() => {
      expect(screen.getByText("主观题进度：0 / 2 已批阅，2 题待批阅")).toBeTruthy();
      expect(screen.getByText("题干：解释勾股定理（第一问）。")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("只看待批阅"));
    fireEvent.change(screen.getByLabelText("主观题得分"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("批阅评语"), { target: { value: "第一问已批阅。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存批阅" }));

    await waitFor(() => {
      expect(reviewExamAttemptQuestion).toHaveBeenCalledWith({
        attempt_id: 8001,
        display_order: 2,
        score: 8,
        review_comment: "第一问已批阅。"
      });
      expect(screen.getByText("题干：解释勾股定理（第二问）。")).toBeTruthy();
      expect(screen.getByText("主观题进度：1 / 2 已批阅，1 题待批阅")).toBeTruthy();
    });
  });

  it("keeps opened review context when loading or saving review fails", async () => {
    const getExamAttemptReview = vi
      .fn()
      .mockResolvedValueOnce(createManualAttemptReview("解释勾股定理。"))
      .mockRejectedValueOnce(new Error("network"));
    const reviewExamAttemptQuestion = vi.fn().mockRejectedValueOnce(new Error("timeout"));
    const api = createExamApiMock({
      getExamOverview: async () => createOverviewWithReviewStudent(),
      getExamAttemptReview,
      reviewExamAttemptQuestion
    });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看答卷" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看答卷" }));

    await waitFor(() => {
      expect(screen.getByText("题干：解释勾股定理。")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("主观题得分"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("批阅评语"), { target: { value: "需要补充证明过程。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存批阅" }));

    await waitFor(() => {
      expect(screen.getByText("批阅保存失败，请重试。")).toBeTruthy();
      expect((screen.getByLabelText("主观题得分") as HTMLInputElement).value).toBe("7");
      expect((screen.getByLabelText("批阅评语") as HTMLTextAreaElement).value).toBe("需要补充证明过程。");
    });

    fireEvent.click(screen.getByRole("button", { name: "查看答卷" }));

    await waitFor(() => {
      expect(screen.getByText("答卷加载失败，请稍后重试。")).toBeTruthy();
      expect(screen.getByText("题干：解释勾股定理。")).toBeTruthy();
    });
  });

  it("loads draft detail into edit form and updates exam", async () => {
    const getExam = vi.fn(async (id: number) =>
      createExamDetail({
        id,
        name: "期中测验",
        exam_mode: "fixed",
        status: "draft",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [{ target_type: "class", target_id: 301 }],
        fixed_questions: [{ question_id: 1001, question_version_id: 3001, score: 2, display_order: 1 }]
      })
    );
    const updateExam = vi.fn(async (id: number, body: ExamInput) =>
      createExamDetail({
        ...body,
        id,
        status: "draft"
      })
    );
    const api = createExamApiMock({ getExam, updateExam });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "编辑草稿" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "编辑草稿" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("期中测验")).toBeTruthy();
      expect(screen.getByDisplayValue("class:301")).toBeTruthy();
      expect(screen.getByDisplayValue("1001:3001:2:1")).toBeTruthy();
      expect(screen.getByRole("button", { name: "更新草稿" })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("考试名称"), { target: { value: "期中测验（调整版）" } });
    fireEvent.click(screen.getByRole("button", { name: "更新草稿" }));

    await waitFor(() => {
      expect(updateExam).toHaveBeenCalledWith(1, {
        name: "期中测验（调整版）",
        exam_mode: "fixed",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [{ target_type: "class", target_id: 301 }],
        fixed_questions: [{ question_id: 1001, question_version_id: 3001, score: 2, display_order: 1 }]
      });
      expect(screen.getByText("草稿已更新：期中测验（调整版）")).toBeTruthy();
    });
  });

  it("shows random assembly rules in preview", async () => {
    const getExam = vi.fn(async (id: number) =>
      createExamDetail({
        id,
        name: "随机小测",
        exam_mode: "random_assembly",
        status: "draft",
        start_time: "2026-04-25T09:00:00+08:00",
        end_time: "2026-04-25T09:30:00+08:00",
        duration_minutes: 30,
        targets: [{ target_type: "course", target_id: 10 }],
        paper_rules: [{ question_type: "single_choice", score_per_question: 2, question_count: 10, bank_ids: [1, 2] }]
      })
    );
    const api = createExamApiMock({
      listExams: async () => ({
        items: [
          {
            id: 3,
            tenant_id: 1,
            name: "随机小测",
            exam_mode: "random_assembly",
            status: "draft",
            start_time: "2026-04-25T09:00:00+08:00",
            end_time: "2026-04-25T09:30:00+08:00",
            duration_minutes: 30
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }),
      getExam
    });

    render(<TeacherExamPage api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(screen.getByText("规则 1")).toBeTruthy();
      expect(screen.getByText("题型：single_choice")).toBeTruthy();
      expect(screen.getByText("题量：10")).toBeTruthy();
      expect(screen.getByText("单题分值：2")).toBeTruthy();
      expect(screen.getByText("题库范围：1, 2")).toBeTruthy();
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
    getExam: async (id) =>
      createExamDetail({
        id,
        name: "期中测验",
        exam_mode: "fixed",
        status: "draft",
        start_time: "2026-04-24T09:00:00+08:00",
        end_time: "2026-04-24T10:00:00+08:00",
        duration_minutes: 60,
        targets: [{ target_type: "class", target_id: 301 }],
        fixed_questions: [{ question_id: 1001, question_version_id: 3001, score: 2, display_order: 1 }]
      }),
    updateExam: async (id, body) => createExamDetail({ ...body, id, status: "draft" }),
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
    getExamOverview: async () => ({
      summary: {
        exam_id: 1,
        exam_name: "期中测验",
        exam_mode: "fixed",
        status: "draft",
        duration_minutes: 60,
        total_score: 100,
        student_count: 0,
        participated_student_count: 0,
        submitted_count: 0,
        in_progress_count: 0,
        absent_count: 0,
        average_score: 0,
        highest_score: 0,
        lowest_score: 0
      },
      students: {
        items: [],
        page: 1,
        page_size: 20,
        total: 0
      }
    }),
    exportExamOverviewCsv: async () => "学生姓名,学号\n",
    getExamAttemptReview: async () => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        attempt_status: "submitted",
        objective_score: 0,
        subjective_score: 0,
        final_score: 0
      },
      questions: []
    }),
    reviewExamAttemptQuestion: async () => ({
      summary: {
        attempt_id: 8001,
        exam_id: 1,
        exam_name: "期中测验",
        student_user_id: 501,
        student_name: "张三",
        attempt_status: "submitted",
        objective_score: 0,
        subjective_score: 0,
        final_score: 0
      },
      question: {
        question_id: 1001,
        question_version_id: 3001,
        display_order: 1,
        question_type: "short_answer",
        score: 10,
        content: {},
        correct_answer: {},
        is_answered: true,
        answer_score: 0,
        judge_source: "manual"
      }
    }),
    ...overrides
  };
}

function createManualAttemptReview(stemText: string): ExamAttemptReviewResult {
  return {
    summary: {
      attempt_id: 8001,
      exam_id: 1,
      exam_name: "期中测验",
      student_user_id: 501,
      student_name: "张三",
      student_no: "S001",
      class_name: "七年级一班",
      attempt_status: "submitted",
      objective_score: 60,
      subjective_score: 0,
      final_score: 60
    },
    questions: [
      {
        question_id: 1002,
        question_version_id: 3002,
        display_order: 2,
        question_type: "essay",
        score: 10,
        content: { stem: { text: stemText } },
        correct_answer: { text: "直角三角形两直角边平方和等于斜边平方。" },
        student_answer: { text: "学生答案" },
        is_answered: true,
        answer_score: 0,
        judge_source: "manual"
      }
    ]
  };
}

function createOverviewWithReviewStudent(): ExamOverviewResult {
  return {
    summary: {
      exam_id: 1,
      exam_name: "期中测验",
      exam_mode: "fixed",
      status: "published",
      duration_minutes: 60,
      total_score: 100,
      student_count: 1,
      participated_student_count: 1,
      submitted_count: 1,
      in_progress_count: 0,
      absent_count: 0,
      average_score: 60,
      highest_score: 60,
      lowest_score: 60
    },
    students: {
      items: [
        {
          student_user_id: 501,
          student_name: "张三",
          student_no: "S001",
          class_name: "七年级一班",
          attempt_id: 8001,
          attempt_status: "submitted",
          review_status: "pending",
          final_score: 60,
          objective_score: 60,
          subjective_score: 0
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    }
  };
}

function createExamDetail(input: ExamInput & { id: number; status?: string }): ExamDetail {
  return {
    id: input.id,
    tenant_id: 1,
    owner_org_type: "school",
    owner_org_id: 1,
    creator_id: 1,
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
