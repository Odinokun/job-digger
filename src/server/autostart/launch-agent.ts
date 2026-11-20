/**
 * Опис автозапуску робочого екземпляра для macOS `launchd` - LaunchAgent, який
 * стартує при вході в систему (задача 6.10). Ключі звірено з `man
 * launchd.plist` на macOS.
 */

/** Імʼя задачі в `launchd` і файлу в `~/Library/LaunchAgents`. */
export const AUTOSTART_LABEL = "local.job-digger.app";

/**
 * Пауза між перезапусками після збою, с. Типово `launchd` чекає 10 с: якщо
 * сервер падає одразу на старті (скажімо, не вдалася резервна копія), кожна
 * спроба - це ще й `pg_dump`, тож частіше ніж раз на хвилину не треба.
 */
export const RESTART_THROTTLE_SECONDS = 60;

export interface LaunchAgentInput {
  /** Тека клону - звідти `npm run app` бере `.env` і збірку. */
  workingDirectory: string;
  /**
   * `PATH` для задачі: `launchd` не читає `~/.zshrc`, тож без нього не знайде
   * ні `node` з nvm, ні `docker`.
   */
  path: string;
  /** Куди писати stdout і stderr сервера. */
  logFile: string;
}

/**
 * Скрипт задачі: дочекатися бази й запустити `npm run app`. Docker Desktop
 * після входу в систему стартує не одразу, тож без очікування перший запуск
 * упирався б у відсутню базу.
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
