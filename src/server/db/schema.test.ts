import { describe, expect, it } from "vitest";

import { SYSTEM_USER_EMAIL } from "./schema.ts";

describe("SYSTEM_USER_EMAIL", () => {
  it("uses a reserved local domain so no real mailbox can be hit", () => {
    // .local зарезервований для локальних мереж: лист за цією адресою
    // нікуди не піде, навіть якщо щось спробує його надіслати.
    expect(SYSTEM_USER_EMAIL).toMatch(/@[^@]+\.local$/);
  });
});
