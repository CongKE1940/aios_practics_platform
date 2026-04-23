import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient, type FetchLike } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createApiClient", () => {
  it("unwraps success envelopes and sends bearer token", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: { id: 1, username: "admin" },
          request_id: "req_1"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "token_1",
      fetch: fetchMock
    });

    await expect(client.get("/users/me")).resolves.toEqual({
      id: 1,
      username: "admin"
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token_1");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("posts login credentials with tenant code", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "access_token",
            refresh_token: "refresh_token",
            expires_in: 7200,
            user: {
              id: 1,
              tenant_id: 1,
              display_name: "系统管理员",
              user_type: "sys_admin",
              roles: ["sys_admin"]
            }
          },
          request_id: "req_login"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      fetch: fetchMock
    });

    await client.login({
      tenant_code: "platform",
      username: "admin",
      password: "secret123"
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(
      JSON.stringify({
        tenant_code: "platform",
        username: "admin",
        password: "secret123"
      })
    );
  });

  it("posts refresh token to refresh endpoint", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "new_access_token",
            refresh_token: "new_refresh_token",
            expires_in: 7200,
            user: {
              id: 1,
              tenant_id: 1,
              display_name: "系统管理员",
              user_type: "sys_admin",
              roles: ["sys_admin"]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      fetch: fetchMock
    });

    await client.refresh({ refresh_token: "refresh_token" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/auth/refresh");
    expect(init?.body).toBe(JSON.stringify({ refresh_token: "refresh_token" }));
  });

  it("gets current user with bearer token", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            id: 1,
            tenant_id: 1,
            display_name: "系统管理员",
            user_type: "sys_admin",
            roles: ["sys_admin"],
            permissions: ["tenant:manage"]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const me = await client.me();
    expect(me.display_name).toBe("系统管理员");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access_token");
  });

  it("posts logout request", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await expect(client.logout()).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/auth/logout");
    expect(init?.method).toBe("POST");
  });

  it("requests organization collections with query parameters", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            items: [{ id: 1, tenant_id: 1, code: "school_001", name: "第一中学", status: "active" }],
            page: 1,
            page_size: 20,
            total: 1
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const result = await client.listSchools({ keyword: "第一", status: "active" });
    expect(result.items[0].name).toBe("第一中学");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/schools?keyword=%E7%AC%AC%E4%B8%80&status=active");
    expect(init?.method).toBe("GET");
  });

  it("posts course body to create course endpoint", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            id: 1,
            tenant_id: 1,
            code: "math",
            name: "数学",
            start_at: "2026-09-01T00:00:00+08:00",
            end_at: "2027-01-31T23:59:59+08:00",
            status: "active",
            description: "七年级数学"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await client.createCourse({
      code: "math",
      name: "数学",
      start_at: "2026-09-01T00:00:00+08:00",
      end_at: "2027-01-31T23:59:59+08:00",
      description: "七年级数学"
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/courses");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({
        code: "math",
        name: "数学",
        start_at: "2026-09-01T00:00:00+08:00",
        end_at: "2027-01-31T23:59:59+08:00",
        description: "七年级数学"
      })
    );
  });

  it("posts disable action for class resource", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await expect(client.disableClass(12)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/classes/12/disable");
    expect(init?.method).toBe("POST");
  });

  it("requests question bank list with filters and assigns visibility", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
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
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const result = await client.listQuestionBanks({ course_id: 10, status: "draft", keyword: "高一" });
    expect(result.items[0].name).toBe("高一数学基础题库");

    await expect(
      client.assignQuestionBankVisibility(1, {
        grants: [
          {
            grant_type: "class",
            target_type: "class",
            target_id: 301,
            permission_type: "practice",
            inherit_to_children: false
          }
        ]
      })
    ).resolves.toBe(true);

    const [listUrl, listInit] = fetchMock.mock.calls[0];
    expect(String(listUrl)).toContain("/question-banks?course_id=10&status=draft&keyword=%E9%AB%98%E4%B8%80");
    expect(listInit?.method).toBe("GET");

    const [assignUrl, assignInit] = fetchMock.mock.calls[1];
    expect(String(assignUrl)).toContain("/question-banks/1/visibility");
    expect(assignInit?.method).toBe("POST");
    expect(assignInit?.body).toBe(
      JSON.stringify({
        grants: [
          {
            grant_type: "class",
            target_type: "class",
            target_id: 301,
            permission_type: "practice",
            inherit_to_children: false
          }
        ]
      })
    );
  });

  it("creates question and posts new version", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
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
              bank_ids: [11]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: 3002,
              question_id: 1001,
              version_no: 2,
              content: {
                stem: { content_type: "text", text: "1+1=？", assets: [] }
              },
              answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
              analysis: { text: "修正后的解析" },
              structure_hash: "hash_2",
              change_summary: "修复题干文案",
              is_published: true,
              created_by: 1
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await client.createQuestion({
      question_type: "single_choice",
      difficulty: "medium",
      content: {
        stem: { content_type: "text", text: "1+1等于几？", assets: [] },
        options: [
          { key: "A", content_type: "text", text: "1", assets: [] },
          { key: "B", content_type: "text", text: "2", assets: [] }
        ],
        option_order_randomizable: true,
        ext: {}
      },
      answer: {
        judge_mode: "by_option_key",
        correct_keys: ["B"]
      },
      analysis: {
        text: "基础算术"
      },
      bank_ids: [11]
    });

    await client.createQuestionVersion(1001, {
      content: {
        stem: { content_type: "text", text: "1+1=？", assets: [] }
      },
      answer: {
        judge_mode: "by_option_key",
        correct_keys: ["B"]
      },
      analysis: {
        text: "修正后的解析"
      },
      change_summary: "修复题干文案"
    });

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(String(createUrl)).toContain("/questions");
    expect(createInit?.method).toBe("POST");

    const [versionUrl, versionInit] = fetchMock.mock.calls[1];
    expect(String(versionUrl)).toContain("/questions/1001/versions");
    expect(versionInit?.method).toBe("POST");
    expect(versionInit?.body).toBe(
      JSON.stringify({
        content: {
          stem: { content_type: "text", text: "1+1=？", assets: [] }
        },
        answer: {
          judge_mode: "by_option_key",
          correct_keys: ["B"]
        },
        analysis: {
          text: "修正后的解析"
        },
        change_summary: "修复题干文案"
      })
    );
  });

  it("requests notices with filters", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
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
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const result = await client.listNotices({ status: "draft", notice_type: "system" });
    expect(result.items[0].title).toBe("系统维护通知");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/notices?status=draft&notice_type=system");
    expect(init?.method).toBe("GET");
  });

  it("posts publish action for notice resource", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            id: 1,
            tenant_id: 1,
            title: "系统维护通知",
            content: "周五晚维护",
            notice_type: "system",
            publisher_id: 1,
            publish_scope_type: "all",
            publish_scope: {},
            publish_at: "2026-04-22T09:00:00+08:00",
            status: "published"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await client.publishNotice(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/notices/1/publish");
    expect(init?.method).toBe("POST");
  });

  it("marks notification as read", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            id: 10,
            tenant_id: 1,
            recipient_user_id: 1,
            category: "notice",
            title: "系统维护通知",
            content: "周五晚维护",
            source_type: "notice",
            source_id: 1,
            read_at: "2026-04-22T10:00:00+08:00",
            status: "read"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const notification = await client.markNotificationRead(10);
    expect(notification.status).toBe("read");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/notifications/10/read");
    expect(init?.method).toBe("POST");
  });

  it("requests roles and assigns role permissions", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
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
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: 3,
              tenant_id: 1,
              code: "school_reviewer",
              name: "学校审核员",
              role_type: "custom",
              data_scope_type: "subtree",
              status: "active",
              permission_ids: [1, 2]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const roles = await client.listRoles({ status: "active" });
    expect(roles.items[0].name).toBe("学校审核员");

    await client.assignRolePermissions(3, { permission_ids: [1, 2] });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/roles?status=active");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/roles/3/permissions");
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ permission_ids: [1, 2] }));
  });

  it("requests managed users and disables a user", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
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
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: 7,
              tenant_id: 1,
              username: "teacher001",
              display_name: "张老师",
              user_type: "teacher",
              status: "disabled",
              role_ids: [3]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const users = await client.listUsers({ user_type: "teacher", keyword: "张" });
    expect(users.items[0].display_name).toBe("张老师");

    const disabled = await client.disableUser(7);
    expect(disabled.status).toBe("disabled");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/users?user_type=teacher&keyword=%E5%BC%A0");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/users/7/disable");
  });

  it("uploads file assets with form data", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            id: 30001,
            source_type: "upload",
            object_key: "tenant/1/import_file/20260422/questions.csv",
            url: "/api/v1/files/30001/content",
            mime_type: "text/csv",
            file_size: 128,
            status: "active"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });
    const formData = new FormData();
    formData.append("usage", "import_file");
    formData.append("file", new Blob(["id,title\n1,示例题"], { type: "text/csv" }), "questions.csv");

    await client.uploadFile(formData);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/files/upload");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(formData);
  });

  it("imports remote file url and queries asset detail", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: 30002,
              source_type: "remote_url",
              original_url: "https://example.com/assets/question.png",
              object_key: "tenant/1/question_asset/20260422/question.png",
              url: "/api/v1/files/30002/content",
              status: "active"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: 30002,
              source_type: "remote_url",
              original_url: "https://example.com/assets/question.png",
              object_key: "tenant/1/question_asset/20260422/question.png",
              url: "/api/v1/files/30002/content",
              status: "active"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await client.importFileFromUrl({
      url: "https://example.com/assets/question.png",
      usage: "question_asset"
    });
    const detail = await client.getFileAsset(30002);

    expect(detail.source_type).toBe("remote_url");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        url: "https://example.com/assets/question.png",
        usage: "question_asset"
      })
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/files/30002");
  });

  it("downloads import template and manages import jobs", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response("bank_name,course_name\n", { status: 200, headers: { "content-type": "text/csv" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
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
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              items: [],
              page: 1,
              page_size: 20,
              total: 0
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
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
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              items: [
                {
                  id: 11,
                  job_id: 1,
                  row_no: 2,
                  raw_data: { bank_name: "阶段2题库" },
                  status: "failed",
                  error_code: "bank_not_found",
                  error_message: "题库不存在"
                }
              ],
              page: 1,
              page_size: 20,
              total: 1
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    await expect(client.downloadImportTemplate("question")).resolves.toContain("bank_name");
    await client.createImportJob({
      import_type: "question",
      template_version: "v1",
      file_url: "/api/v1/files/1/content",
      content: "bank_name,..."
    });
    await client.listImportJobs({ import_type: "question", status: "partial_success" });
    await client.getImportJob(1);
    const rows = await client.listImportJobRows(1, { status: "failed" });

    expect(rows.items[0].error_code).toBe("bank_not_found");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/import/templates/question");
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      JSON.stringify({
        import_type: "question",
        template_version: "v1",
        file_url: "/api/v1/files/1/content",
        content: "bank_name,..."
      })
    );
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "/import/jobs?import_type=question&status=partial_success"
    );
    expect(String(fetchMock.mock.calls[3][0])).toContain("/import/jobs/1");
    expect(String(fetchMock.mock.calls[4][0])).toContain("/import/jobs/1/rows?status=failed");
  });

  it("manages practice sessions and question states", async () => {
    const sessionData = {
      id: 501,
      tenant_id: 1,
      user_id: 7,
      practice_mode: "random",
      source_mode: "course",
      flow_mode: "fixed_count",
      course_id: 10,
      bank_scope: {},
      bank_ids: [1],
      exclude_mastered: true,
      question_count: 10,
      random_seed: 20260422,
      round_no: 1,
      status: "active",
      questions: [
        {
          session_question_id: 9001,
          session_id: 501,
          question_id: 1001,
          question_version_id: 3001,
          display_order: 1,
          question_type: "single_choice",
          content: {
            stem: { content_type: "text", text: "1+1等于几？", assets: [] },
            options: [
              { key: "A", content_type: "text", text: "1", assets: [] },
              { key: "B", content_type: "text", text: "2", assets: [] }
            ]
          },
          round_no: 1,
          answered: false
        }
      ]
    };
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: "ok", data: sessionData }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: "ok", data: sessionData }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              question: { ...sessionData.questions[0], session_question_id: 9002, display_order: 2 },
              round_no: 1
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              is_correct: true,
              correct_answer: { judge_mode: "by_option_key", correct_keys: ["B"] },
              analysis: { text: "基础算术" },
              state: {
                id: 1,
                tenant_id: 1,
                user_id: 7,
                question_id: 1001,
                question_version_id: 3001,
                practice_correct_count: 1,
                practice_wrong_count: 0,
                exam_wrong_count: 0,
                is_mastered: false,
                is_confused: false
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: "ok", data: { id: 501, status: "finished", answered_count: 1, correct_count: 1, wrong_count: 0 } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: "ok", data: { id: 1, tenant_id: 1, user_id: 7, question_id: 1001, question_version_id: 3001, practice_correct_count: 1, practice_wrong_count: 0, exam_wrong_count: 0, is_mastered: true, is_confused: false } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: "ok", data: { id: 1, tenant_id: 1, user_id: 7, question_id: 1001, question_version_id: 3001, practice_correct_count: 1, practice_wrong_count: 0, exam_wrong_count: 0, is_mastered: true, is_confused: true } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: "ok", data: { items: [], page: 1, page_size: 20, total: 0 } }), { status: 200, headers: { "content-type": "application/json" } }));

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const createdSession = await client.createPracticeSession({
      practice_mode: "random",
      source_mode: "course",
      flow_mode: "fixed_count",
      course_id: 10,
      bank_ids: [1],
      exclude_mastered: true,
      question_count: 10
    });
    expect(createdSession.course_id).toBe(10);
    await client.getPracticeSession(501);
    await client.nextPracticeQuestion(501);
    await client.submitPracticeAnswer(501, {
      session_question_id: 9001,
      answer: { selected_keys: ["B"] }
    });
    await client.finishPracticeSession(501);
    await client.markPracticeQuestionMastered(1001, { value: true });
    await client.markPracticeQuestionConfused(1001, { value: true });
    await client.listUserQuestionStates({ state_type: "wrong", course_id: 10 });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/practice/sessions");
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        practice_mode: "random",
        source_mode: "course",
        flow_mode: "fixed_count",
        course_id: 10,
        bank_ids: [1],
        exclude_mastered: true,
        question_count: 10
      })
    );
    expect(String(fetchMock.mock.calls[2][0])).toContain("/practice/sessions/501/next-question");
    expect(String(fetchMock.mock.calls[3][0])).toContain("/practice/sessions/501/answer");
    expect(String(fetchMock.mock.calls[4][0])).toContain("/practice/sessions/501/finish");
    expect(String(fetchMock.mock.calls[5][0])).toContain("/practice/questions/1001/mark-mastered");
    expect(String(fetchMock.mock.calls[6][0])).toContain("/practice/questions/1001/mark-confused");
    expect(String(fetchMock.mock.calls[7][0])).toContain("/user-question-states?state_type=wrong&course_id=10");
  });

  it("lists practice sessions, reads results, and creates sessions from questions", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              items: [
                {
                  id: 501,
                  practice_mode: "random",
                  source_mode: "question_list",
                  flow_mode: "fixed_count",
                  course_id: 10,
                  bank_ids: [1, 2],
                  status: "finished",
                  total_count: 10,
                  answered_count: 10,
                  correct_count: 8,
                  wrong_count: 2,
                  accuracy: 0.8
                }
              ],
              page: 1,
              page_size: 20,
              total: 1
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              session: {
                id: 501,
                practice_mode: "random",
                source_mode: "question_list",
                flow_mode: "fixed_count",
                course_id: 10,
                bank_ids: [1, 2],
                status: "finished",
                total_count: 10,
                answered_count: 10,
                correct_count: 8,
                wrong_count: 2,
                accuracy: 0.8
              },
              questions: []
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: 502,
              tenant_id: 1,
              user_id: 7,
              practice_mode: "random",
              source_mode: "question_list",
              flow_mode: "fixed_count",
              course_id: 10,
              bank_scope: { source_mode: "question_list" },
              bank_ids: [1, 2],
              exclude_mastered: false,
              question_count: 10,
              random_seed: 20260422,
              round_no: 1,
              status: "active",
              questions: []
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const listResult = await client.listPracticeSessions({
      status: "finished",
      flow_mode: "fixed_count",
      course_id: 10
    });
    expect(listResult.items[0].id).toBe(501);
    expect(listResult.items[0].course_id).toBe(10);

    const results = await client.getPracticeSessionResults(501);
    expect(results.session.id).toBe(501);
    expect(results.session.course_id).toBe(10);

    const body = {
      question_ids: [1001, 1002],
      practice_mode: "random",
      flow_mode: "fixed_count",
      question_count: 10,
      exclude_mastered: false
    } satisfies {
      question_ids: number[];
      practice_mode: string;
      flow_mode: string;
      question_count: number;
      exclude_mastered: boolean;
    };
    await client.createPracticeSessionFromQuestions(body);

    const [listUrl, listInit] = fetchMock.mock.calls[0];
    expect(String(listUrl)).toContain("/practice/sessions?status=finished&flow_mode=fixed_count&course_id=10");
    expect(listInit?.method).toBe("GET");

    const [resultsUrl, resultsInit] = fetchMock.mock.calls[1];
    expect(String(resultsUrl)).toContain("/practice/sessions/501/results");
    expect(resultsInit?.method).toBe("GET");

    const [createUrl, createInit] = fetchMock.mock.calls[2];
    expect(String(createUrl)).toContain("/practice/sessions/from-questions");
    expect(createInit?.method).toBe("POST");
    expect(createInit?.body).toBe(JSON.stringify(body));
  });

  it("queries class practice summary analytics", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            summary: {
              class_id: 301,
              class_name: "七年级一班",
              course_id: 10,
              course_name: "数学",
              student_count: 2,
              participated_student_count: 1,
              session_count: 3,
              answered_count: 20,
              correct_count: 16,
              wrong_count: 4,
              accuracy: 0.8,
              wrong_question_count: 2,
              confused_question_count: 1
            },
            students: {
              items: [
                {
                  student_id: 7,
                  student_name: "李同学",
                  student_no: "stu_007",
                  session_count: 2,
                  answered_count: 12,
                  correct_count: 9,
                  wrong_count: 3,
                  accuracy: 0.75,
                  wrong_question_count: 2,
                  confused_question_count: 1,
                  last_practiced_at: "2026-04-22T10:00:00+08:00"
                }
              ],
              page: 1,
              page_size: 20,
              total: 1
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const result = await client.getClassPracticeSummary({
      class_id: 301,
      course_id: 10,
      start_at: "2026-04-01T00:00:00+08:00",
      end_at: "2026-04-22T23:59:59+08:00",
      page: 1,
      page_size: 20
    });
    expect(result.summary.accuracy).toBe(0.8);
    expect(result.students.items[0].student_name).toBe("李同学");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/analytics/class-practice-summary?class_id=301&course_id=10&start_at=2026-04-01T00%3A00%3A00%2B08%3A00&end_at=2026-04-22T23%3A59%3A59%2B08%3A00&page=1&page_size=20"
    );
    expect(init?.method).toBe("GET");
  });

  it("queries class course options analytics", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            items: [
              {
                class_id: 301,
                class_name: "七年级一班",
                courses: [
                  {
                    course_id: 10,
                    course_name: "数学"
                  }
                ]
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      accessToken: "access_token",
      fetch: fetchMock
    });

    const result = await client.listClassCourseOptions();
    expect(result.items[0].courses[0].course_name).toBe("数学");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/analytics/class-course-options");
    expect(init?.method).toBe("GET");
  });

  it("throws ApiError for error envelopes", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(
        JSON.stringify({
          code: 40101,
          message: "login required",
          request_id: "req_2"
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    });

    const client = createApiClient({
      baseUrl: "http://localhost:8080/api/v1",
      fetch: fetchMock
    });

    await expect(client.get("/users/me")).rejects.toMatchObject({
      code: 40101,
      message: "login required",
      requestId: "req_2",
      status: 401
    } satisfies Partial<ApiError>);
  });

  it("calls onUnauthorized when response status is 401", async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:18081/api/v1",
      accessToken: "access-1",
      onUnauthorized,
      fetch: async () =>
        new Response(JSON.stringify({ code: 40101, message: "令牌无效" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
    });

    await expect(client.me()).rejects.toThrow("令牌无效");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("calls onUnauthorized for 401 responses with plain text bodies", async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:18081/api/v1",
      accessToken: "access-1",
      onUnauthorized,
      fetch: async () =>
        new Response("token expired", {
          status: 401,
          headers: { "Content-Type": "text/plain" }
        })
    });

    await expect(client.me()).rejects.toMatchObject({
      message: "token expired",
      status: 401
    } satisfies Partial<ApiError>);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("calls onUnauthorized for 401 responses with empty bodies", async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:18081/api/v1",
      accessToken: "access-1",
      onUnauthorized,
      fetch: async () =>
        new Response(null, {
          status: 401
        })
    });

    await expect(client.me()).rejects.toMatchObject({
      message: "Unauthorized",
      status: 401
    } satisfies Partial<ApiError>);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
