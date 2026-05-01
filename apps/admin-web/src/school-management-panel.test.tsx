// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SchoolManagementApi } from "./school-management-panel";
import { SchoolManagementPanel } from "./school-management-panel";

afterEach(() => {
  cleanup();
});

describe("SchoolManagementPanel", () => {
  it("loads a large first page and renders schools with organizations", async () => {
    const listSchools = vi.fn<SchoolManagementApi["listSchools"]>().mockResolvedValue({
      items: [
        { id: 1, tenant_id: 1, object_type: 1, object_type_label: "学校", code: "SCH001", name: "第一中学", status: "active" },
        { id: 2, tenant_id: 2, object_type: 2, object_type_label: "组织", code: "ORG001", name: "示范组织", status: "active" }
      ],
      page: 1,
      page_size: 100,
      total: 2
    });

    render(
      <SchoolManagementPanel
        api={{
          listSchools,
          createSchool: async (body) => ({ id: 3, tenant_id: 3, code: "SCH003", status: "active", ...body }),
          disableSchool: async () => true
        }}
      />
    );

    await waitFor(() => {
      expect(listSchools).toHaveBeenCalledWith({ keyword: undefined, status: undefined, object_type: undefined, page: 1, page_size: 100 });
    });

    expect(screen.getByText("第一中学")).toBeTruthy();
    expect(screen.getByText("示范组织")).toBeTruthy();
    expect(screen.getByText("共 2 条")).toBeTruthy();
  });
});
