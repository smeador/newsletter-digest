# Newsletter Digest

This repo contains the newsletter extraction, digest synthesis, rendering, and send workflow that was extracted from the OpenClaw runtime lab.

## Scope

This repo owns:

- newsletter extraction artifacts and contracts
- digest JSON contract
- deterministic HTML/plaintext rendering
- digest finalization and send flow
- the OpenClaw adapter layer for the current Pip workflow example

This repo does not own runtime provisioning such as:

- OpenClaw installation
- Docker and cloud deployment
- `gog` installation
- secret rendering
- Gmail auth bootstrapping

Those remain the responsibility of the runtime repo.

The intended composition model is lightweight:

- the runtime stages this repo from a local checkout during deploy/build
- `integration.json` declares the OpenClaw-facing surface
- the runtime installs the package bins and stages the adapter skills
- this repo does not assume it will be cloned separately on the cloud VM

## Layout

- `integration.json`: lightweight manifest consumed by the runtime repo
- `adapter/openclaw`: OpenClaw-specific skills and test runner
- `lib/extract`: newsletter extraction implementation
- `lib/render`: deterministic digest rendering implementation
- `lib/send`: digest JSON validation/repair, finalize, and Gmail transport implementation
- `bin`: package-owned executable entrypoints
- `scripts/email` and `scripts/gmail`: thin compatibility wrappers around the package entrypoints
- `docs/contracts`: workflow contract docs
- `examples/pip-digest`: notes for the current Pip example workflow

The manifest currently declares:

- the OpenClaw adapter roots
- the generic skill test runner
- the skill used for adapter smoke validation
- lightweight smoke-test commands the runtime can execute without knowing newsletter-specific bin names

The OpenClaw skill entrypoint remains intentionally small:

- `Run pip-newsletter-digest now.`
- `Run pip-newsletter-digest now in test mode.`

The runtime owns the generic `agent-runtime ... test skill ...` dispatch; this repo owns what the skill and its test entrypoint actually do.

## Status

This is still a lightweight extraction, but the package boundary is now clearer:

- the integration manifest declares the runtime-facing surface
- `adapter/openclaw` owns the OpenClaw-specific assets
- `lib/*` owns the workflow implementation
- `bin/*` owns the installable command surface

The remaining simplification work is mostly about refining module boundaries inside `lib/*`, not about moving runtime concerns back into this repo.
