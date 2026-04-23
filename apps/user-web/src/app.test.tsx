// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiSdk from "@aios/api-sdk";

import type { UserSessionState, UserSessionStore } from "./auth-types";
import { UserApp } from "./app";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("UserApp", () => {
  it("shows login form when no session exists", () => {
    render(<UserApp />);

    expect(screen.getByRole("heading", { name: "AIOS 学生端" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
    expect(screen.getByLabelText("租户编码")).toBeTruthy();
    expect(screen.getByLabelText("用户名")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "练题中心" })).toBeNull();
  });

  it("restores session from localStorage on startup", async () => {
    window.localStorage.setItem("aios.user.session", JSON.stringify(createSession([
      { id: 21, name: "我的课程", path: "/app/courses", children: [] },
      { id: 22, name: "练题中心", path: "/app/practice", children: [] }
    ])));

    render(<UserApp practiceApi={createPracticeApiMock()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "李同学" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "练题中心" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
    });
  });

  it("restores session when user.permissions is omitted", async () => {
    const sessionWithoutPermissions = createSession([
      { id: 21, name: "我的课程", path: "/app/courses", children: [] }
    ]);
    delete (sessionWithoutPermissions.user as { permissions?: string[] }).permissions;
    window.localStorage.setItem("aios.user.session", JSON.stringify(sessionWithoutPermissions));

    render(<UserApp practiceApi={createPracticeApiMock()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "李同学" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
      expect(window.localStorage.getItem("aios.user.session")).not.toBeNull();
    });
  });

  it("clears invalid session payload from localStorage and falls back to login", async () => {
    window.localStorage.setItem(
      "aios.user.session",
      JSON.stringify({
        accessToken: "access-1",
        menus: [{ id: 21, name: "我的课程", path: "/app/courses", children: [] }]
      })
    );

    render(<UserApp practiceApi={createPracticeApiMock()} />);

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
      expect(window.localStorage.getItem("aios.user.session")).toBeNull();
      expect(screen.queryByRole("heading", { name: "李同学" })).toBeNull();
    });
  });

  it("keeps parent menus clickable while still rendering their children", async () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={createPracticeApiMock()}
        sessionStore={createSessionStore(
          createSession([
            {
              id: 2,
              name: "学习中心",
              path: "/app",
              children: [
                { id: 21, name: "我的课程", path: "/app/courses", children: [] },
                { id: 22, name: "练题中心", path: "/app/practice", children: [] }
              ]
            }
          ])
        )}
      />
    );

    const parentButton = screen.getByRole("button", { name: "学习中心" });
    expect(parentButton).toBeTruthy();
    expect(screen.getByRole("button", { name: "我的课程" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "练题中心" })).toBeTruthy();

    fireEvent.click(parentButton);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
      expect(parentButton.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("shows the empty state without hiding the current user controls", () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={createPracticeApiMock()}
        sessionStore={createSessionStore(createSession([]))}
      />
    );

    expect(screen.getAllByText("当前账号暂无可用功能")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "AIOS 学生端" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "李同学" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "我的课程" })).toBeNull();
    expect(screen.queryByRole("button", { name: "我的课程" })).toBeNull();
  });

  it("renders the learner shell", () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={createPracticeApiMock()}
        sessionStore={createSessionStore(
          createSession([
            { id: 21, name: "我的课程", path: "/app/courses", children: [] },
            { id: 22, name: "练题中心", path: "/app/practice", children: [] },
            { id: 23, name: "班级学习", path: "/app/class-learning", children: [] },
            { id: 24, name: "练题记录", path: "/app/practice/history", children: [] },
            { id: 25, name: "错题本", path: "/app/practice/wrong", children: [] },
            { id: 26, name: "熟题本", path: "/app/practice/mastered", children: [] },
            { id: 27, name: "疑惑题", path: "/app/practice/confused", children: [] }
          ])
        )}
      />
    );

    expect(screen.getByRole("heading", { name: "AIOS 学生端" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "李同学" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "班级学习" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "练题记录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "错题本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "熟题本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "疑惑题" })).toBeTruthy();
  });

  it("renders user menus from session and defaults to the first available menu", () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={createPracticeApiMock()}
        sessionStore={createSessionStore(
          createSession([
            {
              id: 2,
              name: "学习中心",
              path: "/app",
              children: [
                { id: 21, name: "我的课程", path: "/app/courses", children: [] },
                { id: 22, name: "练题中心", path: "/app/practice", children: [] }
              ]
            }
          ])
        )}
      />
    );

    expect(screen.getByText("李同学")).toBeTruthy();
    expect(screen.getByRole("button", { name: "我的课程" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "练题中心" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "班级学习" })).toBeNull();
    expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
  });

  it("clears session and returns to login page after logout", async () => {
    const sessionStore = createSessionStore(
      createSession([
        {
          id: 2,
          name: "学习中心",
          path: "/app",
          children: [{ id: 21, name: "我的课程", path: "/app/courses", children: [] }]
        }
      ])
    );
    const logout = vi.fn(async (_accessToken: string) => true);

    render(
      <UserApp
        authApi={{
          login: async () => {
            throw new Error("should not login");
          },
          logout: async (accessToken: string) => logout(accessToken),
          menus: async () => []
        }}
        practiceApi={createPracticeApiMock()}
        sessionStore={sessionStore}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
      expect(logout).toHaveBeenCalledWith("access-1");
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
      expect(sessionStore.load()).toBeNull();
    });
  });

  it("uses the current session token for default logout", async () => {
    const sessionStore = createSessionStore(
      createSession([
        {
          id: 2,
          name: "学习中心",
          path: "/app",
          children: [{ id: 21, name: "我的课程", path: "/app/courses", children: [] }]
        }
      ])
    );
    const logout = vi.fn(async (_accessToken: string) => true);
    const createApiClientSpy = vi.spyOn(apiSdk, "createApiClient").mockImplementation(({ accessToken }) => {
      if (accessToken === "access-1") {
        return {
          logout
        } as never;
      }

      return {
        login: async () => ({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 7200,
          user: {
            id: 7,
            tenant_id: 1,
            display_name: "李同学",
            user_type: "student",
            roles: ["student"],
            permissions: ["practice:use"]
          }
        }),
        menus: async () => []
      } as never;
    });

    render(<UserApp practiceApi={createPracticeApiMock()} sessionStore={sessionStore} />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(createApiClientSpy).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "access-1" })
      );
      expect(logout).toHaveBeenCalledTimes(1);
      expect(sessionStore.load()).toBeNull();
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
    });
  });

  it("passes the current access token to injected authApi logout", async () => {
    const logout = vi.fn(async (_accessToken: string) => true);

    render(
      <UserApp
        authApi={{
          login: async () => {
            throw new Error("should not login");
          },
          logout: async (accessToken: string) => logout(accessToken),
          menus: async () => []
        }}
        practiceApi={createPracticeApiMock()}
        sessionStore={createSessionStore(
          createSession([{ id: 21, name: "我的课程", path: "/app/courses", children: [] }])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
      expect(logout).toHaveBeenCalledWith("access-1");
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
    });
  });

  it("queries class learning analytics from the learner shell", async () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={{
          ...createPracticeApiMock(),
          listClassCourseOptions: async () => ({
            items: [
              {
                class_id: 301,
                class_name: "七年级一班",
                courses: [
                  { course_id: 10, course_name: "数学" },
                  { course_id: 11, course_name: "语文" }
                ]
              }
            ]
          }),
          getClassPracticeSummary: async () => ({
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
              confused_question_count: 1,
              last_practiced_at: "2026-04-22T10:00:00+08:00"
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
          })
        }}
        sessionStore={createSessionStore(
          createSession([
            { id: 21, name: "我的课程", path: "/app/courses", children: [] },
            { id: 23, name: "班级学习", path: "/app/class-learning", children: [] }
          ])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "班级学习" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "七年级一班" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "七年级一班" }));
    fireEvent.click(screen.getByRole("button", { name: "数学" }));
    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "班级学习" })).toBeTruthy();
      expect(screen.getByText("七年级一班 / 数学")).toBeTruthy();
      expect(screen.getByText("李同学", { selector: "p" })).toBeTruthy();
      expect(screen.getByText("正确率：75%")).toBeTruthy();
    });
  });

  it("navigates to student learning detail page from class learning result list", async () => {
    const getStudentPracticeDetail = vi.fn(async () => ({
      student_summary: {
        student_user_id: 7,
        student_name: "李同学",
        student_no: "stu_007",
        class_id: 301,
        class_name: "七年级一班",
        course_id: 10,
        course_name: "数学",
        session_count: 2,
        answered_count: 12,
        correct_count: 9,
        wrong_count: 3,
        accuracy: 0.75,
        wrong_question_count: 2,
        confused_question_count: 1,
        last_practiced_at: "2026-04-22T10:00:00+08:00"
      },
      active_tab: "sessions" as const,
      sessions: { items: [], page: 1, page_size: 20, total: 0 },
      wrong_questions: { items: [], page: 1, page_size: 20, total: 0 },
      confused_questions: { items: [], page: 1, page_size: 20, total: 0 }
    }));

    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={{
          ...createPracticeApiMock(),
          listClassCourseOptions: async () => ({
            items: [
              {
                class_id: 301,
                class_name: "七年级一班",
                courses: [{ course_id: 10, course_name: "数学" }]
              }
            ]
          }),
          getClassPracticeSummary: async () => ({
            summary: {
              class_id: 301,
              class_name: "七年级一班",
              course_id: 10,
              course_name: "数学",
              student_count: 1,
              participated_student_count: 1,
              session_count: 2,
              answered_count: 12,
              correct_count: 9,
              wrong_count: 3,
              accuracy: 0.75,
              wrong_question_count: 2,
              confused_question_count: 1,
              last_practiced_at: "2026-04-22T10:00:00+08:00"
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
          }),
          getStudentPracticeDetail
        }}
        sessionStore={createSessionStore(
          createSession([{ id: 23, name: "班级学习", path: "/app/class-learning", children: [] }])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "班级学习" }));
    await waitFor(() => {
      expect(screen.getByText("当前已选：七年级一班 / 数学")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "查询班级学习" }));
    await waitFor(() => expect(screen.getByText("李同学", { selector: "p" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() => {
      expect(getStudentPracticeDetail).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("heading", { name: "李同学" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "班级学习" })).toBeTruthy();
      expect(screen.getByText("当前已选：七年级一班 / 数学")).toBeTruthy();
    });
  });

  it("keeps legacy class learning callers from crashing when course options are unavailable", async () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={{
          ...createPracticeApiMock(),
          getClassPracticeSummary: async () => ({
            summary: {
              class_id: 301,
              class_name: "七年级一班",
              course_id: 10,
              course_name: "数学",
              student_count: 0,
              participated_student_count: 0,
              session_count: 0,
              answered_count: 0,
              correct_count: 0,
              wrong_count: 0,
              accuracy: 0,
              wrong_question_count: 0,
              confused_question_count: 0
            },
            students: {
              items: [],
              page: 1,
              page_size: 20,
              total: 0
            }
          })
        }}
        sessionStore={createSessionStore(
          createSession([{ id: 23, name: "班级学习", path: "/app/class-learning", children: [] }])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "班级学习" }));

    await waitFor(() => {
      expect(screen.getByText("当前班级学习功能暂不可用。")).toBeTruthy();
    });
  });

  it("opens practice panel after selecting practice menu", async () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={createPracticeApiMock()}
        sessionStore={createSessionStore(
          createSession([{ id: 22, name: "练题中心", path: "/app/practice", children: [] }])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "练题中心" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题中心" })).toBeTruthy();
    });
  });

  it("navigates to result page after finishing practice", async () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={{
          ...createPracticeApiMock(),
          createPracticeSession: async () => ({
            id: 501,
            tenant_id: 1,
            user_id: 7,
            practice_mode: "random",
            source_mode: "single_bank",
            flow_mode: "fixed_count",
            bank_scope: {},
            bank_ids: [1],
            exclude_mastered: false,
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
          }),
          getPracticeSession: async () => ({
            id: 501,
            tenant_id: 1,
            user_id: 7,
            practice_mode: "random",
            source_mode: "single_bank",
            flow_mode: "fixed_count",
            bank_scope: {},
            bank_ids: [1],
            exclude_mastered: false,
            question_count: 10,
            random_seed: 20260422,
            round_no: 1,
            status: "active",
            questions: []
          }),
          nextPracticeQuestion: async () => ({
            question: {
              session_question_id: 9002,
              session_id: 501,
              question_id: 1002,
              question_version_id: 3002,
              display_order: 2,
              question_type: "single_choice",
              content: {},
              round_no: 1,
              answered: false
            },
            round_no: 1
          }),
          submitPracticeAnswer: async () => ({
            is_correct: true,
            correct_answer: {},
            analysis: {},
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
          }),
          finishPracticeSession: async () => ({
            id: 501,
            status: "finished",
            answered_count: 1,
            correct_count: 1,
            wrong_count: 0
          }),
          listPracticeSessions: async () => ({ items: [], page: 1, page_size: 20, total: 0 }),
          getPracticeSessionResults: async () => ({
            session: {
              id: 501,
              practice_mode: "random",
              source_mode: "single_bank",
              flow_mode: "fixed_count",
              bank_ids: [1],
              status: "finished",
              total_count: 1,
              answered_count: 1,
              correct_count: 1,
              wrong_count: 0,
              accuracy: 1
            },
            questions: []
          }),
          createPracticeSessionFromQuestions: async () => ({
            id: 777,
            tenant_id: 1,
            user_id: 7,
            practice_mode: "random",
            source_mode: "question_list",
            flow_mode: "fixed_count",
            bank_scope: { source_mode: "question_list" },
            bank_ids: [1],
            exclude_mastered: false,
            question_count: 10,
            random_seed: 20260422,
            round_no: 1,
            status: "active",
            questions: []
          }),
          markPracticeQuestionMastered: async () => ({
            id: 1,
            tenant_id: 1,
            user_id: 7,
            question_id: 1001,
            question_version_id: 3001,
            practice_correct_count: 1,
            practice_wrong_count: 0,
            exam_wrong_count: 0,
            is_mastered: true,
            is_confused: false
          }),
          markPracticeQuestionConfused: async () => ({
            id: 1,
            tenant_id: 1,
            user_id: 7,
            question_id: 1001,
            question_version_id: 3001,
            practice_correct_count: 1,
            practice_wrong_count: 0,
            exam_wrong_count: 0,
            is_mastered: false,
            is_confused: true
          }),
          listUserQuestionStates: async () => ({ items: [], page: 1, page_size: 20, total: 0 })
        }}
        sessionStore={createSessionStore(
          createSession([{ id: 22, name: "练题中心", path: "/app/practice", children: [] }])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "练题中心" }));
    fireEvent.change(screen.getByLabelText("题库ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "开始练题" }));

    await waitFor(() => {
      expect(screen.getByText("1+1等于几？")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "退出练题" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题结果" })).toBeTruthy();
    });
  });

  it("navigates to review pages from the learner shell", async () => {
    render(
      <UserApp
        authApi={createAuthApiMock()}
        practiceApi={{
          ...createPracticeApiMock(),
          createPracticeSession: async () => ({
            id: 501,
            tenant_id: 1,
            user_id: 7,
            practice_mode: "random",
            source_mode: "single_bank",
            flow_mode: "fixed_count",
            bank_scope: {},
            bank_ids: [1],
            exclude_mastered: false,
            question_count: 10,
            random_seed: 20260422,
            round_no: 1,
            status: "active",
            questions: []
          }),
          getPracticeSession: async () => ({
            id: 501,
            tenant_id: 1,
            user_id: 7,
            practice_mode: "random",
            source_mode: "single_bank",
            flow_mode: "fixed_count",
            bank_scope: {},
            bank_ids: [1],
            exclude_mastered: false,
            question_count: 10,
            random_seed: 20260422,
            round_no: 1,
            status: "active",
            questions: []
          }),
          nextPracticeQuestion: async () => ({
            question: {
              session_question_id: 9001,
              session_id: 501,
              question_id: 1001,
              question_version_id: 3001,
              display_order: 1,
              question_type: "single_choice",
              content: {},
              round_no: 1,
              answered: false
            },
            round_no: 1
          }),
          submitPracticeAnswer: async () => ({
            is_correct: true,
            correct_answer: {},
            analysis: {},
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
          }),
          finishPracticeSession: async () => ({
            id: 501,
            status: "finished",
            answered_count: 0,
            correct_count: 0,
            wrong_count: 0
          }),
          listPracticeSessions: async () => ({
            items: [
              {
                id: 501,
                practice_mode: "random",
                source_mode: "question_list",
                flow_mode: "fixed_count",
                bank_ids: [1],
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
          }),
          getPracticeSessionResults: async () => ({
            session: {
              id: 501,
              practice_mode: "random",
              source_mode: "question_list",
              flow_mode: "fixed_count",
              bank_ids: [1],
              status: "finished",
              total_count: 10,
              answered_count: 10,
              correct_count: 8,
              wrong_count: 2,
              accuracy: 0.8
            },
            questions: []
          }),
          createPracticeSessionFromQuestions: async () => ({
            id: 777,
            tenant_id: 1,
            user_id: 7,
            practice_mode: "random",
            source_mode: "question_list",
            flow_mode: "fixed_count",
            bank_scope: { source_mode: "question_list" },
            bank_ids: [1],
            exclude_mastered: false,
            question_count: 10,
            random_seed: 20260422,
            round_no: 1,
            status: "active",
            questions: []
          }),
          markPracticeQuestionMastered: async () => ({
            id: 1,
            tenant_id: 1,
            user_id: 7,
            question_id: 1001,
            question_version_id: 3001,
            practice_correct_count: 1,
            practice_wrong_count: 0,
            exam_wrong_count: 0,
            is_mastered: true,
            is_confused: false
          }),
          markPracticeQuestionConfused: async () => ({
            id: 1,
            tenant_id: 1,
            user_id: 7,
            question_id: 1001,
            question_version_id: 3001,
            practice_correct_count: 1,
            practice_wrong_count: 0,
            exam_wrong_count: 0,
            is_mastered: true,
            is_confused: true
          }),
          listUserQuestionStates: async () => ({
            items: [
              {
                id: 1,
                tenant_id: 1,
                user_id: 7,
                question_id: 1001,
                question_version_id: 3001,
                practice_correct_count: 0,
                practice_wrong_count: 1,
                exam_wrong_count: 0,
                is_mastered: false,
                is_confused: false
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          })
        }}
        sessionStore={createSessionStore(
          createSession([
            { id: 21, name: "我的课程", path: "/app/courses", children: [] },
            { id: 24, name: "练题记录", path: "/app/practice/history", children: [] },
            { id: 25, name: "错题本", path: "/app/practice/wrong", children: [] },
            { id: 26, name: "熟题本", path: "/app/practice/mastered", children: [] },
            { id: 27, name: "疑惑题", path: "/app/practice/confused", children: [] }
          ])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "练题记录" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "练题记录" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "错题本" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "错题本" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "熟题本" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "熟题本" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "疑惑题" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "疑惑题" })).toBeTruthy();
    });
  });

  it("logs in and stores user session", async () => {
    render(
      <UserApp
        authApi={{
          login: async () => ({
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_in: 7200,
          user: {
              id: 7,
              tenant_id: 1,
              display_name: "张老师",
              user_type: "teacher",
              roles: ["teacher"],
              permissions: ["practice:use", "analytics:view"]
            }
          }),
          logout: async (_accessToken: string) => true,
          menus: async () => [
            {
              id: 2,
              name: "学习中心",
              path: "/app",
              children: [
                { id: 22, name: "练题中心", path: "/app/practice", children: [] },
                { id: 27, name: "班级学习", path: "/app/class-learning", children: [] }
              ]
            }
          ]
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "school-a" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "teacher01" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "练题中心" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "练题中心" })).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem("aios.user.session") ?? "{}").accessToken).toBe("access-1");
    });
  });

  it("shows the login error message when auth.login returns 401", async () => {
    render(
      <UserApp
        authApi={{
          login: async () => {
            const error = new Error("用户名或密码错误") as Error & { status?: number };
            error.status = 401;
            throw error;
          },
          logout: async (_accessToken: string) => true,
          menus: async () => []
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "school-a" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "teacher01" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
      expect(screen.getByText("用户名或密码错误")).toBeTruthy();
      expect(screen.queryByText("登录已失效，请重新登录")).toBeNull();
      expect(window.localStorage.getItem("aios.user.session")).toBeNull();
    });
  });

  it("uses the login token when loading menus in the default auth flow", async () => {
    const createApiClientSpy = vi.spyOn(apiSdk, "createApiClient").mockImplementation(({ accessToken }) => {
      if (!accessToken) {
        return {
          login: async () => ({
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_in: 7200,
            user: {
              id: 7,
              tenant_id: 1,
              display_name: "张老师",
              user_type: "teacher",
              roles: ["teacher"],
              permissions: ["practice:use"]
            }
          })
        } as never;
      }

      return {
        menus: async (appType: string) => {
          expect(accessToken).toBe("access-1");
          expect(appType).toBe("user");
          return [
            {
              id: 2,
              name: "学习中心",
              path: "/app",
              children: [{ id: 22, name: "练题中心", path: "/app/practice", children: [] }]
            }
          ];
        }
      } as never;
    });

    render(<UserApp />);

    fireEvent.change(screen.getByLabelText("租户编码"), { target: { value: "school-a" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "teacher01" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(createApiClientSpy).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "access-1" }));
      expect(JSON.parse(window.localStorage.getItem("aios.user.session") ?? "{}")).toMatchObject({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresIn: 7200,
        menus: [
          {
            id: 2,
            name: "学习中心",
            path: "/app",
            children: [{ id: 22, name: "练题中心", path: "/app/practice", children: [] }]
          }
        ]
      });
    });
  });

  it("returns to login page when an injected protected api call responds 401", async () => {
    render(
      <UserApp
        practiceApi={{
          ...createPracticeApiMock(),
          listClassCourseOptions: async () => {
            const error = new Error("令牌无效") as Error & { status?: number };
            error.status = 401;
            throw error;
          },
          getClassPracticeSummary: async () => {
            throw new Error("should not load summary");
          }
        }}
        sessionStore={createSessionStore(
          createSession([
            {
              id: 2,
              name: "学习中心",
              path: "/app",
              children: [{ id: 27, name: "班级学习", path: "/app/class-learning", children: [] }]
            }
          ])
        )}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "班级学习" }));

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
      expect(screen.getByText("登录已失效，请重新登录")).toBeTruthy();
    });
  });

  it("handles sdk-created protected api 401 only once", async () => {
    const clear = vi.fn();
    const session = createSession([
      {
        id: 2,
        name: "学习中心",
        path: "/app",
        children: [{ id: 27, name: "班级学习", path: "/app/class-learning", children: [] }]
      }
    ]);
    const sessionStore: UserSessionStore = {
      load: () => session,
      save: vi.fn(),
      clear
    };
    const createApiClientSpy = vi.spyOn(apiSdk, "createApiClient").mockImplementation((options) => {
      if (!options.accessToken) {
        return {
          login: async () => {
            throw new Error("should not login");
          },
          logout: async (_accessToken: string) => true,
          menus: async () => []
        } as never;
      }

      return {
        listClassCourseOptions: async () => {
          options.onUnauthorized?.();
          const error = new Error("令牌无效") as Error & { status?: number };
          error.status = 401;
          throw error;
        },
        getClassPracticeSummary: async () => {
          throw new Error("should not load summary");
        }
      } as never;
    });

    render(<UserApp authApi={createAuthApiMock()} sessionStore={sessionStore} />);

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "登录表单" })).toBeTruthy();
      expect(screen.getByText("登录已失效，请重新登录")).toBeTruthy();
    });

    expect(createApiClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-1", onUnauthorized: expect.any(Function) })
    );
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

