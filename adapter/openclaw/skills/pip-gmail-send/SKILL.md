# pip-gmail-send

Use this skill when the Pip example workflow needs to send an email through `gog`.

## Purpose

- Send an email from `gmail-workflow@example.com`, using HTML plus a plain-text fallback when formatting matters
- Support digests, notes, and other low-risk outbound mail to the configured operator recipient
- Keep email sending local-first before promoting the same pattern to Docker/cloud

## Allowed actions

- Send email through `gog gmail send`
- Send to `operator@example.com` by default
- Use a concise, descriptive subject line
- Include HTML email bodies when presentation matters, provided a plain-text fallback is also sent

## Not allowed

- Store OAuth/client secrets in repo-managed files
- Send broad outbound mail without explicit approval
- Send attachments unless explicitly requested

## Requirements

- `gog` installed and authorized for `gmail-workflow@example.com`
- Gmail send access already working for that account

## Default policy

- Default sender account: `gmail-workflow@example.com`
- Default recipient: `operator@example.com`
- Default format for digests: HTML with a plain-text fallback
- If the user asks to "email me" without further detail, send to `operator@example.com`

For newsletter digests:

- HTML is the primary body
- plain text is fallback only
- plaintext-only delivery is not a successful digest send unless the user explicitly requested plaintext-only
- `digest.json` is the structured source of truth for final digest content when present
- the final HTML should also be written to a local artifact file before send
- the final plain-text fallback should also be written to a local artifact file before send
- the helper should create a timestamped run directory inside the provided day directory
- use `agent-newsletter-digest-finalize --digest-json DIGEST_JSON --day-dir DAY_DIR --account ACCOUNT --to TO --subject SUBJECT --from FROM --message-ids-json MESSAGE_IDS_JSON --source-artifacts-json SOURCE_ARTIFACTS_JSON` for digest sends

## Command surface

For digest sends:

- use `agent-newsletter-digest-finalize ...`
- let the finalizer render `email.html` and `email.txt`, write the run artifacts, and invoke the send helper

For non-digest workflow mail:

- use `gog gmail send` directly
- inspect `gog gmail send --help` before composing the command if you are unsure about flags or body handling
- when sending HTML, make sure the HTML body argument is actual markup, not a filesystem path string

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
