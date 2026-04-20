# Agent Newsletter Digest

This repo contains the newsletter extraction, digest synthesis, rendering, and send workflow that was extracted from the OpenClaw runtime lab.

## Scope

This repo owns:

- newsletter extraction artifacts and contracts
- digest JSON contract
- deterministic HTML/plaintext rendering
- digest finalization and send flow
- the OpenClaw adapter layer for the Pip workflow

This repo does not own runtime provisioning such as:

- OpenClaw installation
- Docker and cloud deployment
- `gog` installation
- secret rendering
- Gmail auth bootstrapping

Those remain the responsibility of the runtime repo.

## Layout

- `packages/core`: shared contracts and future schema validation
- `packages/provider-gmail`: Gmail-specific extraction/provider logic
- `packages/renderer-email`: deterministic email rendering
- `packages/transport-gmail-gog`: `gog`-based send transport
- `packages/adapter-openclaw`: OpenClaw-specific wrappers and skills
- `scripts/`: current extracted implementation entry points
- `workspace/`: compatibility OpenClaw wrappers and skills
- `examples/pip-digest`: notes for the current Pip example workflow

## Status

This is the first extraction pass. The implementation is intentionally close to the source repo so behavior stays stable while the boundary hardens.
