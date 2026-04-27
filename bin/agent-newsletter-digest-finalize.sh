#!/bin/bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [ -L "${SOURCE}" ]; do
  SOURCE_DIR="$(cd -P "$(dirname "${SOURCE}")" && pwd)"
  TARGET="$(readlink "${SOURCE}")"
  case "${TARGET}" in
    /*) SOURCE="${TARGET}" ;;
    *) SOURCE="${SOURCE_DIR}/${TARGET}" ;;
  esac
done

SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec bash "${REPO_ROOT}/lib/send/finalize-newsletter-digest.sh" "$@"
