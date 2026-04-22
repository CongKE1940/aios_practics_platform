// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp, type SessionState, type SessionStore } from "./app";

afterEach(() => {
  cleanup();
});

describe("AdminApp", () => {
  it("renders login form before authentication", () => {
    render(<AdminApp />);

    expect(screen.getByRole("heading", { name: "AIOS 管理端" })).toBeTruthy();
    expect(screen.getByLabelText("租户编码")).toBeTruthy();
    expect(screen.getByLabelText("用户名")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
  });

  it("shows current user after successful login", async () => {
    const sessionStore = createMemorySessionStore();
    render(
      <AdminApp
        sessionStore={sessionStore}
        authApi={{
          login: async () => ({
            access_token: "access_token",
            refresh_token: "refresh_token",
            expires_in: 7200,
            user: {
              id: 1,
              tenant_id: 1,
              display_name: "系统管理员",
              user_type: "sys_admin",
              roles: ["sys_admin"],
              permissions: ["notice:manage"]
            }
          }),
          logout: async () => true,
          menus: async () => [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [
                { id: 11, name: "组织管理", path: "/admin/org", children: [] },
                { id: 12, name: "公告通知", path: "/admin/notices", children: [] }
              ]
            }
          ]
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "platform" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Test@123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText("系统管理员")).toBeTruthy();
    });
    expect(sessionStore.savedSession?.user.display_name).toBe("系统管理员");
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新增公告" })).toBeTruthy();
    expect(screen.getByText("组织管理")).toBeTruthy();
    expect(screen.getByText("公告通知")).toBeTruthy();
  });

  it("returns to login form after logout", async () => {
    const sessionStore = createMemorySessionStore();
    render(
      <AdminApp
        sessionStore={sessionStore}
        authApi={{
          login: async () => ({
            access_token: "access_token",
            refresh_token: "refresh_token",
            expires_in: 7200,
            user: {
              id: 1,
              tenant_id: 1,
              display_name: "系统管理员",
              user_type: "sys_admin",
              roles: ["sys_admin"],
              permissions: ["notice:manage"]
            }
          }),
          logout: async () => true,
          menus: async () => [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [{ id: 11, name: "组织管理", path: "/admin/org", children: [] }]
            }
          ]
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "platform" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Test@123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    });
    expect(sessionStore.savedSession).toBeNull();
  });

  it("restores session from session store", () => {
    render(
      <AdminApp
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [{ id: 11, name: "组织管理", path: "/admin/org", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["notice:manage"]
          }
        })}
      />
    );

    expect(screen.getByText("系统管理员")).toBeTruthy();
    expect(screen.getByText("组织管理")).toBeTruthy();
  });

  it("opens organization panel after selecting organization menu", async () => {
    render(
      <AdminApp
        orgApi={{
          listSchools: async () => ({
            items: [{ id: 1, tenant_id: 1, code: "school_001", name: "第一中学", status: "active" }],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createSchool: async (body) => ({ id: 1, tenant_id: 1, status: "active", ...body }),
          disableSchool: async () => true,
          listGrades: async () => ({ items: [], page: 1, page_size: 20, total: 0 }),
          createGrade: async (body) => ({ id: 2, tenant_id: 1, status: "active", ...body }),
          disableGrade: async () => true,
          listClasses: async () => ({ items: [], page: 1, page_size: 20, total: 0 }),
          createClass: async (body) => ({ id: 3, tenant_id: 1, status: "active", ...body }),
          disableClass: async () => true,
          listCourses: async () => ({ items: [], page: 1, page_size: 20, total: 0 }),
          createCourse: async (body) => ({ id: 4, tenant_id: 1, status: "active", description: "", ...body }),
          disableCourse: async () => true
        }}
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [{ id: 11, name: "组织管理", path: "/admin/org", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["org:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "组织管理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "组织管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("第一中学").length).toBeGreaterThan(0);
  });

  it("opens notice panel after selecting notice menu", async () => {
    render(
      <AdminApp
        noticeApi={{
          listNotices: async () => ({
            items: [
              {
                id: 1,
                tenant_id: 1,
                title: "系统维护通知",
                content: "周五晚维护",
                notice_type: "system",
                publisher_id: 1,
                publish_scope_type: "all",
                publish_scope: {},
                publish_at: "2026-04-22T09:00:00+08:00",
                status: "draft"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createNotice: async (body) => ({
            id: 1,
            tenant_id: 1,
            publisher_id: 1,
            status: "draft",
            ...body
          }),
          publishNotice: async (id) => ({
            id,
            tenant_id: 1,
            title: "系统维护通知",
            content: "周五晚维护",
            notice_type: "system",
            publisher_id: 1,
            publish_scope_type: "all",
            publish_scope: {},
            publish_at: "2026-04-22T09:00:00+08:00",
            status: "published"
          }),
          recallNotice: async (id) => ({
            id,
            tenant_id: 1,
            title: "系统维护通知",
            content: "周五晚维护",
            notice_type: "system",
            publisher_id: 1,
            publish_scope_type: "all",
            publish_scope: {},
            publish_at: "2026-04-22T09:00:00+08:00",
            status: "recalled"
          }),
          listNotifications: async () => ({
            items: [
              {
                id: 10,
                tenant_id: 1,
                recipient_user_id: 1,
                category: "notice",
                title: "系统维护通知",
                content: "周五晚维护",
                source_type: "notice",
                source_id: 1,
                status: "unread"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          markNotificationRead: async (id) => ({
            id,
            tenant_id: 1,
            recipient_user_id: 1,
            category: "notice",
            title: "系统维护通知",
            content: "周五晚维护",
            source_type: "notice",
            source_id: 1,
            read_at: "2026-04-22T10:00:00+08:00",
            status: "read"
          })
        }}
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [{ id: 12, name: "公告通知", path: "/admin/notices", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["notice:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "公告通知" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "公告通知" })).toBeTruthy();
    });
    expect(screen.getAllByText("系统维护通知").length).toBeGreaterThan(0);
  });

  it("opens user panel after selecting user menu", async () => {
    render(
      <AdminApp
        userApi={{
          listUsers: async () => ({
            items: [
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
            page: 1,
            page_size: 20,
            total: 1
          }),
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
          listRoles: async () => ({
            items: [
              {
                id: 3,
                tenant_id: 1,
                code: "school_reviewer",
                name: "学校审核员",
                role_type: "custom",
                data_scope_type: "subtree",
                status: "active"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          })
        }}
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [{ id: 12, name: "用户管理", path: "/admin/users", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["user:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "用户管理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "用户管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("张老师").length).toBeGreaterThan(0);
  });

  it("opens rbac panel after selecting role menu", async () => {
    render(
      <AdminApp
        rbacApi={{
          listRoles: async () => ({
            items: [
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
            page: 1,
            page_size: 20,
            total: 1
          }),
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
          listPermissions: async () => ({
            items: [
              {
                id: 1,
                code: "user:manage",
                module: "user",
                action_name: "manage",
                resource_type: "user",
                name: "用户管理"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          })
        }}
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [
            {
              id: 1,
              name: "系统管理",
              path: "/admin",
              children: [{ id: 13, name: "角色权限", path: "/admin/roles", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["role:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "角色权限" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "角色权限" })).toBeTruthy();
    });
    expect(screen.getAllByText("学校审核员").length).toBeGreaterThan(0);
  });
});

function createMemorySessionStore(initialSession: SessionState | null = null): SessionStore & {
  readonly savedSession: SessionState | null;
} {
  let savedSession = initialSession;

  return {
    get savedSession() {
      return savedSession;
    },
    load(): SessionState | null {
      return savedSession;
    },
    save(session: SessionState) {
      savedSession = session;
    },
    clear() {
      savedSession = null;
    }
  };
}
