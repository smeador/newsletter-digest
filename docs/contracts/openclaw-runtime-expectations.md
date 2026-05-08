# OpenClaw Runtime Expectations

This contract defines what the newsletter workflow may assume about the OpenClaw runtime environment.

The skill is the agent-facing entry point.

This document covers the environment-facing promises that make the skill usable.

## Purpose

The newsletter repo should not need to own runtime provisioning details.

Instead:

- the runtime repo provisions capabilities
- this repo's skills and scripts consume those capabilities directly inside OpenClaw

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

The workflow may assume that helper entry points are available either through:

- installed helper commands from the package itself
- OpenClaw-owned runtime test entrypoints, such as `openclaw/tests/<skill>/TEST.sh`

The workflow should prefer stable package commands over inlining long command logic.

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

For the current newsletter workflow, the runtime should assume:

- the Gmail workflow account comes from runtime configuration, not from a literal hardcoded address
- an explicit recipient may be passed in by the caller
- if no recipient is passed, workflow-specific logic may reuse the newest prior digest recipient from artifacts

These values are workflow configuration, not universal adapter requirements.

## Skill/runtime boundary

The core skill layer owns:

- workflow invocation semantics
- retrieval/synthesis instructions
- how to use the available helpers

The OpenClaw runtime layer owns:

- installing capabilities
- mounting writable paths
- providing auth and secrets
- exposing helper binaries
- providing generic skill dispatch such as `agent-runtime test skill <skill>`
- runtime-specific test entrypoints such as `openclaw/tests/<skill>/TEST.sh`

## Failure model

If a runtime expectation is not satisfied, the workflow should fail clearly.

Examples:

- `gog` missing
- configured Gmail auth missing
- writable scratch path missing
- package command or skill test entrypoint not found

These should be treated as environment/runtime failures, not as reasons for the skill to invent a new execution path.
