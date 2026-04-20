#!/bin/bash
set -euo pipefail

if command -v agent-email-digest-render >/dev/null 2>&1; then
  exec agent-email-digest-render "$@"
fi

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"

if [ -f "/opt/agent-email-digest/scripts/email/render-newsletter-digest.mjs" ]; then
  exec /opt/agent-email-digest/scripts/email/render-newsletter-digest.mjs "$@"
fi

if [ -f "${REPO_ROOT}/scripts/email/render-newsletter-digest.mjs" ]; then
  exec "${REPO_ROOT}/scripts/email/render-newsletter-digest.mjs" "$@"
fi

echo "render-newsletter-digest.mjs not found in installed helper or repo checkout" >&2
exit 1
