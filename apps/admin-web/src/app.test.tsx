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

  it("opens question bank panel after selecting question bank menu", async () => {
    render(
      <AdminApp
        questionBankApi={{
          listQuestionBanks: async () => ({
            items: [
              {
                id: 1,
                tenant_id: 1,
                owner_org_type: "school",
                owner_org_id: 1,
                creator_id: 1,
                course_id: 10,
                name: "高一数学基础题库",
                description: "代数基础",
                status: "draft",
                source_type: "manual"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createQuestionBank: async (body) => ({
            id: 2,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            creator_id: 1,
            status: "draft",
            source_type: "manual",
            ...body
          }),
          publishQuestionBank: async (id) => ({
            id,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            creator_id: 1,
            course_id: 10,
            name: "高一数学基础题库",
            status: "active",
            source_type: "manual"
          }),
          assignQuestionBankVisibility: async () => true
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
              children: [{ id: 15, name: "题库管理", path: "/admin/question-banks", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["question_bank:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "题库管理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "题库管理" })).toBeTruthy();
    });
    expect(screen.getByText("高一数学基础题库")).toBeTruthy();
  });

  it("opens question panel after selecting question menu", async () => {
    render(
      <AdminApp
        questionApi={{
          listQuestions: async () => ({
            items: [
              {
                id: 1001,
                tenant_id: 1,
                owner_org_type: "school",
                owner_org_id: 1,
                question_type: "single_choice",
                difficulty: "medium",
                current_version_id: 3001,
                current_version_no: 1,
                status: "active",
                source_type: "manual",
                creator_id: 1,
                bank_ids: [1]
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createQuestion: async (body) => ({
            id: 1002,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            current_version_id: 3002,
            current_version_no: 1,
            status: "active",
            source_type: "manual",
            creator_id: 1,
            bank_ids: body.bank_ids ?? [],
            question_type: body.question_type,
            difficulty: body.difficulty ?? undefined
          }),
          updateQuestion: async (id, body) => ({
            id,
            tenant_id: 1,
            owner_org_type: "school",
            owner_org_id: 1,
            question_type: "single_choice",
            difficulty: body.difficulty ?? "medium",
            current_version_id: 3001,
            current_version_no: 1,
            status: body.status ?? "active",
            source_type: "manual",
            creator_id: 1,
            bank_ids: [1]
          }),
          listQuestionVersions: async () => [],
          createQuestionVersion: async (id, body) => ({
            id: 3002,
            question_id: id,
            version_no: 2,
            content: body.content,
            answer: body.answer,
            analysis: body.analysis,
            structure_hash: "hash_2",
            change_summary: body.change_summary,
            is_published: true,
            created_by: 1
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
              children: [{ id: 16, name: "题目管理", path: "/admin/questions", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["question:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "题目管理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "题目管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("single_choice").length).toBeGreaterThan(0);
  });

  it("opens import panel after selecting import menu", async () => {
    render(
      <AdminApp
        importApi={{
          downloadImportTemplate: async () => "bank_name,course_name\n",
          listImportJobs: async () => ({
            items: [
              {
                id: 1,
                tenant_id: 1,
                import_type: "question_bank",
                template_version: "v1",
                file_url: "/api/v1/files/1/content",
                status: "success",
                total_rows: 1,
                success_rows: 1,
                failed_rows: 0,
                operator_id: 1
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createImportJob: async (body) => ({
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
          }),
          listImportJobRows: async () => ({
            items: [],
            page: 1,
            page_size: 20,
            total: 0
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
              children: [{ id: 17, name: "导入中心", path: "/admin/imports", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["import:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "导入中心" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "导入中心" })).toBeTruthy();
    });
    expect(screen.getAllByText("question_bank").length).toBeGreaterThan(0);
  });

  it("opens analytics panel after selecting analytics menu", async () => {
    render(
      <AdminApp
        analyticsApi={{
          getAdminOverview: async () => ({
            summary: {
              school_count: 2,
              class_count: 8,
              course_count: 5,
              active_student_count: 320,
              active_teacher_count: 24,
              practice_session_count_7d: 86,
              published_exam_count: 6,
              submitted_exam_attempt_count: 102,
              pending_review_count: 4,
              recent_transition_count_30d: 3
            },
            recent_transitions: [
              {
                transition_id: 1001,
                student_id: 501,
                student_name: "张三",
                transition_type: "promote",
                occurred_at: "2026-04-23T09:00:00+08:00",
                operator_id: 1,
                operator_name: "系统管理员"
              }
            ],
            recent_audit_logs: [
              {
                id: 9001,
                module_name: "snapshot",
                action_name: "student_transition",
                resource_type: "student",
                result: "success",
                created_at: "2026-04-23T09:30:00+08:00"
              }
            ]
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
              children: [{ id: 18, name: "数据看板", path: "/admin/analytics", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["analytics:view"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "数据看板" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "数据看板" })).toBeTruthy();
    });
    expect(screen.getByText("学校数")).toBeTruthy();
    expect(screen.getByText("张三")).toBeTruthy();
  });

  it("opens history panel after selecting history menu", async () => {
    render(
      <AdminApp
        historyApi={{
          listAuditLogs: async () => ({
            items: [
              {
                id: 1,
                tenant_id: 1,
                module_name: "snapshot",
                action_name: "student_transition",
                resource_type: "student",
                result: "success",
                created_at: "2026-04-23T09:30:00+08:00"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          listEntitySnapshots: async () => ({
            items: [
              {
                id: 2,
                tenant_id: 1,
                entity_type: "student",
                entity_id: 501,
                snapshot_type: "transition",
                snapshot_json: { transition_type: "promote" },
                version_no: 1,
                created_at: "2026-04-23T09:00:00+08:00"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          listStudentTransitions: async () => ({
            items: [
              {
                id: 3,
                tenant_id: 1,
                student_id: 501,
                transition_type: "promote",
                to_class_id: 302,
                occurred_at: "2026-04-23T09:00:00+08:00",
                operator_id: 1,
                created_at: "2026-04-23T09:00:00+08:00"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createStudentTransition: async (body) => ({
            id: 4,
            tenant_id: 1,
            student_id: body.student_id,
            transition_type: body.transition_type,
            to_class_id: body.to_class_id,
            occurred_at: body.occurred_at,
            operator_id: 1,
            remark: body.remark,
            created_at: body.occurred_at
          }),
          listTeacherAssignmentHistories: async () => ({
            items: [
              {
                id: 5,
                tenant_id: 1,
                teacher_id: 701,
                class_id: 301,
                course_id: 10,
                change_type: "assign",
                effective_from: "2026-04-23T11:00:00+08:00",
                operator_id: 1,
                created_at: "2026-04-23T11:00:00+08:00"
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createTeacherAssignmentChange: async (body) => ({
            id: 6,
            tenant_id: 1,
            teacher_id: body.teacher_id,
            class_id: body.class_id,
            course_id: body.course_id,
            change_type: body.change_type,
            effective_from: body.effective_at,
            operator_id: 1,
            created_at: body.effective_at
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
              children: [{ id: 19, name: "快照历史", path: "/admin/history", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["audit:view", "org:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "快照历史" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "快照历史" })).toBeTruthy();
    });
    expect(screen.getByText("学籍变更登记")).toBeTruthy();
    expect(screen.getAllByText("snapshot").length).toBeGreaterThan(0);
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
