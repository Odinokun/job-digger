# .claude - Claude Code setup for the project

Permissions, hooks and skills. The short rules are in [`CLAUDE.md`](../CLAUDE.md#claude-code); this file has the details and the reasons. Hooks and skills are in git, so changing them goes through review like changing a dependency. Permissions live in the author's personal settings and are described below.

## Permissions

**Permissions live globally, in the author's `~/.claude/settings.json`, not in the project.** This project has no special needs, and one set of rules for every repository lets Claude work without the author at the keyboard. The file is outside git, so the list below is a description, not a copy: the file itself is the source of truth. `/permissions` shows and edits it interactively. The session runs in auto mode (`defaultMode: "auto"`): an action that matches no rule is judged by a background classifier.

The goal is as few prompts as possible while secrets, databases and personal files stay closed:

- **`allow`** - no prompt: branches (`git switch`, `checkout -b`, `fetch`, `pull`, `add`, `commit`, `branch -D`, `stash`), push **only** to prefixed branches (`git push -u origin feat/*`, likewise `fix/`, `docs/`, `chore/`, `test/`, `refactor/`, `ci/`), own PRs (`gh pr create/edit/view/list/checks/diff`, `gh run view/list`), checks (`npm test`, `npm run test*`, `lint`, `format*`, `build`, `db:check`, `db:generate`, `npm ci`, `npx vitest/tsc/prettier/eslint/playwright`), `docker compose ps/logs`, `curl -s` to localhost.
- **`ask`** - with a prompt: new dependencies (`npm install`, `npm i`, `npm uninstall`, `npm install-scripts`), development database data (`npm run db:seed*`, `npm run db:psql`, `docker compose exec`), `docker compose down`, `launchctl`.
- **`deny`** - forbidden:
  - secrets: reading `.env` and `.env.*` (except `.env.example`), `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`, `cp .env*`, `grep ... .env*`;
  - history and `main`: a bare `git push` and `git push -q` (only with an explicit branch), push to `main`/`master`, `--force`/`-f`, `reset --hard`, `git clean`, `commit --amend`, `gh pr merge` (the author merges), `gh repo delete`, `gh release delete`;
  - databases: `npm run db:migrate` (the author applies migrations), `drizzle-kit migrate/push`, `npm run app*` (the working instance), `dropdb`, `DROP DATABASE`/`DROP TABLE`, `docker compose down -v`/`--volumes`, `docker volume rm/prune`, `docker system prune`;
  - file system: `rm -rf`, `rm -fr`, `sudo`.
- **`blockReadsOutsideWorkingDirectories: true`** - Read, Grep and Glob refuse paths outside the session folders, and Claude Code always prompts for a shell command with such a path. This keeps personal files closed, and it is why Claude keeps temporary files inside the repository rather than in the system `/tmp`.

Why push and PRs are in `allow` rather than `ask`. They used to be in the project's `ask`: the classifier let the same commands through one time and refused them the next, and `ask` at least gave a predictable prompt. But a prompt on every push kept the author at the keyboard. Push is now predictable another way: a prefixed branch always goes through, a bare push and a push to `main` are always refused, and a mistake in a PR is caught by the author's review, since the merge stays with the author.

Syntax details are in the [Claude Code documentation](https://code.claude.com/docs/en/permissions). Worth knowing before editing:

- The order of checks is `deny`, then `ask`, then `allow`; the first match wins. So "prompt for every push except feat/* branches" cannot be written: the broader `ask` would beat the narrower `allow`. Hence a narrow `allow` plus targeted `deny` rules.
- Lists from different files (personal, project, local) are added together, not replaced. An `ask` in the project would beat the global `allow`, which is why the project's `settings.json` has no `permissions` block.
- A `Read(...)` rule in `deny` applies not only to the Read tool but also to Bash commands that Claude Code recognises as reading a file: `cat`, `head`, `tail`, `sed`, `tee`. `grep` is not among them, hence the separate `Bash(grep * .env*)`.
- **`.env.example` and negation.** `Read(**/.env.*)` also blocks `.env.example`, even though it is in git and is the only list of environment variables. The exception is a negation, `Read(!.env.example)` (and `Read(!**/.env.example)`), and it has to come **after** the broader rule and **in the same file**: an `allow` does not make an exception to a `deny`.
- In a compound command every part must be allowed separately, so an `allow` for tests does not open `npm test && rm -rf /`. A `cd` into the session folder is read-only, and also unnecessary: the shell already starts at the repository root.
- Argument rules are fragile and are not a security boundary: `git -C . push` gets around `Bash(git push ...)` ([documentation](https://code.claude.com/docs/en/permissions)). They protect against mistakes, not against an attacker.
- **What still triggers a prompt despite these rules** (checked 24.11.2026): a path outside the repository (temporary files therefore go only to `_temp/`, which is in `.gitignore`), editing files through `python3`/`sed -i` in a heredoc instead of Edit/Write (the classifier cannot verify arbitrary code, and the Prettier hook does not see such edits), and `$(...)` substitution, which is why the PR text is written to `_temp/pr-body.md` and passed with `gh pr create --body-file`.
- Rules are re-read during a session, without a restart ([documentation](https://code.claude.com/docs/en/settings)).
- Classifier settings (`autoMode`) are read only from `~/.claude/settings.json`. Its rules: `claude auto-mode defaults`; the effective config: `claude auto-mode config`.
- Choosing "don't ask again" at a prompt writes a rule into the personal `.claude/settings.local.json`. That file is outside git, and therefore outside Prettier too (`.prettierignore`). To undo such a rule, delete it from that file.

## Hooks

Configuration in `.claude/settings.json`, scripts in `.claude/hooks/`. All of it is in git: a hook change goes through review like a dependency change, because hooks run automatically with the author's rights.

| Event         | What it does                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `PreToolUse`  | `protect-files.sh` blocks Write/Edit in `.env*` (except `.env.example`), `package-lock.json` and migrations in `drizzle/` |
| `PostToolUse` | `format-file.sh` runs Prettier and `eslint --fix` on the changed project file                             |

- A new script in `.claude/hooks/` must have the executable bit (`chmod +x`): without it the hook fails silently, and the protection only looks configured.
- `protect-files.sh` blocks only Write/Edit, not `Bash`. It does not protect the lock file and secrets from commands in the terminal.
- Hook messages go to stderr: whatever a hook writes to stdout never reaches Claude.
- `format-file.sh` skips files outside the project root: there is no `eslint.config.*` there, ESLint exits with code 2, and the step looks failed although the file was written. The check lives in the script rather than in the hook's `if` field, because `if` holds exactly one permission rule, and one rule cannot cover both `Write` and `Edit`.
- The desktop notification when Claude waits for input is a personal hook in the author's `~/.claude/settings.json`, not part of the project: it works the same in every repository.

## Skills

| Skill                         | Author      | What for                                                     | Stage |
| ----------------------------- | ----------- | ------------------------------------------------------------ | ----- |
| `vercel-react-best-practices` | Vercel      | React/Next.js performance rules                              | 1     |
| `tdd`                         | Matt Pocock | What a good test is, seams, anti-patterns, cycle rules       | 1     |
| `heroui-react`                | HeroUI      | HeroUI v3 components, props and themes                       | 1     |
| `frontend-design`             | Anthropic   | Palette, typography, calibration against template designs    | 2     |
| `grill-me`                    | Matt Pocock | Entry point: stress-testing a plan or an `analyze` idea      | 1     |
| `grilling`                    | Matt Pocock | The interview itself, called by `grill-me`                   | 1     |
| `neon-postgres`               | Neon        | Connecting to Neon, connection pooling, database branches    | 7     |

- Skills are installed **into the project only**, with `npx skills add`, never with `curl | bash`. They end up in git, and updates go only through a PR. The CLI puts the files in `.agents/skills/`, makes symlinks to them in `.claude/skills/`, and records each skill's source and hash in `skills-lock.json` at the root; all three go into git. By default the CLI sends anonymous telemetry for the skills.sh ranking; `DISABLE_TELEMETRY=1` turns it off, and `DO_NOT_TRACK=1` also turns off the audit requests.
- Skills are third-party code with their own licences, and the project's MIT does not cover them: `frontend-design` and `heroui-react` are Apache 2.0, `tdd`, `grill-me`, `grilling` and `vercel-react-best-practices` are MIT. The licence text is in each skill's folder, except for `vercel-react-best-practices`: its repository has no separate licence file, and MIT is stated in `SKILL.md`. The `LICENSE` files of Matt Pocock's skills are copied from [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/LICENSE): the CLI does not install them, and MIT requires the licence text in copies, so check that they are still there after `npx skills update`.
- `tdd` requires agreeing on seams (the public boundaries we test at) before writing tests, and moves refactoring out of the red → green cycle and into review. `grill-me` is a 157-byte stub that calls `grilling`: the first does not work without the second. The only executables among the installed files are 6 `heroui-react` scripts that read documentation from `mcp-api.heroui.com`, `heroui.com` and `raw.githubusercontent.com`; they write nothing and run only when called explicitly.
- `frontend-design` is two files (`SKILL.md` and `LICENSE.txt`), no executables. It is needed because Claude Code applies its built-in design guidance only when publishing an Artifact, not to edits of `globals.css` or of the app's components. Its core is a calibration list of signs of generated design (ALL-CAPS labels, metadata joined with "·", monospace for captions, identical rounded cards) and the requirement to check the plan against the brief before writing code.
- Before installing, Claude reads the skill's `SKILL.md` and scripts and briefly explains what they do. On updates, the security audits on skills.sh (Gen Agent Trust Hub, Socket, Snyk) are checked again.
- **The author installs them:** skills are installed by the `npx skills add` CLI, so the author runs it. There is no ban on writing to `.claude/`: Claude writes there when needed (for example, in `.claude/hooks/`).
- Not taken: `theme-factory` from the same Anthropic repository (10 ready-made hex themes for slides and landing pages, with nothing about dark mode, `oklch` or component library tokens, so for HeroUI it would have to be translated by hand), skills for Drizzle and Playwright (only unofficial ones exist), a separate Next.js skill (the docs ship in `node_modules/next/dist/docs` and match the installed version), Feature-Sliced Design, Git Commit, Ponytail, agent-browser, find-skills.
