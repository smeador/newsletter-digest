# OpenClaw Adapter Runtime Expectations

This contract defines what the OpenClaw-facing newsletter adapter may assume about the runtime environment.

The skill is the agent-facing entry point.

This document covers the environment-facing promises that make the skill usable.

## Purpose

The newsletter repo should not need to own runtime provisioning details.

Instead:

- the runtime repo provisions capabilities
- the newsletter adapter consumes those capabilities

## Expected capabilities

### OpenClaw runtime

The environment provides:

- a working OpenClaw runtime
- a writable OpenClaw home/state path
- a reviewed workspace mounted at `/workspace` in Docker-local/cloud environments

### `gog`

The environment provides:

- `gog` on `PATH`
- Gmail auth already provisioned for the configured workflow account

The newsletter adapter may assume:

- it can call `gog gmail search`
- it can call `gog gmail send`

The newsletter adapter should not assume:

- responsibility for installing `gog`
- responsibility for bootstrapping the auth store from scratch

### Workspace paths

In Docker-local/cloud, the adapter may assume:

- `/workspace` exists
- `/workspace/memory` is writable
- `/workspace/memory/.tmp` is writable
- `/workspace/.openclaw` is writable

The adapter should not assume:

- `/workspace` itself is writable
- `/workspace/.tmp` is writable

### Helper availability

The adapter may assume that helper entry points are available either through:

- installed helper commands
- `/workspace/scripts/*` wrappers
- repo-resolved fallback scripts

The adapter should prefer stable wrapper paths over inlining long command logic.

## Runtime-specific path expectations

### Docker-local / cloud

Normal writable working paths:

- `/workspace/memory/`
- `/workspace/memory/.tmp/`
- `/workspace/.openclaw/`

### Native local

Native local may differ in exact filesystem layout, but should still satisfy:

- a writable artifact root
- a writable scratch root
- working `gog`
- working OpenClaw environment

## Account expectations

For the current Pip workflow, the adapter assumes:

- Gmail workflow account:
  - `pip@meador.me`
- default digest recipient:
  - `sean@meador.me`

These values are workflow configuration, not universal adapter requirements.

Long term, they should be configurable inputs rather than hardcoded assumptions.

## Skill/runtime boundary

The skill owns:

- workflow invocation semantics
- retrieval/synthesis instructions
- how to use the available helpers

The runtime owns:

- installing capabilities
- mounting writable paths
- providing auth and secrets
- exposing helper binaries/wrappers

## Failure model

If a runtime expectation is not satisfied, the adapter should fail clearly.

Examples:

- `gog` missing
- configured Gmail auth missing
- writable scratch path missing
- helper wrapper not found

These should be treated as environment/runtime failures, not as reasons for the skill to invent a new execution path.
