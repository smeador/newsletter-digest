#!/bin/bash
set -euo pipefail

SKILL_NAME="${1:-newsletter-digest}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_ROOT="${OPENCLAW_SKILLS_ROOT:-${SCRIPT_DIR}/skills}"
TEST_SCRIPT="${SKILLS_ROOT}/${SKILL_NAME}/TEST.sh"

if [ ! -f "${TEST_SCRIPT}" ]; then
  echo "Skill test entrypoint not found: ${TEST_SCRIPT}" >&2
  exit 1
fi

exec bash "${TEST_SCRIPT}"
