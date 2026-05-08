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

At a high level, it:

1. finds the newest relevant newsletter issues in the active time window
2. extracts each selected message into a stable artifact set
3. hands the cleaned source material to the formatter
4. validates the resulting `digest.json`
5. renders the digest into HTML and plain text
6. sends the digest and archives the run

The current workflow is opinionated about a few source categories:

- primary newsletters
- Substack emails
- Stanford newsletter emails

Those opinions live at the skill layer. The lower-level package commands are more generally useful as extraction, validation, rendering, and send helpers.

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
- `newsletter-digest-validate`: validate and normalize `digest.json`
- `newsletter-digest-render`: render `digest.json` into `email.html` and `email.txt`
- `newsletter-digest-finalize`: validate, render, archive, and send a digest run
- `newsletter-digest-send`: send pre-rendered HTML and plain-text email bodies

These commands let you use the pieces independently if you want a custom orchestration layer.

## Workflow Shape

The workflow is organized around a few stable boundaries:

### 1. Source Extraction

Each selected email is converted into a cached artifact set with:

- cleaned markdown/plain-text content
- message metadata
- curated candidate links
- raw text and optional raw HTML for debugging

This keeps downstream logic off of raw Gmail payloads.

Contract: [docs/contracts/source-artifact-contract.md](/Users/sean/Repos/newsletter-digest/docs/contracts/source-artifact-contract.md)

### 2. Digest Assembly

The formatter produces one `digest.json` object that becomes the canonical structured digest.

This is the handoff point between summarization and presentation.

Contract: [docs/contracts/digest-json-contract.md](/Users/sean/Repos/newsletter-digest/docs/contracts/digest-json-contract.md)

### 3. Rendering And Delivery

Once `digest.json` exists, the rest of the flow is deterministic:

- validate the JSON
- render HTML and plain text
- archive artifacts
- send the email

Contract: [docs/contracts/render-send-contract.md](/Users/sean/Repos/newsletter-digest/docs/contracts/render-send-contract.md)

## Repo Layout

- `bin/`: installable command entrypoints
- `lib/extract`: newsletter extraction logic
- `lib/render`: digest rendering logic
- `lib/send`: validation, finalization, and email transport logic
- `docs/contracts`: stable workflow contracts
- `skills`: core skill definitions for digest orchestration, formatting, and delivery
- `openclaw`: runtime-facing scripts and test harnesses for the intended execution environment

## OpenClaw Runtime

OpenClaw is the intended way to run this workflow end to end.

The repo is organized around that assumption:

- the core skills live in `skills`
- the OpenClaw runtime surface lives in `openclaw`
- the runtime-facing manifest stays at `integration.json`
- runtime expectations are documented in [docs/contracts/openclaw-runtime-expectations.md](/Users/sean/Repos/newsletter-digest/docs/contracts/openclaw-runtime-expectations.md)
- the current runtime repo is [agent-lab](https://github.com/smeador/agent-lab)

The repo still keeps the lower-level commands reusable, but the full orchestration model, artifact layout, and runtime assumptions are designed around OpenClaw rather than a generic pluggable runtime layer.
