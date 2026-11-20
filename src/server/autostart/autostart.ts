/**
 * Автозапуск робочого екземпляра при вході в macOS (задача 6.10):
 *
 * - `npm run autostart:on` - записати LaunchAgent і запустити його зараз;
 * - `npm run autostart:off` - зупинити сервер і прибрати автозапуск;
 * - `npm run app:restart` - перезапустити сервер після `npm run app:update`.
 *
 * Запускається лише з клону на `main`, як і `app:update`: LaunchAgent
 * запамʼятовує теку, з якої його ввімкнули. Службовий скрипт, у застосунок не
 * імпортується.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AUTOSTART_LABEL, launchAgentPlist } from "./launch-agent.ts";

const command = process.argv[2];
const home = os.homedir();
const plistFile = path.join(
  home,
  "Library/LaunchAgents",
  `${AUTOSTART_LABEL}.plist`,
);
const logFile = path.join(home, "Library/Logs/job-digger/app.log");
const domain = `gui/${os.userInfo().uid}`;
const service = `${domain}/${AUTOSTART_LABEL}`;

switch (command) {
  case "on":
    await turnOn();
    break;
  case "off":
    await turnOff();
    break;
  case "restart":
    launchctl(["kickstart", "-k", service]);
    console.log("Restarted. Log:", logFile);
    break;
  default:
    throw new Error(`Unknown command "${command}": use on, off or restart`);
}

async function turnOn(): Promise<void> {
  const branch = run("git", ["branch", "--show-current"]);

  if (branch !== "main") {
    throw new Error("autostart:on runs only on main, in the work clone");
  }

  if (!existsSync(".next/BUILD_ID")) {
    throw new Error("No production build here: run npm run app:update first");
  }

  // `node` - той, що виконує цей скрипт (з nvm), `docker` - як його бачить
  // термінал. Після зміни версії Node автозапуск треба ввімкнути знову.
  const docker = run("/bin/sh", ["-c", "command -v docker"]);
  const searchPath = [
    ...new Set([
      path.dirname(process.execPath),
      path.dirname(docker),
      "/usr/bin",
      "/bin",
    ]),
  ].join(":");

  await mkdir(path.dirname(plistFile), { recursive: true });
  await mkdir(path.dirname(logFile), { recursive: true });
  await writeFile(
    plistFile,
    launchAgentPlist({
      workingDirectory: process.cwd(),
      path: searchPath,
      logFile,
    }),
  );

  // Повторне ввімкнення замінює стару задачу: спершу зняти, якщо вона є.
  launchctl(["bootout", service], { mayFail: true });
  launchctl(["bootstrap", domain, plistFile]);
  console.log("Autostart is on. Server: http://127.0.0.1:3100, log:", logFile);
}

async function turnOff(): Promise<void> {
  launchctl(["bootout", service], { mayFail: true });
  await rm(plistFile, { force: true });
  console.log("Autostart is off, server stopped.");
}

function launchctl(
  args: string[],
  { mayFail = false }: { mayFail?: boolean } = {},
): void {
  try {
    execFileSync("launchctl", args, { stdio: mayFail ? "ignore" : "inherit" });
  } catch (error) {
    if (!mayFail) throw error;
  }
}

function run(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: "utf8" }).trim();
}
