# Agent Newsletter Digest

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

## Layout

- `integration.json`: lightweight manifest consumed by the runtime repo
- `adapter/openclaw`: OpenClaw-specific skills and test runner
- `scripts/email`: current extraction, render, and finalize entry points
- `scripts/gmail`: current `gog`-based send transport entry point
- `docs/contracts`: workflow contract docs
- `examples/pip-digest`: notes for the current Pip example workflow

The manifest currently declares:

- the OpenClaw adapter roots
- the generic skill test runner
- the skill used for adapter smoke validation
- lightweight smoke-test commands the runtime can execute without knowing newsletter-specific bin names

## Status

This is still a lightweight extraction. The repo now exposes a concrete integration manifest and adapter boundary, while the core implementation remains in simple top-level scripts until a later modularization pass is worth the extra structure.
