# Pip Digest Example

This example preserves the current Pip workflow shape while the repo split is in progress.

Current assumptions:

- workflow Gmail account: provided by the runtime through `GOG_ACCOUNT`
- default digest recipient: explicit caller input when provided, otherwise reuse the newest prior digest recipient from workflow artifacts
- OpenClaw skill entry point: `Run pip-newsletter-digest now.`

These are example/workflow details, not core package requirements.
