// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportPanel, type ImportPanelApi } from "./import-panel";

afterEach(() => {
  cleanup();
});

describe("ImportPanel", () => {
  it("downloads templates, creates import job, and shows row results", async () => {
    const api: ImportPanelApi = {
      downloadImportTemplate: vi.fn(async () => "bank_name,course_name\n"),
      listImportJobs: vi.fn(async () => ({
        items: [
          {
            id: 1,
            tenant_id: 1,
            import_type: "question",
            template_version: "v1",
            file_url: "/api/v1/files/1/content",
            status: "partial_success",
            total_rows: 2,
            success_rows: 1,
            failed_rows: 1,
            operator_id: 1
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      })),
      createImportJob: vi.fn(async (body) => ({
        id: 2,
        tenant_id: 1,
        import_type: body.import_type,
        template_version: body.template_version ?? "v1",
        file_asset_id: body.file_asset_id,
        file_url: body.file_url,
        status: "success",
        total_rows: 1,
        success_rows: 1,
        failed_rows: 0,
        operator_id: 1
      })),
      listImportJobRows: vi.fn(async () => ({
        items: [
          {
            id: 11,
            job_id: 1,
            row_no: 2,
            raw_data: { bank_name: "未知题库" },
            status: "failed",
            error_code: "bank_not_found",
            error_message: "题库不存在"
          }
        ],
        page: 1,
        page_size: 20,
        total: 1
      }))
    };

    render(<ImportPanel api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "导入中心" })).toBeTruthy();
    });
    expect(screen.getByText("partial_success")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "下载题目模板" }));
    await waitFor(() => {
      expect(api.downloadImportTemplate).toHaveBeenCalledWith("question");
    });
    expect(screen.getByText("bank_name,course_name")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "question_bank" } });
    fireEvent.change(screen.getByLabelText("文件地址"), { target: { value: "/api/v1/files/9/content" } });
    fireEvent.change(screen.getByLabelText("CSV 内容"), {
      target: {
        value: "bank_name,owner_scope_type,owner_scope_name,course_name,description,status\n阶段2题库,,,数学,说明,active"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建导入任务" }));

    await waitFor(() => {
      expect(api.createImportJob).toHaveBeenCalledWith(
        expect.objectContaining({
          import_type: "question_bank",
          file_url: "/api/v1/files/9/content"
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "查看行结果" }));
    await waitFor(() => {
      expect(screen.getByText("bank_not_found")).toBeTruthy();
    });
  });
});
