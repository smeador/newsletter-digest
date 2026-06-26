# newsletter-digest

Use this skill to run the newsletter digest workflow through the stable runner command.

This skill is intentionally lightweight. It is the portable OpenClaw entry point, not the production orchestrator.

## Invocation Rules

Treat these requests as direct execution commands:

- `Run newsletter-digest now.`
- `Run newsletter-digest now in test mode.`
- `Run the newsletter digest now.`
- `Send today's newsletter digest.`

Start immediately. Do not search the workspace, inspect Gmail, read prior digests, or rediscover implementation files.

## Command Contract

First verify the runner exists:

- `command -v newsletter-digest-run`

Then run exactly one of these commands:

- normal send: `newsletter-digest-run --mode send`
- test mode: `newsletter-digest-run --mode test-send`
- dry run when explicitly requested: `newsletter-digest-run --mode dry-run`

If the runner command is missing, stop and report that the newsletter integration is not installed correctly.

## Hard Rules

- Do not run `gog gmail search` directly from this skill.
- Do not run `newsletter-digest-extract`, `newsletter-digest-render`, `newsletter-digest-validate`, `newsletter-digest-finalize`, or `newsletter-digest-send` directly from this skill.
- Do not read `/workspace/memory/newsletters/**`, raw Gmail JSON, raw HTML, or prior digest files during a normal run.
- Do not use broad filesystem searches such as `grep -R`, `rg`, or `find /workspace` to discover the workflow.
- Do not hand-edit generated digest JSON.
- Do not retry with alternate command shapes if the runner fails.

The runner owns:

- Gmail retrieval
- strict lookback enforcement
- candidate scoring and bounded adjudication
- extraction/cache validation
- bounded formatter handoff
- validation, rendering, sending, artifacts, and usage summaries

## Reporting

The runner prints a JSON summary. Report the important fields from that summary:

- `status`
- `mode`
- `runDir`
- `selectedMessageIds`
- `summaryJson`
- `usageSummary` or `usage-summary.json` path when present

If the runner fails, report the failure and stop. Do not attempt manual recovery inside this skill.