function createSessionStore(initialSession: UserSessionState): UserSessionStore {
  let currentSession: UserSessionState | null = initialSession;

  return {
    load() {
      return currentSession;
    },
    save(session) {
      currentSession = session;
    },
    clear() {
      currentSession = null;
    }
  };
}

function createSession(menus: UserSessionState["menus"]): UserSessionState {
  return {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresIn: 7200,
    menus,
    user: {
      id: 7,
      tenant_id: 1,
      display_name: "李同学",
      user_type: "student",
      roles: ["student"],
      permissions: ["practice:use", "analytics:view"]
    }
  };
}

function createAuthApiMock() {
  return {
    login: async () => {
      throw new Error("should not login");
    },
    logout: async (_accessToken: string) => true,
    menus: async () => []
  };
}

function createPracticeApiMock() {
  return {
    createPracticeSession: async () => ({
      id: 501,
      tenant_id: 1,
      user_id: 7,
      practice_mode: "random",
      source_mode: "single_bank",
      flow_mode: "fixed_count",
      bank_scope: {},
      bank_ids: [1],
      exclude_mastered: false,
      question_count: 10,
      random_seed: 20260422,
      round_no: 1,
      status: "active",
      questions: []
    }),
    getPracticeSession: async () => ({
      id: 501,
      tenant_id: 1,
      user_id: 7,
      practice_mode: "random",
      source_mode: "single_bank",
      flow_mode: "fixed_count",
      bank_scope: {},
      bank_ids: [1],
      exclude_mastered: false,
      question_count: 10,
      random_seed: 20260422,
      round_no: 1,
      status: "active",
      questions: []
    }),
    nextPracticeQuestion: async () => ({
      question: {
        session_question_id: 9001,
        session_id: 501,
        question_id: 1001,
        question_version_id: 3001,
        display_order: 1,
        question_type: "single_choice",
        content: {},
        round_no: 1,
        answered: false
      },
      round_no: 1
    }),
    submitPracticeAnswer: async () => ({
      is_correct: true,
      correct_answer: {},
      analysis: {},
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
    }),
    finishPracticeSession: async () => ({
      id: 501,
      status: "finished",
      answered_count: 0,
      correct_count: 0,
      wrong_count: 0
    }),
    listPracticeSessions: async () => ({
      items: [],
      page: 1,
      page_size: 20,
      total: 0
    }),
    getPracticeSessionResults: async () => ({
      session: {
        id: 501,
        practice_mode: "random",
        source_mode: "question_list",
        flow_mode: "fixed_count",
        bank_ids: [1],
        status: "finished",
        total_count: 0,
        answered_count: 0,
        correct_count: 0,
        wrong_count: 0,
        accuracy: 0
      },
      questions: []
    }),
    createPracticeSessionFromQuestions: async () => ({
      id: 502,
      tenant_id: 1,
      user_id: 7,
      practice_mode: "random",
      source_mode: "question_list",
      flow_mode: "fixed_count",
      bank_scope: { source_mode: "question_list" },
      bank_ids: [1],
      exclude_mastered: false,
      question_count: 10,
      random_seed: 20260422,
      round_no: 1,
      status: "active",
      questions: []
    }),
    markPracticeQuestionMastered: async () => ({
      id: 1,
      tenant_id: 1,
      user_id: 7,
      question_id: 1001,
      question_version_id: 3001,
      practice_correct_count: 1,
      practice_wrong_count: 0,
      exam_wrong_count: 0,
      is_mastered: true,
      is_confused: false
    }),
    markPracticeQuestionConfused: async () => ({
      id: 1,
      tenant_id: 1,
      user_id: 7,
      question_id: 1001,
      question_version_id: 3001,
      practice_correct_count: 1,
      practice_wrong_count: 0,
      exam_wrong_count: 0,
      is_mastered: true,
      is_confused: true
    }),
    listUserQuestionStates: async () => ({
      items: [],
      page: 1,
      page_size: 20,
      total: 0
    })
  };
}
