# Migration Findings

## Initial extraction pass

- The deterministic newsletter code is self-contained enough to move first without changing behavior.
- The runtime repo still needs compatibility copies for cloud and Docker because it currently deploys a single reviewed workspace tree.
- `gog` remains a runtime-provided capability. This repo assumes it exists and is already authenticated for the configured workflow account.
- The OpenClaw skill remains the entry point, but it depends on runtime guarantees such as writable `/workspace/memory` and helper availability.

## Transitional shape

During this phase:

- this repo is the extracted source of truth for newsletter logic
- the runtime repo may still carry compatibility copies until it switches to consuming this repo directly
- behavior changes should stay minimal until the integration mode is settled
