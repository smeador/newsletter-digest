#!/bin/bash
set -euo pipefail

if command -v agent-newsletter-digest-extract >/dev/null 2>&1; then
  exec agent-newsletter-digest-extract "$@"
fi

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"

if [ -f "/opt/agent-newsletter-digest/scripts/email/extract-newsletter-from-gmail.mjs" ]; then
  exec /opt/agent-newsletter-digest/scripts/email/extract-newsletter-from-gmail.mjs "$@"
fi

if [ -f "${REPO_ROOT}/scripts/email/extract-newsletter-from-gmail.mjs" ]; then
  exec "${REPO_ROOT}/scripts/email/extract-newsletter-from-gmail.mjs" "$@"
fi

echo "extract-newsletter-from-gmail.mjs not found in installed helper or repo checkout" >&2
exit 1
