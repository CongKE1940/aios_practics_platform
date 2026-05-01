// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    const createModal = within(screen.getByLabelText("角色权限弹层"));
    fireEvent.change(createModal.getByLabelText("角色编码"), { target: { value: "school_reviewer" } });
    fireEvent.change(createModal.getByLabelText("角色名称"), { target: { value: "学校审核员" } });
    fireEvent.click(createModal.getByRole("button", { name: "新增角色" }));

    await waitFor(() => {
      expect(createRole).toHaveBeenCalledTimes(1);
      expect(listRoles).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    fireEvent.click(screen.getByRole("button", { name: "授予全部权限" }));

    await waitFor(() => {
      expect(assignRolePermissions).toHaveBeenCalledWith(3, { permission_ids: [1] });
    });
  });

  it("hides privileged permissions for tenant administrators", async () => {
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
        currentUser={{
          id: 9,
          tenant_id: 1,
          display_name: "租户管理员",
          user_type: "tenant_admin",
          roles: ["tenant_admin"],
          permissions: ["tenant:manage", "user:manage", "role:manage"]
        }}
        api={{
          ...createRbacPanelApi({
            roles: [
              {
                id: 3,
                tenant_id: 1,
                code: "school_reviewer",
                name: "学校审核员",
                role_type: "custom",
                data_scope_type: "subtree",
                status: "active",
                permission_ids: [1, 2, 3, 4]
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
              },
              {
                id: 2,
                code: "role:manage",
                module: "role",
                action_name: "manage",
                resource_type: "role",
                name: "角色管理"
              },
              {
                id: 3,
                code: "system:manage",
                module: "system",
                action_name: "manage",
                resource_type: "system",
                name: "系统配置"
              },
              {
                id: 4,
                code: "notice:manage",
                module: "notice",
                action_name: "manage",
                resource_type: "notice",
                name: "公告管理"
              }
            ]
          }),
          assignRolePermissions
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "角色权限" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(screen.getAllByText("用户管理").length).toBeGreaterThan(0);
    expect(screen.queryByText("角色管理")).toBeNull();
    expect(screen.queryByText("系统配置")).toBeNull();
    expect(screen.queryByText("公告管理")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "授予全部权限" }));
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
