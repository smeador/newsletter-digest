#!/bin/bash
set -euo pipefail

if command -v agent-email-digest-send >/dev/null 2>&1; then
  exec agent-email-digest-send "$@"
fi

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"

if [ -f "/opt/agent-email-digest/scripts/gmail/send-gog-digest.sh" ]; then
  exec /opt/agent-email-digest/scripts/gmail/send-gog-digest.sh "$@"
fi

if [ -f "${REPO_ROOT}/scripts/gmail/send-gog-digest.sh" ]; then
  exec "${REPO_ROOT}/scripts/gmail/send-gog-digest.sh" "$@"
fi

echo "send-gog-digest.sh not found in installed helper or repo checkout" >&2
exit 1
