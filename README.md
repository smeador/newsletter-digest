# Newsletter Digest

`newsletter-digest` is a reusable workflow for turning a set of email newsletters into a polished daily digest.

It handles the full pipeline:

- retrieve newsletter emails from Gmail
- extract stable, reusable source artifacts from each message
- assemble a structured `digest.json`
- render matching HTML and plain-text versions
- archive the run artifacts
- send the final digest email

The goal is not just "summarize some emails." The goal is to produce a repeatable digest workflow with inspectable inputs, deterministic render output, and a clean send/archive boundary.

The repo also provides parsing and construction logic around the agent workflow. Email extraction is normalized into stable artifacts before summarization, and final delivery is built from structured `digest.json` rather than freeform generated HTML. This makes the workflow more deterministic and substantially reduces token usage by keeping raw Gmail payloads, MIME blobs, repeated newsletter chrome, and renderer details out of the model handoff.

## OpenClaw Runtime

OpenClaw is the intended way to run this workflow end to end. The companion runtime used for this workflow lives at [smeador/claw-gcp-runtime](https://github.com/smeador/claw-gcp-runtime), but the package can work with any OpenClaw runtime after a small amount of setup for skills, config, environment, and scheduled execution.

The repo is organized around that assumption:

- the core skills live in `skills`
- the OpenClaw runtime surface lives in `openclaw`
- the runtime-facing manifest stays at `integration.json`
- runtime expectations are documented in [docs/contracts/openclaw-runtime-expectations.md](docs/contracts/openclaw-runtime-expectations.md)

The repo still keeps the lower-level commands reusable, but the full orchestration model, artifact layout, and runtime assumptions are designed around OpenClaw rather than a generic pluggable runtime layer.

## What You Get

A successful digest run produces:

- `digest.json`: the structured source of truth for the final digest
- `email.html`: the rendered HTML email body
- `email.txt`: the plain-text fallback email body
- `summary.json`: operational metadata about the run
- `send-result.json`: the transport result from the email send step
- per-message extraction artifacts such as cleaned markdown, metadata, and curated candidate links

That makes the workflow useful both for direct delivery and for debugging, auditing, rerendering, or reusing a previous source set.

## What The Skill Does

The main skill is `newsletter-digest`.

The skill is a lightweight OpenClaw entry point. It invokes the stable runner command and reports the result:

```bash
newsletter-digest-run --mode send
```

For test mode it invokes:

```bash
newsletter-digest-run --mode test-send
```

The skill should not search Gmail, inspect workspace artifacts, hand-edit JSON, or rediscover implementation files. The runner owns the production control loop.

At a high level, the runner:

1. finds the newest relevant newsletter issues in the active time window
2. extracts each selected message into a stable artifact set
3. hands the cleaned source material to the formatter
4. validates the resulting `digest.json`
5. renders the digest into HTML and plain text
6. sends the digest and archives the run

The current workflow is configured around source categories such as:

- primary newsletters
- extra item collections

The orchestration mechanics live in the skills, while the workflow-specific source list and section policy live in config. The lower-level package commands are more generally useful as extraction, validation, rendering, and send helpers.

- [config/newsletter-digest.example.json](config/newsletter-digest.example.json)

## How To Use It

### As A Skill

Inside OpenClaw, the main entrypoints are intentionally simple:

- `Run newsletter-digest now.`
- `Run newsletter-digest now in test mode.`
- `Send today's newsletter digest.`

The formatter companion skill is `newsletter-digest-format`.
The Gmail delivery helper skill is `gmail-send`.

### As Package Commands

This repo also exposes standalone commands for the main workflow boundaries:

- `newsletter-digest-extract`: extract one Gmail message into cached source artifacts
- `newsletter-digest-run`: run the bounded production workflow
- `newsletter-digest-validate`: validate and normalize `digest.json`
- `newsletter-digest-render`: render `digest.json` into `email.html` and `email.txt`
- `newsletter-digest-finalize`: validate, render, archive, and send a digest run
- `newsletter-digest-send`: send pre-rendered HTML and plain-text email bodies

These commands let you use the pieces independently if you want a custom orchestration layer.

### Runner Modes

```bash
newsletter-digest-run --mode dry-run
newsletter-digest-run --mode test-send
newsletter-digest-run --mode send
```

- `dry-run` performs deterministic candidate search and selection planning, then writes `candidate-summary.json`.
- `test-send` and `send` continue through extraction, bounded model formatting, validation, rendering, delivery, and `usage-summary.json`.

The runner uses `GOG_ACCOUNT` for Gmail access unless `--account` is provided.

### Bounded Model Backend

The runner isolates model work behind a bounded JSON command interface. It uses deterministic code for retrieval, strict lookback filtering, artifact validation, and send orchestration.

The model backend is only responsible for JSON tasks such as:

- candidate adjudication when deterministic scoring is ambiguous
- extra item filtering from bounded Gmail label/query results
- digest formatting from compact `formatter-input.json`

By default the runner expects the bundled OpenClaw adapter command:

```bash
newsletter-digest-run --mode send
```

That default command is `newsletter-digest-openclaw-model`. Candidate selection uses:

```bash
openclaw infer model run --gateway --json
```

Digest formatting uses an OpenClaw agent file handoff. The adapter gives the agent the formatter input and output paths, and the agent reads `formatter-input.json` from disk and writes the final digest JSON to the requested output path.

You can override it:

```bash
NEWSLETTER_DIGEST_MODEL_COMMAND="..." newsletter-digest-run --mode send
```

The command receives:

- `NEWSLETTER_DIGEST_MODEL_TASK`
- `NEWSLETTER_DIGEST_MODEL_INPUT`
- `NEWSLETTER_DIGEST_MODEL_OUTPUT`

It must read the input JSON and write valid output JSON. This is the integration point for bounded OpenClaw JSON tasks.

## Workflow Config

Workflow-specific behavior lives in `config/newsletter-digest.json` at runtime. The committed reference file is [config/newsletter-digest.example.json](config/newsletter-digest.example.json); local/private `config/newsletter-digest.json` files are intentionally ignored.

The config controls:

- digest title, timezone, lookback window, delivery subject template, and default recipient
- primary source keys, titles, senders, query hints, and selection rules
- link preferences, link cues, and disallowed link categories
- source-specific formatting rules such as group titles, paragraph counts, bullet sections, and special-case issue formats
- extra item collections, including Gmail labels/query hints, per-collection selection and content caps, exclusions, inventory label, item label, and item formatting rules

The skills should read this config at runtime instead of hardcoding a specific newsletter mix. Extra collections can use `excludeSourceKeys` to keep configured primary newsletters out of broader extra collections and avoid duplicate classification. New formatter output should report extra collection counts through `inventory.extraCounts`, keyed by configured extra collection key. The workflow Gmail account is still runtime environment, supplied through `GOG_ACCOUNT`.

Full contract: [docs/contracts/workflow-config-contract.md](docs/contracts/workflow-config-contract.md)

## Workflow Shape

The workflow is organized around a few stable boundaries:

### 1. Source Extraction

Each selected email is converted into a cached artifact set with:

- cleaned markdown/plain-text content
- message metadata
- curated candidate links
- raw text and optional raw HTML for debugging

This keeps downstream logic off of raw Gmail payloads.

Contract: [docs/contracts/source-artifact-contract.md](docs/contracts/source-artifact-contract.md)

### 2. Digest Assembly

The formatter produces one `digest.json` object that becomes the canonical structured digest.

This is the handoff point between summarization and presentation.

Contract: [docs/contracts/digest-json-contract.md](docs/contracts/digest-json-contract.md)

### 3. Rendering And Delivery

Once `digest.json` exists, the rest of the flow is deterministic:

- validate the JSON
- render HTML and plain text
- archive artifacts
- send the email

Contract: [docs/contracts/render-send-contract.md](docs/contracts/render-send-contract.md)

## Repo Layout

- `bin/`: installable command entrypoints
- `lib/extract`: newsletter extraction logic
- `lib/render`: digest rendering logic
- `lib/send`: validation, finalization, and email transport logic
- `docs/contracts`: stable workflow contracts
- `config`: workflow-specific source and formatting policy
- `skills`: core skill definitions for digest orchestration, formatting, and delivery
- `openclaw`: runtime-facing scripts and test harnesses for the intended execution environment
