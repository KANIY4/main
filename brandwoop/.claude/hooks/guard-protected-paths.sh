#!/usr/bin/env bash
# PreToolUse guard (scope section 11.2).
#
# Blocks agent edits to applied migrations, signing material and security
# policy files. A human uses the documented workflow for these: a new forward
# migration, or an explicitly reviewed change with a second approver.
#
# Exit 2 = block the tool call and return the message to the agent.
set -euo pipefail

payload="$(cat)"

file_path="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    print("")
    sys.exit(0)
tool_input = data.get("tool_input") or {}
print(tool_input.get("file_path") or tool_input.get("path") or "")
')"

if [[ -z "$file_path" ]]; then
  exit 0
fi

block() {
  echo "BLOCKED: $1" >&2
  echo "Path: $file_path" >&2
  exit 2
}

case "$file_path" in
  *.keystore|*.jks|*.p8|*.p12|*.mobileprovision)
    block "Signing material is never edited by an agent. BrandWoop holds custody (scope section 14)."
    ;;
  */google-services.json|*/GoogleService-Info.plist)
    block "Mobile service credentials are managed outside the repository."
    ;;
  */.env|*/.env.*)
    block "Environment files hold secrets. Update the environment schema and the provider console instead."
    ;;
esac

# Applied migrations are immutable. New numbered files are allowed.
if [[ "$file_path" == *"/packages/database/migrations/"*.sql ]]; then
  if [[ -f "$file_path" ]]; then
    block "Applied migrations are forward-only (see CLAUDE.md). Add a new numbered migration instead of editing this one."
  fi
fi

# Row-level security policy files change only through reviewed security work.
if [[ "$file_path" == *"/packages/database/policies/"* ]]; then
  if [[ "${BRANDWOOP_ALLOW_POLICY_EDIT:-0}" != "1" ]]; then
    block "RLS policy files require the reviewed security workflow. Set BRANDWOOP_ALLOW_POLICY_EDIT=1 only inside that workflow."
  fi
fi

exit 0
