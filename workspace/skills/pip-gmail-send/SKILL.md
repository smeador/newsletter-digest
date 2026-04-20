# pip-gmail-send

Use this skill when Pip needs to send an email from Pip's Gmail account through `gog`.

## Purpose

- Send an email from `pip@meador.me`, using HTML plus a plain-text fallback when formatting matters
- Support digests, notes, and other low-risk outbound mail to Sean
- Keep email sending local-first before promoting the same pattern to Docker/cloud

## Allowed actions

- Send email through `gog gmail send`
- Send to `sean@meador.me` by default
- Use a concise, descriptive subject line
- Include HTML email bodies when presentation matters, provided a plain-text fallback is also sent

## Not allowed

- Store OAuth/client secrets in repo-managed files
- Send broad outbound mail without explicit approval
- Send attachments unless explicitly requested

## Requirements

- `gog` installed and authorized for `pip@meador.me`
- Gmail send access already working for that account

## Default policy

- Default sender account: `pip@meador.me`
- Default recipient: `sean@meador.me`
- Default format for digests: HTML with a plain-text fallback
- If the user asks to "email me" without further detail, send to `sean@meador.me`

For newsletter digests:

- HTML is the primary body
- plain text is fallback only
- plaintext-only delivery is not a successful digest send unless the user explicitly requested plaintext-only
- `digest.json` is the structured source of truth for final digest content when present
- the final HTML should also be written to a local artifact file before send
- the final plain-text fallback should also be written to a local artifact file before send
- the helper should create a timestamped run directory inside the provided day directory
- use `bash scripts/finalize-newsletter-digest.sh --digest-json DIGEST_JSON --day-dir DAY_DIR --account ACCOUNT --to TO --subject SUBJECT --from FROM --message-ids-json MESSAGE_IDS_JSON --source-artifacts-json SOURCE_ARTIFACTS_JSON` for digest sends
- the wrapper resolves to the installed helper when available and otherwise falls back to the repo copy

## Local helper

```bash
bash scripts/gmail/send-gog-local.sh pip@meador.me sean@meador.me "Test subject" -
```

Then provide the body on stdin.

Example:

```bash
printf 'This is a test from Pip.\n' | bash scripts/gmail/send-gog-local.sh pip@meador.me sean@meador.me "Pip test" -
```

HTML example:

```bash
printf 'This is a test from Pip.\n' | bash scripts/gmail/send-gog-local.sh \
  pip@meador.me \
  sean@meador.me \
  "Pip HTML test" \
  - \
  /Users/sean/Repos/gcp-claw-lab/workspace/.tmp/pip-test.html
```

## Output requirements

- Confirm recipient, subject, and that the send succeeded
- Do not print tokens, credentials, or raw OAuth material
- Keep the message body concise unless the user requests a longer email
- When sending HTML, always include a plain-text fallback body
- For digest sends, use `gog gmail send` with the HTML body included; do not treat plaintext-only as success
- Distinguish clearly between the plain-text body and the HTML body; do not send HTML-looking text as the plain-text body
- When using HTML, the value passed as the HTML body must be the actual HTML markup, not a filesystem path or temp-file path
- A file path is only acceptable as an argument to a helper script that reads the file contents before sending; do not send the path string itself as the email body
- For digest sends, write the structured `digest.json` artifact to disk before calling the finalizer
- For digest sends, only report success if the helper/send output includes a Gmail id in `send_result.message_id` or `send_result.messageId`
