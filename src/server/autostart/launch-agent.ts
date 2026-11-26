/**
 * The autostart description of the working instance for macOS `launchd` - a
 * LaunchAgent that starts on login (task 6.10). The keys were checked against
 * `man launchd.plist` on macOS.
 */

/** The job name in `launchd` and the file name in `~/Library/LaunchAgents`. */
export const AUTOSTART_LABEL = "local.job-digger.app";

/**
 * The pause between restarts after a failure, in seconds. By default `launchd`
 * waits 10 s: if the server fails right at startup (say, the backup failed),
 * every attempt is also a `pg_dump`, so more often than once a minute is not needed.
 */
export const RESTART_THROTTLE_SECONDS = 60;

export interface LaunchAgentInput {
  /** The clone folder - `npm run app` takes `.env` and the build from there. */
  workingDirectory: string;
  /**
   * The job's `PATH`: `launchd` does not read `~/.zshrc`, so without it it finds
   * neither `node` from nvm nor `docker`.
   */
  path: string;
  /** Where to write the server's stdout and stderr. */
  logFile: string;
}

/**
 * The job's script: wait for the database and run `npm run app`. Docker Desktop
 * does not start right away after login, so without waiting the first start
 * would run into a missing database.
 */
const LAUNCH_SCRIPT =
  "until docker exec job-digger-db pg_isready -q; do sleep 5; done; exec npm run app";

export function launchAgentPlist({
  workingDirectory,
  path,
  logFile,
}: LaunchAgentInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${xml(AUTOSTART_LABEL)}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/sh</string>
      <string>-c</string>
      <string>${xml(LAUNCH_SCRIPT)}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(workingDirectory)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${xml(path)}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>${RESTART_THROTTLE_SECONDS}</integer>
    <key>StandardOutPath</key>
    <string>${xml(logFile)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(logFile)}</string>
  </dict>
</plist>
`;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
