import { describe, expect, it } from "vitest";

import { greenhouseBoardToken } from "./greenhouse.ts";

describe("greenhouseBoardToken", () => {
  it("takes the board name from a board address on either Greenhouse host", () => {
    expect(
      greenhouseBoardToken("https://job-boards.greenhouse.io/discord"),
    ).toBe("discord");
    expect(greenhouseBoardToken("https://boards.greenhouse.io/discord")).toBe(
      "discord",
    );
  });

  it("takes the board name from a link to one vacancy", () => {
    expect(
      greenhouseBoardToken(
        "https://job-boards.greenhouse.io/discord/jobs/8927168002",
      ),
    ).toBe("discord");
  });

  it("takes the board name from an embedded board", () => {
    expect(
      greenhouseBoardToken(
        "https://boards.greenhouse.io/embed/job_board?for=discord",
      ),
    ).toBe("discord");
  });

  it("finds no board where there is none", () => {
    expect(
      greenhouseBoardToken("https://job-boards.greenhouse.io/"),
    ).toBeNull();
    expect(
      greenhouseBoardToken("https://boards.greenhouse.io/embed/job_board"),
    ).toBeNull();
    expect(greenhouseBoardToken("https://bosch.com/careers")).toBeNull();
  });
});
