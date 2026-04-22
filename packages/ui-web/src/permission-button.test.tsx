// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PermissionButton } from "./permission-button";

afterEach(() => {
  cleanup();
});

describe("PermissionButton", () => {
  it("renders the button when all permissions are available", () => {
    render(
      <PermissionButton
        permissions={["notice.create", "notice.read"]}
        requiredPermissions={["notice.create"]}
      >
        新增公告
      </PermissionButton>
    );

    expect(screen.getByRole("button", { name: "新增公告" })).toBeTruthy();
  });

  it("hides the button when permission is missing", () => {
    render(
      <PermissionButton permissions={["notice.read"]} requiredPermissions={["notice.create"]}>
        新增公告
      </PermissionButton>
    );

    expect(screen.queryByRole("button", { name: "新增公告" })).toBeNull();
  });
});
