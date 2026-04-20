#!/bin/bash
set -euo pipefail

MESSAGE="${DIGEST_MESSAGE:-Run pip-newsletter-digest now in test mode.}"
TIMEOUT_MS="${DIGEST_TEST_TIMEOUT_MS:-600000}"
JOB_NAME="pip-newsletter-digest-test-$(TZ=America/Chicago date '+%Y%m%dT%H%M%S')-$$"

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
