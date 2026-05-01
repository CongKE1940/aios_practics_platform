// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FixedActionList, type FixedActionListColumn } from "./fixed-action-list";

interface Row {
  id: number;
  name: string;
}

const columns: Array<FixedActionListColumn<Row>> = [
  {
    key: "name",
    title: "名称",
    render: (row) => row.name
  }
];

afterEach(() => {
  cleanup();
});

describe("FixedActionList permissions", () => {
  it("hides action buttons when permission is missing", () => {
    render(
      <FixedActionList
        rows={[{ id: 1, name: "角色" }]}
        columns={columns}
        getRowId={(row) => row.id}
        permissions={["user:manage"]}
        createRequiredPermissions={["tenant:manage"]}
        editRequiredPermissions={["tenant:manage"]}
        onCreate={() => undefined}
        onEdit={() => undefined}
      />
    );

    expect(screen.queryByRole("button", { name: "新增" })).toBeNull();
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
  });

  it("allows tenant management to operate tenant-scoped buttons", () => {
    render(
      <FixedActionList
        rows={[{ id: 1, name: "角色" }]}
        columns={columns}
        getRowId={(row) => row.id}
        permissions={["tenant:manage"]}
        createRequiredPermissions={["tenant:manage"]}
        editRequiredPermissions={["tenant:manage"]}
        onCreate={() => undefined}
        onEdit={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: "新增" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "编辑" })).toBeTruthy();
  });
});
