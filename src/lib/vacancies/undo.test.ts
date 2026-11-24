import { describe, expect, it } from "vitest";

import { keepRecentUndos } from "./undo";

describe("keepRecentUndos", () => {
  it("keeps up to three Undo notices open", () => {
    expect(keepRecentUndos(["a", "b"], "c")).toEqual({
      open: ["a", "b", "c"],
      toClose: [],
    });
  });

  it("closes the oldest one when the fourth appears", () => {
    expect(keepRecentUndos(["a", "b", "c"], "d")).toEqual({
      open: ["b", "c", "d"],
      toClose: ["a"],
    });
  });

  it("starts with an empty list", () => {
    expect(keepRecentUndos([], "a")).toEqual({ open: ["a"], toClose: [] });
  });
});
