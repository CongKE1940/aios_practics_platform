import { describe, expect, it } from "vitest";

import {
  canAccess,
  filterMenuByPermissions,
  resolveRouteAccess,
  type PermissionMenuItem
} from "./permissions";

describe("canAccess", () => {
  it("allows routes without required permissions", () => {
    expect(canAccess(["user.read"], [])).toBe(true);
  });

  it("requires every declared permission", () => {
    expect(canAccess(["user.read", "role.read"], ["user.read", "role.read"])).toBe(true);
    expect(canAccess(["user.read"], ["user.read", "role.read"])).toBe(false);
  });
});

describe("filterMenuByPermissions", () => {
  it("keeps parent menus when at least one child is visible", () => {
    const menus: PermissionMenuItem[] = [
      {
        key: "system",
        label: "系统管理",
        requiredPermissions: ["system.view"],
        children: [
          { key: "users", label: "用户管理", requiredPermissions: ["user.read"] },
          { key: "roles", label: "角色管理", requiredPermissions: ["role.read"] }
        ]
      }
    ];

    expect(filterMenuByPermissions(menus, ["system.view", "user.read"])).toEqual([
      {
        key: "system",
        label: "系统管理",
        requiredPermissions: ["system.view"],
        children: [{ key: "users", label: "用户管理", requiredPermissions: ["user.read"] }]
      }
    ]);
  });
});

describe("resolveRouteAccess", () => {
  it("returns a stable denial reason for guarded routes", () => {
    expect(resolveRouteAccess(["user.read"], ["role.read"])).toEqual({
      allowed: false,
      reason: "PERMISSION_DENIED"
    });
  });
});
