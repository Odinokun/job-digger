import { describe, expect, it } from "vitest";

import { SYSTEM_USER_EMAIL } from "./schema.ts";

describe("SYSTEM_USER_EMAIL", () => {
  it("uses a reserved local domain so no real mailbox can be hit", () => {
    // .local is reserved for local networks: mail to this address goes nowhere,
    // even if something tries to send it.
    expect(SYSTEM_USER_EMAIL).toMatch(/@[^@]+\.local$/);
  });
});
