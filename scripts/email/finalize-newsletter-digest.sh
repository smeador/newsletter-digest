#!/bin/bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  finalize-newsletter-digest.sh \
    --digest-json DIGEST_JSON \
    --day-dir DAY_DIR \
    --account ACCOUNT_EMAIL \
    --to TO_EMAIL \
    --subject SUBJECT \
    [--from FROM_EMAIL] \
    [--message-ids-json MESSAGE_IDS_JSON] \
    [--source-artifacts-json SOURCE_ARTIFACTS_JSON]
EOF
  exit 1
}

DIGEST_JSON=""
DAY_DIR=""
ACCOUNT_EMAIL=""
TO_EMAIL=""
SUBJECT=""
FROM_EMAIL=""
MESSAGE_IDS_JSON=""
SOURCE_ARTIFACTS_JSON=""

while [ $# -gt 0 ]; do
  case "$1" in
    --digest-json)
      DIGEST_JSON="${2:-}"
      shift 2
      ;;
    --day-dir)
      DAY_DIR="${2:-}"
      shift 2
      ;;
    --account)
      ACCOUNT_EMAIL="${2:-}"
      shift 2
      ;;
    --to)
      TO_EMAIL="${2:-}"
      shift 2
      ;;
    --subject)
      SUBJECT="${2:-}"
      shift 2
      ;;
    --from)
      FROM_EMAIL="${2:-}"
      shift 2
      ;;
    --message-ids-json)
      MESSAGE_IDS_JSON="${2:-}"
      shift 2
      ;;
    --source-artifacts-json)
      SOURCE_ARTIFACTS_JSON="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

if [ -z "${DIGEST_JSON}" ] || [ -z "${DAY_DIR}" ] || [ -z "${ACCOUNT_EMAIL}" ] || [ -z "${TO_EMAIL}" ] || [ -z "${SUBJECT}" ]; then
  usage
fi

if [ ! -f "${DIGEST_JSON}" ]; then
  echo "Digest JSON file not found: ${DIGEST_JSON}" >&2
  exit 1
fi

if [ -n "${MESSAGE_IDS_JSON}" ] && [ ! -f "${MESSAGE_IDS_JSON}" ]; then
  echo "Message ids file not found: ${MESSAGE_IDS_JSON}" >&2
  exit 1
fi

if [ -n "${SOURCE_ARTIFACTS_JSON}" ] && [ ! -f "${SOURCE_ARTIFACTS_JSON}" ]; then
  echo "Source artifacts file not found: ${SOURCE_ARTIFACTS_JSON}" >&2
  exit 1
fi

if [ -d "${OPENCLAW_WORKSPACE:-}" ]; then
  WORKSPACE_DIR="${OPENCLAW_WORKSPACE}"
elif [ -d "/workspace" ]; then
  WORKSPACE_DIR="/workspace"
else
  WORKSPACE_DIR="$(cd "$(dirname "$0")/../../workspace" && pwd)"
fi

mkdir -p "${DAY_DIR}"

DAY_DIGEST_JSON="${DAY_DIR}/digest.json"
DAY_HTML="${DAY_DIR}/email.html"
DAY_TEXT="${DAY_DIR}/email.txt"
DAY_MESSAGE_IDS_JSON="${DAY_DIR}/selected-message-ids.json"
DAY_SOURCE_ARTIFACTS_JSON="${DAY_DIR}/source-artifact-dirs.json"

cp "${DIGEST_JSON}" "${DAY_DIGEST_JSON}"

if [ -n "${MESSAGE_IDS_JSON}" ]; then
  cp "${MESSAGE_IDS_JSON}" "${DAY_MESSAGE_IDS_JSON}"
fi

if [ -n "${SOURCE_ARTIFACTS_JSON}" ]; then
  cp "${SOURCE_ARTIFACTS_JSON}" "${DAY_SOURCE_ARTIFACTS_JSON}"
fi

bash "${WORKSPACE_DIR}/scripts/render-newsletter-digest.sh" \
  --input "${DAY_DIGEST_JSON}" \
  --html-out "${DAY_HTML}" \
  --text-out "${DAY_TEXT}"

SEND_ARGS=(
  --account "${ACCOUNT_EMAIL}"
  --to "${TO_EMAIL}"
  --subject "${SUBJECT}"
  --digest-json "${DAY_DIGEST_JSON}"
  --text-file "${DAY_TEXT}"
  --html-file "${DAY_HTML}"
  --day-dir "${DAY_DIR}"
)

if [ -n "${FROM_EMAIL}" ]; then
  SEND_ARGS+=(--from "${FROM_EMAIL}")
fi

if [ -n "${MESSAGE_IDS_JSON}" ]; then
  SEND_ARGS+=(--message-ids-json "${DAY_MESSAGE_IDS_JSON}")
fi

if [ -n "${SOURCE_ARTIFACTS_JSON}" ]; then
  SEND_ARGS+=(--source-artifacts-json "${DAY_SOURCE_ARTIFACTS_JSON}")
fi

bash "${WORKSPACE_DIR}/scripts/send-gog-digest.sh" "${SEND_ARGS[@]}"
