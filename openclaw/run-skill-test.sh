#!/bin/bash
set -euo pipefail

SKILL_NAME="${1:-newsletter-digest}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TESTS_ROOT="${OPENCLAW_SKILL_TESTS_ROOT:-${SCRIPT_DIR}/tests}"
TEST_SCRIPT="${TESTS_ROOT}/${SKILL_NAME}/TEST.sh"

if [ ! -f "${TEST_SCRIPT}" ]; then
  echo "Skill test entrypoint not found: ${TEST_SCRIPT}" >&2
  exit 1
fi

exec bash "${TEST_SCRIPT}"
