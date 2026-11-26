# src/server/autostart - starting the working instance

The working instance (the clone in `~/code/job-digger-app`, README, "Робочий екземпляр") starts by itself on macOS login - through a LaunchAgent of the built-in `launchd`, with no new dependencies (task [6.10](../../../tasks/6.10-autostart-on-login.md)). How to use it: [README](../../../README.md#автозапуск).

| File                   | Contents                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| `launch-agent.ts`      | `launchAgentPlist` - the job description for `launchd` (plist), `AUTOSTART_LABEL` |
| `launch-agent.test.ts` | What exactly goes into the plist                                              |
| `autostart.ts`         | The runner: `npm run autostart:on`, `autostart:off`, `app:restart`            |

## How it works

- The job is `local.job-digger.app` in `~/Library/LaunchAgents`. The `local.` prefix is there because the project has no domain like the usual `com.example.*`.
- The job's command waits until `pg_isready` in the `job-digger-db` container answers, then runs `exec npm run app` (a database copy once a day and `next start` on 3100). Docker Desktop does not start right away after login.
- `KeepAlive` → `SuccessfulExit: false`: `launchd` restarts the server only after an exit with an error (a crash, a failed copy), at most once every 60 s (`ThrottleInterval`). The key also starts the job at load.
- `launchd` does not read `~/.zshrc`, so the job's `PATH` is written at `autostart:on`: the folder of the `node` that ran the script (nvm) and the folder of `docker`. After changing the Node version, run `npm run autostart:on` again.
- The server log is `~/Library/Logs/job-digger/app.log` (stdout and stderr together).

Checked live on 20.11.2026 with a temporary job under another name and port: start through `bootstrap`, the server answering, `kickstart -k` (a new process, the old one gone), `bootout` (the port free, neither `npm` nor `next-server` left), and a copy to iCloud from the `launchd` process - it works only after permission in the macOS window that appears on the first attempt, and the process waits until it is answered. Waiting for the database with Docker off was not checked live.
