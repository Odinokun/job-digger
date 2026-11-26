#!/bin/bash
# PostToolUse hook for Edit|Write: runs Prettier and `eslint --fix` on the changed file.
# Only for files inside the project: outside it ESLint finds no eslint.config.*,
# exits with code 2, and the step looks failed although the file was written.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

FILE_PATH=$(jq -r '.tool_input.file_path // empty') || exit 0
[[ -n "$FILE_PATH" ]] || exit 0

# Project root, as in protect-files.sh: the hook's cwd is the session root.
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}

# Files outside the project are skipped quietly: there is no .prettierrc or eslint.config.* there.
[[ "$FILE_PATH" == "$ROOT"/* ]] || exit 0

STATUS=0

# A Prettier failure does not block the step, but it has to be visible.
if ! PRETTIER_OUTPUT=$(npx --no-install prettier --write --ignore-unknown "$FILE_PATH" 2>&1); then
  printf 'Prettier failed:\n%s\n' "$PRETTIER_OUTPUT" >&2
  STATUS=1
fi

# ESLint errors it cannot fix block the step: exit 2 shows stderr at once.
if ! ESLINT_OUTPUT=$(npx --no-install eslint --fix --no-warn-ignored "$FILE_PATH" 2>&1); then
  printf '%s\n' "$ESLINT_OUTPUT" >&2
  exit 2
fi

exit "$STATUS"
