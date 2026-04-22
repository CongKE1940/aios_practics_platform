// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UserApp } from "./app";

afterEach(() => {
  cleanup();
});

describe("UserApp", () => {
  it("renders the learner shell", () => {
    render(<UserApp />);

    expect(screen.getByRole("heading", { name: "AIOS 学生端" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "我的课程" })).toBeTruthy();
  });
});
