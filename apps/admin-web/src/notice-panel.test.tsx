// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Notice, NotificationItem, PageResult } from "@aios/api-sdk";

import { NoticePanel, type NoticeApi } from "./notice-panel";

afterEach(() => {
  cleanup();
});

describe("NoticePanel", () => {
  it("loads and renders notices with notifications", async () => {
    render(
      <NoticePanel
        api={createNoticeApi({
          notices: [
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
          notifications: [
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
          ]
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("系统维护通知").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("周五晚维护")).toBeTruthy();
  });

  it("creates notice and marks notification as read", async () => {
    const listNotices = vi
      .fn<NoticeApi["listNotices"]>()
      .mockResolvedValueOnce(pageOf([]))
      .mockResolvedValueOnce(
        pageOf([
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
        ])
      );
    const createNotice = vi.fn<NoticeApi["createNotice"]>().mockResolvedValue({
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
    });
    const markNotificationRead = vi.fn<NoticeApi["markNotificationRead"]>().mockResolvedValue({
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
    });

    render(
      <NoticePanel
        api={{
          ...createNoticeApi({
            notifications: [
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
            ]
          }),
          listNotices,
          createNotice,
          markNotificationRead
        }}
      />
    );

    await waitFor(() => {
      expect(listNotices).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("公告标题"), { target: { value: "系统维护通知" } });
    fireEvent.change(screen.getByLabelText("公告内容"), { target: { value: "周五晚维护" } });
    fireEvent.change(screen.getByLabelText("发布时间"), { target: { value: "2026-04-22T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "新增公告" }));

    await waitFor(() => {
      expect(createNotice).toHaveBeenCalledTimes(1);
      expect(listNotices).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "标记已读" }));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith(10);
    });
  });
});

function createNoticeApi(seed?: {
  notices?: Notice[];
  notifications?: NotificationItem[];
}): NoticeApi {
  return {
    listNotices: async () => pageOf(seed?.notices ?? []),
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
    listNotifications: async () => pageOf(seed?.notifications ?? []),
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
