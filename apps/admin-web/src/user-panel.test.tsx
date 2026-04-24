// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ManagedUser, PageResult, RoleItem } from "@aios/api-sdk";

import { UserPanel, type UserPanelApi } from "./user-panel";

afterEach(() => {
  cleanup();
});

describe("UserPanel", () => {
  it("loads and renders users with role options", async () => {
    render(
      <UserPanel
        api={createUserPanelApi({
          users: [
            {
              id: 7,
              tenant_id: 1,
              username: "teacher001",
              display_name: "张老师",
              user_type: "teacher",
              status: "active",
              role_ids: [3]
            }
          ],
          roles: [
            {
              id: 3,
              tenant_id: 1,
              code: "school_reviewer",
              name: "学校审核员",
              role_type: "custom",
              data_scope_type: "subtree",
              status: "active"
            }
          ]
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "用户管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("张老师").length).toBeGreaterThan(0);
    expect(screen.getAllByText("学校审核员").length).toBeGreaterThan(0);
  });

  it("creates user and assigns role", async () => {
    const listUsers = vi
      .fn<UserPanelApi["listUsers"]>()
      .mockResolvedValueOnce(pageOf([]))
      .mockResolvedValueOnce(
        pageOf([
          {
            id: 7,
            tenant_id: 1,
            username: "teacher001",
            display_name: "张老师",
            user_type: "teacher",
            status: "active",
            role_ids: [3]
          }
        ])
      );
    const createUser = vi.fn<UserPanelApi["createUser"]>().mockResolvedValue({
      id: 7,
      tenant_id: 1,
      username: "teacher001",
      display_name: "张老师",
      user_type: "teacher",
      status: "active",
      role_ids: [3]
    });
    const assignUserRoles = vi.fn<UserPanelApi["assignUserRoles"]>().mockResolvedValue({
      id: 7,
      tenant_id: 1,
      username: "teacher001",
      display_name: "张老师",
      user_type: "teacher",
      status: "active",
      role_ids: [3]
    });

    render(
      <UserPanel
        api={{
          ...createUserPanelApi({
            roles: [
              {
                id: 3,
                tenant_id: 1,
                code: "school_reviewer",
                name: "学校审核员",
                role_type: "custom",
                data_scope_type: "subtree",
                status: "active"
              }
            ]
          }),
          listUsers,
          createUser,
          assignUserRoles
        }}
      />
    );

    await waitFor(() => {
      expect(listUsers).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "新增用户" }));
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "teacher001" } });
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "张老师" } });
    fireEvent.change(screen.getAllByLabelText("用户类型")[1], { target: { value: "teacher" } });
    fireEvent.change(screen.getByLabelText("初始密码"), { target: { value: "Init@123456" } });
    fireEvent.change(screen.getByLabelText("默认角色"), { target: { value: "3" } });
    fireEvent.click(screen.getAllByRole("button", { name: "新增用户" })[1]);

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledTimes(1);
      expect(listUsers).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    fireEvent.click(screen.getByRole("button", { name: "同步角色" }));

    await waitFor(() => {
      expect(assignUserRoles).toHaveBeenCalledWith(7, { role_ids: [3] });
    });
  });
});

function createUserPanelApi(seed?: { users?: ManagedUser[]; roles?: RoleItem[] }): UserPanelApi {
  return {
    listUsers: async () => pageOf(seed?.users ?? []),
    createUser: async (body) => ({
      id: 7,
      tenant_id: 1,
      username: body.username,
      display_name: body.display_name,
      user_type: body.user_type,
      status: "active",
      role_ids: body.role_ids ?? []
    }),
    assignUserRoles: async (id, body) => ({
      id,
      tenant_id: 1,
      username: "teacher001",
      display_name: "张老师",
      user_type: "teacher",
      status: "active",
      role_ids: body.role_ids
    }),
    disableUser: async (id) => ({
      id,
      tenant_id: 1,
      username: "teacher001",
      display_name: "张老师",
      user_type: "teacher",
      status: "disabled",
      role_ids: [3]
    }),
    listRoles: async () => pageOf(seed?.roles ?? [])
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
