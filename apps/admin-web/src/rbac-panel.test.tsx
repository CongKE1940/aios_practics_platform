// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PageResult, PermissionItem, RoleItem } from "@aios/api-sdk";

import { RbacPanel, type RbacPanelApi } from "./rbac-panel";

afterEach(() => {
  cleanup();
});

describe("RbacPanel", () => {
  it("loads and renders roles with permissions", async () => {
    render(
      <RbacPanel
        api={createRbacPanelApi({
          roles: [
            {
              id: 3,
              tenant_id: 1,
              code: "school_reviewer",
              name: "学校审核员",
              role_type: "custom",
              data_scope_type: "subtree",
              status: "active",
              permission_ids: [1]
            }
          ],
          permissions: [
            {
              id: 1,
              code: "user:manage",
              module: "user",
              action_name: "manage",
              resource_type: "user",
              name: "用户管理"
            }
          ]
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "角色权限" })).toBeTruthy();
    });
    expect(screen.getAllByText("学校审核员").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(screen.getAllByText("用户管理").length).toBeGreaterThan(0);
  });

  it("creates role and assigns permissions", async () => {
    const listRoles = vi
      .fn<RbacPanelApi["listRoles"]>()
      .mockResolvedValueOnce(pageOf([]))
      .mockResolvedValueOnce(
        pageOf([
          {
            id: 3,
            tenant_id: 1,
            code: "school_reviewer",
            name: "学校审核员",
            role_type: "custom",
            data_scope_type: "subtree",
            status: "active",
            permission_ids: [1]
          }
        ])
      );
    const createRole = vi.fn<RbacPanelApi["createRole"]>().mockResolvedValue({
      id: 3,
      tenant_id: 1,
      code: "school_reviewer",
      name: "学校审核员",
      role_type: "custom",
      data_scope_type: "subtree",
      status: "active",
      permission_ids: []
    });
    const assignRolePermissions = vi.fn<RbacPanelApi["assignRolePermissions"]>().mockResolvedValue({
      id: 3,
      tenant_id: 1,
      code: "school_reviewer",
      name: "学校审核员",
      role_type: "custom",
      data_scope_type: "subtree",
      status: "active",
      permission_ids: [1]
    });

    render(
      <RbacPanel
        api={{
          ...createRbacPanelApi({
            permissions: [
              {
                id: 1,
                code: "user:manage",
                module: "user",
                action_name: "manage",
                resource_type: "user",
                name: "用户管理"
              }
            ]
          }),
          listRoles,
          createRole,
          assignRolePermissions
        }}
      />
    );

    await waitFor(() => {
      expect(listRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));
    fireEvent.change(screen.getByLabelText("角色编码"), { target: { value: "school_reviewer" } });
    fireEvent.change(screen.getByLabelText("角色名称"), { target: { value: "学校审核员" } });
    fireEvent.click(screen.getAllByRole("button", { name: "新增角色" })[1]);

    await waitFor(() => {
      expect(createRole).toHaveBeenCalledTimes(1);
      expect(listRoles).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    fireEvent.click(screen.getByRole("button", { name: "授予全部权限-3" }));

    await waitFor(() => {
      expect(assignRolePermissions).toHaveBeenCalledWith(3, { permission_ids: [1] });
    });
  });
});

function createRbacPanelApi(seed?: { roles?: RoleItem[]; permissions?: PermissionItem[] }): RbacPanelApi {
  return {
    listRoles: async () => pageOf(seed?.roles ?? []),
    createRole: async (body) => ({
      id: 3,
      tenant_id: 1,
      status: "active",
      permission_ids: [],
      ...body
    }),
    assignRolePermissions: async (id, body) => ({
      id,
      tenant_id: 1,
      code: "school_reviewer",
      name: "学校审核员",
      role_type: "custom",
      data_scope_type: "subtree",
      status: "active",
      permission_ids: body.permission_ids
    }),
    listPermissions: async () => pageOf(seed?.permissions ?? [])
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
