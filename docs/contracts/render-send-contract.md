# Render and Send Contract

This contract defines the boundary after `digest.json` exists.

It covers:

- deterministic render outputs
- finalization behavior
- send helper inputs and outputs

## Render contract

Renderer input:

- `digest.json`

Renderer outputs:

- `email.html`
- `email.txt`

Current invocation shape:

```bash
bash scripts/render-newsletter-digest.sh \
  --input DIGEST_JSON \
  --html-out EMAIL_HTML \
  --text-out EMAIL_TXT
```

Rules:

- rendering must be deterministic for the same `digest.json`
- HTML and plaintext must come from the same structured source
- renderer should fail fast on obviously malformed or low-quality digest content

## Finalization contract

Finalizer purpose:

- copy digest inputs into the day directory
- render `email.html` and `email.txt`
- invoke the send helper

Current invocation shape:

```bash
bash scripts/finalize-newsletter-digest.sh \
  --digest-json DIGEST_JSON \
  --day-dir DAY_DIR \
  --account ACCOUNT_EMAIL \
  --to TO_EMAIL \
  --subject SUBJECT \
  [--from FROM_EMAIL] \
  [--message-ids-json MESSAGE_IDS_JSON] \
  [--source-artifacts-json SOURCE_ARTIFACTS_JSON]
```

Required outputs after successful finalization/send:

- day-root `digest.json`
- day-root `email.html`
- day-root `email.txt`
- run-archived `digest.json`
- run-archived `email.html`
- run-archived `email.txt`
- run-archived `summary.json`
- run-archived `send-result.json`

## Summary contract

`summary.json` should include at least:

- `subject`
- `recipient`
- `sender`
- `account`
- `localDate`
- `runTimestamp`
- `runDir`
- `selectedMessageIds`
- `sourceArtifactDirs`

This is the operational summary record for the run.

## Send helper contract

Current send helper input shape:

```bash
bash scripts/send-gog-digest.sh \
  --account ACCOUNT_EMAIL \
  --to TO_EMAIL \
  --subject SUBJECT \
  [--digest-json DIGEST_JSON] \
  --text-file TEXT_FILE \
  --html-file HTML_FILE \
  --day-dir DAY_DIR \
  [--from FROM_EMAIL] \
  [--message-ids-json MESSAGE_IDS_JSON] \
  [--source-artifacts-json SOURCE_ARTIFACTS_JSON]
```

Current transport implementation:

- `gog gmail send`

## Send success rule

Delivery is only successful if the send result contains a Gmail message id in one of:

- `message_id`
- `messageId`

If neither is present:

- the send must be treated as failed

## Send result contract

Current persisted output:

- `send-result.json`

Rules:

- must contain the raw or normalized transport result
- callers should not infer success from command output alone
- callers should use the explicit message-id rule above

## Size and transport constraints

Current `gog` transport behavior includes:

- plaintext body passed by file
- HTML body passed inline
- HTML size guard via `MAX_GOG_HTML_BYTES`

This transport-specific constraint belongs to the transport layer, not the digest schema.

## Future transport guidance

For the future newsletter repo:

- `gog` remains one transport implementation
- other transports should implement the same success/failure contract
- finalizer callers should not need to change when the transport backend changes
