#!/bin/bash
# PreToolUse hook для Edit|Write: блокує запис у файли, які Claude не має змінювати.
# Відмова безпечна: якщо шлях не вдалося прочитати, запис блокується, а не дозволяється.
set -uo pipefail

deny() {
  printf 'Blocked: %s\n' "$1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || deny "jq is not installed, cannot inspect the tool input"

FILE_PATH=$(jq -r '.tool_input.file_path // empty') || deny "failed to parse the hook input"
[[ -n "$FILE_PATH" ]] || deny "the hook input carries no file_path"

# Шлях відносно кореня проєкту (cwd хука), щоб правила для тек працювали передбачувано.
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
REL=${FILE_PATH#"$ROOT"/}
NAME=${REL##*/}

# Секрети: будь-який .env, крім шаблону .env.example, що лежить у git.
if [[ "$NAME" == ".env" || "$NAME" == .env.* ]] && [[ "$NAME" != ".env.example" ]]; then
  deny "$REL is a secrets file (only .env.example may be edited)"
fi

# Лок-файл: змінюється лише через npm, не руками.
if [[ "$NAME" == "package-lock.json" ]]; then
  deny "$REL is managed by npm, run an npm command instead"
fi

# Міграції Drizzle: генеруються drizzle-kit, не редагуються вручну.
if [[ "$REL" == drizzle/* || "$REL" == */drizzle/* ]]; then
  deny "$REL is a generated Drizzle migration, use drizzle-kit instead"
fi

exit 0
