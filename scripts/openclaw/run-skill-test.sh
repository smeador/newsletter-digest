#!/bin/bash
set -euo pipefail

SKILL_NAME="${1:-pip-newsletter-digest}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE:-/workspace}"
TEST_SCRIPT="${WORKSPACE_DIR}/skills/${SKILL_NAME}/TEST.sh"

if [ ! -f "${TEST_SCRIPT}" ]; then
  echo "Skill test entrypoint not found: ${TEST_SCRIPT}" >&2
  exit 1
fi

exec bash "${TEST_SCRIPT}"

