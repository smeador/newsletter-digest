# OpenClaw Runtime Expectations

This contract defines what the newsletter workflow may assume about the OpenClaw runtime environment.

The skill is the agent-facing entry point. The stable production workflow entry point is the `newsletter-digest-run` command that the skill invokes.

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

Required package commands for a full production run:

- `newsletter-digest-run`
- `newsletter-digest-openclaw-model`
- `newsletter-digest-extract`
- `newsletter-digest-validate`
- `newsletter-digest-render`
- `newsletter-digest-finalize`
- `newsletter-digest-send`

### Bounded model command

The production runner may call back into OpenClaw for bounded JSON tasks. By default it uses `newsletter-digest-openclaw-model`. Candidate selection calls `openclaw infer model run --gateway --json`; digest formatting uses local transport to avoid the gateway's fixed request deadline for slower models. Formatting is a single bounded call so the selected newsletter payload is billed once instead of being replayed through several agent tool turns. Gateway formatting remains available through `NEWSLETTER_DIGEST_FORMAT_TRANSPORT=gateway`, and the legacy `openclaw agent` file handoff through `NEWSLETTER_DIGEST_FORMAT_MODE=agent`. The runtime may override the adapter through `NEWSLETTER_DIGEST_MODEL_COMMAND` or `newsletter-digest-run --model-command`.

The command receives:

- `NEWSLETTER_DIGEST_MODEL_TASK`
- `NEWSLETTER_DIGEST_MODEL_INPUT`
- `NEWSLETTER_DIGEST_MODEL_OUTPUT`

It must read the input JSON and write valid output JSON. It should not perform Gmail retrieval, filesystem discovery beyond the provided paths, rendering, or sending.

The default adapter appends a `model-calls.json` audit artifact in the run directory. It records bounded operational metadata for each model call without retaining an additional copy of the prompt or response. `usage-summary.json` exposes its path as `modelCallsJson`.

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
- running `newsletter-digest-run`
- reporting the runner result

The `newsletter-digest-run` command owns:

- retrieval and source selection
- strict lookback enforcement
- extraction/cache validation
- bounded model handoffs
- validation, rendering, sending, and run artifacts

The OpenClaw runtime layer owns:

- installing capabilities
- mounting writable paths
- providing auth and secrets
- exposing helper binaries
- providing generic skill dispatch such as `agent-runtime test skill <skill>`
- runtime-specific test entrypoints such as `openclaw/tests/<skill>/TEST.sh`

The newsletter skill test must first verify that `openclaw skills info newsletter-digest` succeeds, then use the explicit `/skill:newsletter-digest` invocation through OpenClaw's cron `--wait` mode and verify durable workflow artifacts. A passing test requires a new successful `test-send` usage summary, `format-digest-contract-summary.json` with `status: valid`, a successful bounded formatter entry in `model-calls.json`, and a send-result artifact with a non-empty Gmail message ID. A successful enqueue response or an agent that independently rediscovers the runner is not sufficient.

## Failure model

If a runtime expectation is not satisfied, the workflow should fail clearly.

Examples:

- `gog` missing
- configured Gmail auth missing
- writable scratch path missing
- package command or skill test entrypoint not found
- bounded model command not configured for send modes

These should be treated as environment/runtime failures, not as reasons for the skill to invent a new execution path.
