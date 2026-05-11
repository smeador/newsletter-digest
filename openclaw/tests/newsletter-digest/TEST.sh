#!/bin/bash
set -euo pipefail

MESSAGE="${SKILL_TEST_MESSAGE:-${DIGEST_MESSAGE:-Run newsletter-digest now in test mode.}}"
TIMEOUT_MS="${SKILL_TEST_TIMEOUT_MS:-${DIGEST_TEST_TIMEOUT_MS:-600000}}"
CONFIG_PATH="${NEWSLETTER_DIGEST_CONFIG:-/workspace/config/newsletter-digest.json}"
TIMEZONE="${NEWSLETTER_DIGEST_TIMEZONE:-}"

if [ -z "${TIMEZONE}" ] && [ -f "${CONFIG_PATH}" ] && command -v jq >/dev/null 2>&1; then
  TIMEZONE="$(jq -r '.timezone // empty' "${CONFIG_PATH}")"
fi

TIMEZONE="${TIMEZONE:-UTC}"
JOB_NAME="newsletter-digest-test-$(TZ="${TIMEZONE}" date '+%Y%m%dT%H%M%S')-$$"

job_json="$(
  openclaw cron add \
    --json \
    --name "${JOB_NAME}" \
    --description "Temporary isolated digest test run." \
    --agent main \
    --session isolated \
    --message "${MESSAGE}" \
    --at 10m \
    --no-deliver
)"

job_id="$(printf '%s\n' "${job_json}" | jq -r '.id // .job.id // empty')"

if [ -z "${job_id}" ]; then
  echo "Failed to create temporary digest test cron job." >&2
  printf '%s\n' "${job_json}" >&2
  exit 1
fi

cleanup() {
  openclaw cron rm "${job_id}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

printf 'Created temp cron job %s\n' "${job_id}" >&2
printf 'Running isolated digest test and waiting for final output...\n' >&2

openclaw cron run "${job_id}" --expect-final --timeout "${TIMEOUT_MS}"
