#!/bin/bash
set -euo pipefail

MESSAGE="${SKILL_TEST_MESSAGE:-${DIGEST_MESSAGE:-Run newsletter-digest now in test mode.}}"
TIMEOUT_MS="${SKILL_TEST_TIMEOUT_MS:-${DIGEST_TEST_TIMEOUT_MS:-600000}}"
CONFIG_PATH="${NEWSLETTER_DIGEST_CONFIG:-/workspace/config/newsletter-digest.json}"
MEMORY_ROOT="${NEWSLETTER_DIGEST_MEMORY_ROOT:-/workspace/memory}"
TIMEZONE="${NEWSLETTER_DIGEST_TIMEZONE:-}"

if ! [[ "${TIMEOUT_MS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "SKILL_TEST_TIMEOUT_MS must be a positive integer." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for newsletter digest E2E verification." >&2
  exit 1
fi

if [ -z "${TIMEZONE}" ] && [ -f "${CONFIG_PATH}" ] && command -v jq >/dev/null 2>&1; then
  TIMEZONE="$(jq -r '.timezone // empty' "${CONFIG_PATH}")"
fi

TIMEZONE="${TIMEZONE:-UTC}"
JOB_NAME="newsletter-digest-test-$(TZ="${TIMEZONE}" date '+%Y%m%dT%H%M%S')-$$"
mkdir -p "${MEMORY_ROOT}/.tmp"
ARTIFACT_MARKER="$(mktemp "${MEMORY_ROOT}/.tmp/newsletter-digest-e2e.XXXXXX")"
JOB_ID=""

cleanup() {
  if [ -n "${JOB_ID}" ]; then
    openclaw cron rm "${JOB_ID}" >/dev/null 2>&1 || true
  fi
  rm -f "${ARTIFACT_MARKER}"
}

trap cleanup EXIT

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

JOB_ID="$(printf '%s\n' "${job_json}" | jq -r '.id // .job.id // empty')"

if [ -z "${JOB_ID}" ]; then
  echo "Failed to create temporary digest test cron job." >&2
  printf '%s\n' "${job_json}" >&2
  exit 1
fi

printf 'Created temp cron job %s\n' "${JOB_ID}" >&2
printf 'Running isolated digest test and waiting for final output...\n' >&2

openclaw cron run "${JOB_ID}" \
  --wait \
  --wait-timeout "${TIMEOUT_MS}ms" \
  --expect-final \
  --timeout "${TIMEOUT_MS}"

latest_usage_summary=""
latest_usage_mtime=0
while IFS= read -r summary_path; do
  if ! jq -e '.status == "ok" and .mode == "test-send"' "${summary_path}" >/dev/null 2>&1; then
    continue
  fi
  summary_mtime="$(stat -c '%Y' "${summary_path}" 2>/dev/null || stat -f '%m' "${summary_path}")"
  if [ "${summary_mtime}" -ge "${latest_usage_mtime}" ]; then
    latest_usage_mtime="${summary_mtime}"
    latest_usage_summary="${summary_path}"
  fi
done < <(find "${MEMORY_ROOT}/digests" -type f -name usage-summary.json -newer "${ARTIFACT_MARKER}" -print 2>/dev/null)

if [ -z "${latest_usage_summary}" ]; then
  echo "Digest E2E failed: cron run finished without a new successful test-send usage summary." >&2
  exit 1
fi

digest_run_dir="$(dirname "${latest_usage_summary}")"
contract_summary="${digest_run_dir}/format-digest-contract-summary.json"
if [ ! -f "${contract_summary}" ] || ! jq -e '.status == "valid"' "${contract_summary}" >/dev/null 2>&1; then
  echo "Digest E2E failed: strict formatter contract did not produce a valid summary." >&2
  exit 1
fi

send_result="$(jq -er '.sendResultJson | select(type == "string" and length > 0)' "${latest_usage_summary}")"
if [ ! -f "${send_result}" ]; then
  echo "Digest E2E failed: send result artifact was not found: ${send_result}" >&2
  exit 1
fi

message_id="$(jq -er '(.message_id // .messageId) | select(type == "string" and length > 0)' "${send_result}")"

jq -n \
  --arg jobId "${JOB_ID}" \
  --arg usageSummary "${latest_usage_summary}" \
  --arg contractSummary "${contract_summary}" \
  --arg sendResult "${send_result}" \
  --arg messageId "${message_id}" \
  '{
    status: "ok",
    jobId: $jobId,
    usageSummary: $usageSummary,
    contractSummary: $contractSummary,
    sendResult: $sendResult,
    messageId: $messageId
  }'
