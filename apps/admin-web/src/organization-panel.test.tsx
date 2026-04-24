// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClassItem, Course, Grade, PageResult, School } from "@aios/api-sdk";

import { OrganizationPanel, type OrganizationApi } from "./organization-panel";

afterEach(() => {
  cleanup();
});

describe("OrganizationPanel", () => {
  it("loads and renders organization resources by specific view", async () => {
    render(
      <OrganizationPanel
        view="grades"
        api={createOrganizationApi({
          schools: [{ id: 1, tenant_id: 1, code: "school_001", name: "第一中学", status: "active" }],
          grades: [
            {
              id: 2,
              tenant_id: 1,
              school_id: 1,
              code: "grade_7",
              name: "七年级",
              grade_level: 7,
              school_year: "2026",
              status: "active"
            }
          ],
          classes: [
            {
              id: 3,
              tenant_id: 1,
              school_id: 1,
              grade_id: 2,
              code: "class_1",
              name: "一班",
              class_no: 1,
              status: "active"
            }
          ],
          courses: [
            {
              id: 4,
              tenant_id: 1,
              code: "math",
              name: "数学",
              start_at: "2026-09-01T00:00:00+08:00",
              end_at: "2027-01-31T23:59:59+08:00",
              status: "active",
              description: "七年级数学"
            }
          ]
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "年级管理" })).toBeTruthy();
    });

    expect(screen.getAllByText("七年级").length).toBeGreaterThan(0);
    expect(screen.getAllByText("第一中学").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "课程管理" })).toBeNull();
  });

  it("renders course management as an independent view", async () => {
    render(
      <OrganizationPanel
        view="courses"
        api={createOrganizationApi({
          courses: [
            {
              id: 4,
              tenant_id: 1,
              code: "math",
              name: "数学",
              start_at: "2026-09-01T00:00:00+08:00",
              end_at: "2027-01-31T23:59:59+08:00",
              status: "active",
              description: "七年级数学"
            }
          ]
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "课程管理" })).toBeTruthy();
    });

    expect(screen.getAllByText("数学").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-09-01T00:00:00+08:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2027-01-31T23:59:59+08:00").length).toBeGreaterThan(0);
  });

  it("creates school and refreshes the list", async () => {
    const listSchools = vi
      .fn<OrganizationApi["listSchools"]>()
      .mockResolvedValueOnce(pageOf([]))
      .mockResolvedValueOnce(
        pageOf([{ id: 1, tenant_id: 1, code: "school_001", name: "第一中学", status: "active" }])
      );
    const createSchool = vi.fn<OrganizationApi["createSchool"]>().mockResolvedValue({
      id: 1,
      tenant_id: 1,
      code: "school_001",
      name: "第一中学",
      status: "active"
    });

    render(
      <OrganizationPanel
        view="schools"
        api={{
          ...createOrganizationApi(),
          listSchools,
          createSchool
        }}
      />
    );

    await waitFor(() => {
      expect(listSchools).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("学校编码"), { target: { value: "school_001" } });
    fireEvent.change(screen.getByLabelText("学校名称"), { target: { value: "第一中学" } });
    fireEvent.click(screen.getByRole("button", { name: "新增学校" }));

    await waitFor(() => {
      expect(createSchool).toHaveBeenCalledWith({ code: "school_001", name: "第一中学" });
      expect(listSchools).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText("第一中学").length).toBeGreaterThan(0);
  });
});

function createOrganizationApi(seed?: {
  schools?: School[];
  grades?: Grade[];
  classes?: ClassItem[];
  courses?: Course[];
}): OrganizationApi {
  return {
    listSchools: async () => pageOf(seed?.schools ?? []),
    createSchool: async (body) => ({
      id: 1,
      tenant_id: 1,
      status: "active",
      ...body
    }),
    disableSchool: async () => true,
    listGrades: async () => pageOf(seed?.grades ?? []),
    createGrade: async (body) => ({
      id: 2,
      tenant_id: 1,
      status: "active",
      ...body
    }),
    disableGrade: async () => true,
    listClasses: async () => pageOf(seed?.classes ?? []),
    createClass: async (body) => ({
      id: 3,
      tenant_id: 1,
      status: "active",
      ...body
    }),
    disableClass: async () => true,
    listCourses: async () => pageOf(seed?.courses ?? []),
    createCourse: async (body) => ({
      id: 4,
      tenant_id: 1,
      status: "active",
      description: "",
      ...body
    }),
    disableCourse: async () => true
  };
}

function pageOf<T>(items: T[]): PageResult<T> {
  return {
    items,
    page: 1,
    page_size: 20,
    total: items.length
  };
}
