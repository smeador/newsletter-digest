# Agent Notes

This repo owns the portable newsletter digest workflow integration.

## Role In The Workspace

- Own newsletter-specific behavior here: selection, extraction handoff, runner commands, formatter inputs, rendering, validation, send orchestration, and tests.
- Keep runtime provisioning, cloud deployment, and cron configuration in the runtime repos (`pip-bot` and `claw-gcp-runtime`).
- Keep this repo portable across OpenClaw runtimes. The OpenClaw skill should remain a lightweight entry point, while production orchestration lives in code-owned commands.

## Current Direction

- `newsletter-digest-run` is the stable workflow command.
- The OpenClaw `newsletter-digest` skill should invoke the runner and stop.
- Use model intelligence only for bounded judgment and synthesis:
  - candidate selection adjudication when deterministic scoring is ambiguous
  - digest JSON formatting from trimmed, clean artifacts
- Do not put raw Gmail JSON, raw MIME, raw HTML, or broad filesystem search output into model context during normal runs.

## Cost And Reliability Rules

- Enforce strict lookback windows in code.
- Prefer deterministic scoring and artifact validation before calling a model.
- Keep model inputs compact and explicitly size bounded.
- Fail closed on malformed model output, missing artifacts, or missing model backend configuration.
- Write machine-readable artifacts for every run so failures can be inspected without rerunning the model.

## Testing

- Use `npm test` for unit and contract tests.
- Use `npm run check` for syntax and shell checks.
- OpenClaw end-to-end tests should go through the integration test runner, not ad hoc cron jobs.
