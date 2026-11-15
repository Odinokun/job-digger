#!/bin/bash
# PostToolUse hook для Edit|Write: проганяє Prettier і `eslint --fix` на зміненому файлі.
# Працює лише на файлах усередині проєкту: поза ним ESLint не знаходить eslint.config.*,
# виходить з кодом 2 і крок виглядає як невдалий, хоча файл записано.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

FILE_PATH=$(jq -r '.tool_input.file_path // empty') || exit 0
[[ -n "$FILE_PATH" ]] || exit 0

# Корінь проєкту, як і в protect-files.sh: cwd хука - корінь сесії.
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}

# Файли поза проєктом пропускаються тихо: там немає ні .prettierrc, ні eslint.config.*.
[[ "$FILE_PATH" == "$ROOT"/* ]] || exit 0

STATUS=0

# Збій Prettier не блокує крок, але має бути видним.
if ! PRETTIER_OUTPUT=$(npx --no-install prettier --write --ignore-unknown "$FILE_PATH" 2>&1); then
  printf 'Prettier failed:\n%s\n' "$PRETTIER_OUTPUT" >&2
  STATUS=1
fi

# Невиправні помилки ESLint блокують крок: exit 2 показує stderr одразу.
if ! ESLINT_OUTPUT=$(npx --no-install eslint --fix --no-warn-ignored "$FILE_PATH" 2>&1); then
  printf '%s\n' "$ESLINT_OUTPUT" >&2
  exit 2
fi

exit "$STATUS"
