import { describe, expect, it } from "vitest";

import { AUTOSTART_LABEL, launchAgentPlist } from "./launch-agent.ts";

const INPUT = {
  workingDirectory: "/Users/me/code/job-digger-app",
  path: "/Users/me/.nvm/versions/node/v26.13.1/bin:/usr/local/bin:/usr/bin:/bin",
  logFile: "/Users/me/Library/Logs/job-digger/app.log",
};

describe("launchAgentPlist", () => {
  it("is a launchd property list with the job label", () => {
    const plist = launchAgentPlist(INPUT);

    expect(plist).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n/);
    expect(plist).toContain("<!DOCTYPE plist");
    expect(plist).toContain(
      `<key>Label</key>\n    <string>${AUTOSTART_LABEL}</string>`,
    );
  });

  it("starts the app from the clone once the database answers", () => {
    const plist = launchAgentPlist(INPUT);

    expect(plist).toContain(
      "<key>WorkingDirectory</key>\n    <string>/Users/me/code/job-digger-app</string>",
    );
    expect(plist).toContain("<string>/bin/sh</string>");
    expect(plist).toContain(
      "until docker exec job-digger-db pg_isready -q; do sleep 5; done; exec npm run app",
    );
  });

  it("gives the job the PATH where node, npm and docker live", () => {
    expect(launchAgentPlist(INPUT)).toContain(
      `<key>PATH</key>\n      <string>${INPUT.path}</string>`,
    );
  });

  it("restarts only after a failure, not after a normal stop", () => {
    expect(launchAgentPlist(INPUT)).toContain(
      "<key>KeepAlive</key>\n    <dict>\n      <key>SuccessfulExit</key>\n      <false/>\n    </dict>",
    );
  });

  it("writes both output streams to the log file", () => {
    const plist = launchAgentPlist(INPUT);

    expect(plist).toContain(
      `<key>StandardOutPath</key>\n    <string>${INPUT.logFile}</string>`,
    );
    expect(plist).toContain(
      `<key>StandardErrorPath</key>\n    <string>${INPUT.logFile}</string>`,
    );
  });

  it("escapes XML special characters in paths", () => {
    const plist = launchAgentPlist({
      ...INPUT,
      workingDirectory: "/Users/me/R&D <apps>",
    });

    expect(plist).toContain("<string>/Users/me/R&amp;D &lt;apps&gt;</string>");
  });
});
