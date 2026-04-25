# Migration Findings

## Initial extraction pass

- The deterministic newsletter code is self-contained enough to move first without changing behavior.
- The runtime repo should consume this repo through `integration.json` rather than hardcoded skill-dir assumptions.
- `gog` remains a runtime-provided capability. This repo assumes it exists and is already authenticated for the configured workflow account.
- The OpenClaw skill remains the entry point, but it depends on runtime guarantees such as writable `/workspace/memory` and helper availability.

## Transitional shape

During this phase:

- this repo is the extracted source of truth for newsletter logic
- the adapter surface lives under `adapter/openclaw`
- the workflow implementation now lives under `lib/*`
- `bin/*` provides the installable command surface, while `scripts/*` remains only as a thin compatibility layer
- behavior changes should stay minimal until the integration mode is settled
