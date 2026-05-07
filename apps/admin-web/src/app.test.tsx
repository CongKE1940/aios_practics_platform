// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QuestionChallengeReviewInput } from "@aios/api-sdk";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp, type SessionState, type SessionStore } from "./app";

afterEach(() => {
  cleanup();
});

describe("AdminApp", () => {
  it("renders login form before authentication", () => {
    render(
      <AdminApp
        authApi={{
          listLoginOrganizations: async () => createLoginOrganizations(),
          login: async () => {
            throw new Error("should not login");
          },
          logout: async () => true,
          menus: async () => []
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "管理端登录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "学习端入口" })).toBeTruthy();
    expect(screen.getByLabelText("组织")).toBeTruthy();
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
          listLoginOrganizations: async () => createLoginOrganizations(),
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
              name: "组织管理",
              path: "/admin/org",
              children: [
                { id: 11, name: "学校管理", path: "/admin/org/schools", children: [] },
                { id: 12, name: "年级管理", path: "/admin/org/grades", children: [] }
              ]
            },
            {
              id: 2,
              name: "系统管理",
              path: "/admin/system",
              children: [
                { id: 21, name: "公告通知", path: "/admin/notices", children: [] }
              ]
            }
          ]
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "平台管理（platform）" })).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("组织"), { target: { value: "platform" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Test@123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getAllByText("系统管理员").length).toBeGreaterThan(0);
    });
    expect(sessionStore.savedSession?.user.display_name).toBe("系统管理员");
    openAdminUserMenu();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeTruthy();
    expect(screen.getByText("题练通 AIOS")).toBeTruthy();
    expect(screen.getByLabelText("管理菜单")).toBeTruthy();
    expect(screen.getByRole("button", { name: "组织管理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "学校管理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "公告通知" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "工作台" })).toBeTruthy();
    expect(screen.getByText("成员数")).toBeTruthy();
    expect(screen.getByText("运营任务入口")).toBeTruthy();
  });

  it("returns to login form after logout", async () => {
    const sessionStore = createMemorySessionStore();
    render(
      <AdminApp
        sessionStore={sessionStore}
        authApi={{
          listLoginOrganizations: async () => createLoginOrganizations(),
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
              name: "组织管理",
              path: "/admin/org",
              children: [{ id: 11, name: "学校管理", path: "/admin/org/schools", children: [] }]
            }
          ]
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "平台管理（platform）" })).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("组织"), { target: { value: "platform" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Test@123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "系统管理员账号菜单" })).toBeTruthy();
    });

    openAdminUserMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));

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
              name: "组织管理",
              path: "/admin/org",
              children: [{ id: 11, name: "学校管理", path: "/admin/org/schools", children: [] }]
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

    expect(screen.getAllByText("系统管理员").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "组织管理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "学校管理" })).toBeTruthy();
  });

  it("opens school organization panel after selecting organization submenu", async () => {
    render(
      <AdminApp
        orgApi={{
          listSchools: async () => ({
            items: [{ id: 1, tenant_id: 1, object_type: 1, code: "school_001", name: "第一中学", status: "active" }],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createSchool: async (body) => ({ id: 1, tenant_id: 1, object_type: body.object_type ?? 1, code: body.code ?? "school_001", status: "active", ...body }),
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
              name: "组织管理",
              path: "/admin/org",
              children: [{ id: 11, name: "学校管理", path: "/admin/org/schools", children: [] }]
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

    fireEvent.click(screen.getByRole("button", { name: "学校管理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "学校与组织管理" })).toBeTruthy();
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
          getNotice: async (id) => ({
            id,
            tenant_id: 1,
            title: "系统维护通知",
            content: "周五晚维护",
            notice_type: "system",
            publisher_id: 1,
            publish_scope_type: "all",
            publish_scope: {},
            publish_at: "2026-04-22T09:00:00+08:00",
            status: "draft"
          }),
          updateNotice: async (id, body) => ({
            id,
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
    expect(screen.getAllByText("高一数学基础题库").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("单选题").length).toBeGreaterThan(0);
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
            file_url: body.file_url ?? "",
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
    expect(screen.getAllByText("题库").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("学校数").length).toBeGreaterThan(0);
    expect(screen.getAllByText("张三").length).toBeGreaterThan(0);
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
                assignment_type: "course_teacher",
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
            assignment_type: body.assignment_type ?? "course_teacher",
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

  it("uses backend returned menus instead of local permission fallbacks", () => {
    render(
      <AdminApp
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [{ id: 1, name: "工作台", path: "/admin/workbench", children: [] }],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["org:manage", "user:manage", "tenant:manage"]
          }
        })}
      />
    );

    expect(screen.getByRole("button", { name: "工作台" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "组织管理" })).toBeNull();
    expect(screen.queryByRole("button", { name: "用户管理" })).toBeNull();
  });

  it("opens tenant role config page for tenant administrators", async () => {
    render(
      <AdminApp
        rbacApi={{
          listRoles: async () => ({
            items: [
              {
                id: 3,
                tenant_id: 2,
                code: "org_operator",
                name: "学校/组织协管员",
                role_type: "custom",
                data_scope_type: "tenant",
                status: "active",
                permission_ids: [1]
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createRole: async (body) => ({ id: 4, tenant_id: 2, status: "active", permission_ids: [], ...body }),
          assignRolePermissions: async (id, body) => ({
            id,
            tenant_id: 2,
            code: "org_operator",
            name: "学校/组织协管员",
            role_type: "custom",
            data_scope_type: "tenant",
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
              id: 5,
              name: "配置中心",
              path: "/admin/config",
              children: [{ id: 54, name: "租户角色配置", path: "/admin/tenant/roles", children: [] }]
            }
          ],
          user: {
            id: 2,
            tenant_id: 2,
            display_name: "租户管理员",
            user_type: "tenant_admin",
            roles: ["tenant_admin"],
            permissions: ["tenant:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "租户角色配置" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "租户角色配置" })).toBeTruthy();
    });
    expect(screen.getAllByText("学校/组织协管员").length).toBeGreaterThan(0);
  });

  it("opens exam panel after selecting exam menu", async () => {
    render(
      <AdminApp
        examApi={{
          listExams: async () => ({
            items: [
              {
                id: 9,
                name: "期中考试",
                exam_mode: "fixed",
                status: "draft",
                start_time: "2026-04-25 09:00",
                end_time: "2026-04-25 11:00",
                duration_minutes: 120
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          createExam: async (body) => ({
            id: 10,
            name: body.name,
            exam_mode: body.exam_mode,
            status: "draft",
            start_time: body.start_time,
            end_time: body.end_time,
            duration_minutes: body.duration_minutes ?? 120,
            targets: body.targets ?? [],
            fixed_questions: body.fixed_questions ?? [],
            paper_rules: body.paper_rules ?? []
          }),
          updateExam: async (id, body) => ({
            id,
            name: body.name,
            exam_mode: body.exam_mode,
            status: "draft",
            start_time: body.start_time,
            end_time: body.end_time,
            duration_minutes: body.duration_minutes ?? 120,
            targets: body.targets ?? [],
            fixed_questions: body.fixed_questions ?? [],
            paper_rules: body.paper_rules ?? []
          }),
          getExam: async (id) => ({
            id,
            name: "期中考试",
            exam_mode: "fixed",
            status: "draft",
            start_time: "2026-04-25 09:00",
            end_time: "2026-04-25 11:00",
            duration_minutes: 120,
            targets: [{ target_type: "class", target_id: 101 }],
            fixed_questions: [{ question_id: 1, question_version_id: 11, score: 5, display_order: 1 }]
          }),
          publishExam: async (id) => ({
            id,
            name: "期中考试",
            exam_mode: "fixed",
            status: "published",
            start_time: "2026-04-25 09:00",
            end_time: "2026-04-25 11:00",
            duration_minutes: 120,
            targets: [{ target_type: "class", target_id: 101 }],
            fixed_questions: [{ question_id: 1, question_version_id: 11, score: 5, display_order: 1 }]
          }),
          getExamOverview: async () => ({
            summary: {
              exam_id: 9,
              exam_name: "期中考试",
              exam_mode: "fixed",
              status: "draft",
              start_time: "2026-04-25 09:00",
              end_time: "2026-04-25 11:00",
              duration_minutes: 120,
              total_score: 100,
              student_count: 40,
              participated_student_count: 32,
              submitted_count: 28,
              in_progress_count: 4,
              absent_count: 8,
              average_score: 83,
              highest_score: 96,
              lowest_score: 45
            },
            students: {
              items: [
                {
                  attempt_id: 1,
                  exam_id: 9,
                  exam_name: "期中考试",
                  student_user_id: 7,
                  student_name: "张同学",
                  student_no: "S001",
                  class_id: 101,
                  class_name: "高一1班",
                  attempt_status: "submitted",
                  review_status: "reviewed",
                  objective_score: 60,
                  subjective_score: 20,
                  final_score: 80,
                  start_at: "2026-04-25 09:00",
                  submit_at: "2026-04-25 10:30"
                }
              ],
              page: 1,
              page_size: 20,
              total: 1
            }
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
              path: "/admin/system",
              children: [{ id: 37, name: "考试管理", path: "/admin/exams", children: [] }]
            }
          ],
          user: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["exam:manage"]
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "考试管理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "考试管理" })).toBeTruthy();
    });
    expect(screen.getAllByText("期中考试").length).toBeGreaterThan(0);
  });

  it("opens challenge panel after selecting challenge menu", async () => {
    render(
      <AdminApp
        challengeApi={createChallengeApi()}
        sessionStore={createMemorySessionStore({
          accessToken: "access_token",
          refreshToken: "refresh_token",
          expiresIn: 7200,
          menus: [
            {
              id: 1,
              name: "系统管理",
              path: "/admin/system",
              children: [{ id: 39, name: "质疑处理", path: "/admin/challenges", children: [] }]
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

    fireEvent.click(screen.getByRole("button", { name: "质疑处理" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "质疑处理" })).toBeTruthy();
    });
    expect(screen.getByText("待处理质疑")).toBeTruthy();
    expect(screen.getByText("处理意见")).toBeTruthy();
  });
});

function createChallengeApi() {
  return {
    listQuestionChallenges: async () => ({
      items: [
        {
          id: 1,
          tenant_id: 1,
          question_id: 1001,
          question_version_id: 3001,
          challenge_type: "wrong_answer",
          description: "答案应为 B。",
          attachments: [],
          status: "pending",
          challenger_user_id: 21,
          challenger: "张同学",
          question_bank: "高一数学基础题库",
          title: "函数题答案有误",
          current_version: "版本 1：答案为 A",
          current_content: {
            stem: { content_type: "text", text: "下列函数的值域是？" },
            options: [
              { key: "A", content_type: "text", text: "A" },
              { key: "B", content_type: "text", text: "B" }
            ]
          },
          current_answer: { judge_mode: "single", correct_keys: ["A"] },
          current_analysis: { text: "原解析认为答案为 A。" },
          suggested_fix: "学生认为正确答案应为 B。",
          history_versions: ["版本 1：答案为 A"]
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    }),
    reviewQuestionChallenge: async (_id: number, body: QuestionChallengeReviewInput) => ({
      id: 1,
      tenant_id: 1,
      question_id: 1001,
      question_version_id: 3001,
      challenge_type: "wrong_answer",
      description: "答案应为 B。",
      attachments: [],
      status: body.status,
      challenger_user_id: 21,
      challenger: "张同学",
      question_bank: "高一数学基础题库",
      title: "函数题答案有误",
      current_version: body.new_version ? "版本 2：采纳质疑修订" : "版本 1：答案为 A",
      current_content: body.new_version?.content ?? {
        stem: { content_type: "text", text: "下列函数的值域是？" },
        options: [
          { key: "A", content_type: "text", text: "A" },
          { key: "B", content_type: "text", text: "B" }
        ]
      },
      current_answer: body.new_version?.answer ?? { judge_mode: "single", correct_keys: ["A"] },
      current_analysis: body.new_version?.analysis ?? { text: "原解析认为答案为 A。" },
      suggested_fix: "学生认为正确答案应为 B。",
      history_versions: body.new_version ? ["版本 1：答案为 A", "版本 2：采纳质疑修订"] : ["版本 1：答案为 A"],
      resolved_version_id: body.new_version ? 3002 : body.resolved_version_id,
      review_comment: body.review_comment
    })
  };
}

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

function openAdminUserMenu(displayName = "系统管理员") {
  fireEvent.click(screen.getByRole("button", { name: `${displayName}账号菜单` }));
}

function createLoginOrganizations() {
  return [
    {
      tenant_id: 1,
      tenant_code: "platform",
      tenant_name: "平台管理",
      tenant_type: "platform",
      is_default: true
    },
    {
      tenant_id: 2,
      tenant_code: "demo_school",
      tenant_name: "演示学校",
      tenant_type: "school"
    }
  ];
}
