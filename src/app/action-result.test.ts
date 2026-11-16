import { afterEach, describe, expect, it, vi } from "vitest";

import { runAction } from "./action-result";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAction", () => {
  it("passes the value of successful work through", async () => {
    const result = await runAction(() => Promise.resolve({ companyId: "c-1" }));

    expect(result).toEqual({ ok: true, value: { companyId: "c-1" } });
  });

  it("turns a thrown error into an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runAction(() => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });

    expect(result).toEqual({ ok: false, error: "unexpected" });
  });

  it("logs the error instead of swallowing it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("connect ECONNREFUSED 127.0.0.1:5432");

    await runAction(() => Promise.reject(failure));

    expect(logged).toHaveBeenCalledWith("Server action failed", failure);
  });
});
