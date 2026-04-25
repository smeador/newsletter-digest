# pip-newsletter-digest

Use this skill to run the Pip newsletter digest workflow end to end.

This skill is the orchestrator. It owns:

- email retrieval
- filtering and issue selection
- issue-link extraction
- handing the selected source material to the formatter
- delivery through `gog gmail send`

Do not use this skill to invent the final digest structure from scratch. Use the formatter skill at:

- `/workspace/skills/pip-newsletter-digest-format/SKILL.md`

once the source set is selected.

## Invocation rules

Treat these requests as direct execution commands:

- `Run pip-newsletter-digest now.`
- `Run pip-newsletter-digest now in test mode.`
- `Run the Pip newsletter digest now.`
- `Send today's Pip newsletter digest.`

Do not ask:

- `Run what, specifically?`
- `Which job/script do you mean?`

Execute the workflow.

Start execution immediately.

Do not spend the first step on workspace orientation or generic environment checking unless a real failure forces you to diagnose it.

When using the `exec` tool for shell commands, assume the command may run under `sh`, not `bash`.

Hard rule:

- do not use bash-only shell syntax in raw `exec` commands unless you explicitly wrap it in `bash -lc '...'`

Examples of bash-only syntax to avoid in raw `exec` commands:

- `set -o pipefail`
- here-strings
- bash arrays
- `[[ ... ]]`
- process substitution

## Sources in scope

### Primary newsletters

- `NY Times Morning`
- `Daily Upside`
- `AI News` (`swyx+ainews@substack.com`)

### Additional sections

- Substack emails from the last `24 hours`
- Stanford newsletter emails from the last `24 hours`

Ignore GoodLinks and non-email sources.

## Retrieval rules

### Lookback window

- default lookback: rolling `last 24 hours`
- always do a historical pull; do not rely only on webhook or new-mail state
- first fetch metadata/snippets for the lookback window
- then fetch full bodies only for the messages you actually plan to use

### Gmail command pattern

Use `gog` in this exact retrieval flow:

1. `gog gmail search QUERY --account pip@meador.me --json --results-only --no-input`
2. choose the newest valid issue
3. run the newsletter extractor for each selected message id:
   - `agent-newsletter-digest-extract --account pip@meador.me --message-id MESSAGE_ID --output /workspace/memory/.tmp/NAME.json`
4. read the extractor output, not the raw Gmail payload

Command-shape rules:

- the Gmail search query is a positional argument, not a `--query` flag
- valid example:
  - `gog gmail search "from:nytdirect@nytimes.com newer_than:2d -label:sent" --account pip@meador.me --json --results-only --no-input`
- invalid example:
  - `gog gmail search --query "from:nytdirect@nytimes.com newer_than:2d -label:sent" --account pip@meador.me --json --no-input`

Account rules:

- all Gmail retrieval and send commands in this workflow must use the configured workflow account `pip@meador.me`
- do not substitute the recipient email, the current human user email, or an inferred account name
- `sean@meador.me` is the default digest recipient, not the Gmail API account for this workflow
- if a Gmail command fails because of an unknown flag or command-shape mismatch, inspect `gog gmail search --help` or the relevant `gog` help output before retrying

The extractor also writes inspectable artifacts and cache files under:

- `/workspace/memory/newsletters/MESSAGE_ID/`

Scratch-file rule:

- when you need temporary files for this workflow, write them under `/workspace/memory/.tmp/`
- do not write scratch files under `/workspace/.tmp/`
- in Docker-local and cloud, `/workspace` is intentionally read-only except for explicitly mounted subpaths such as `/workspace/memory/` and `/workspace/.openclaw/`

Those artifacts include:

- `raw.html` when an HTML body exists
- `raw.txt`
- `clean.md`
- `links.json`
- `metadata.json`
- `extracted.json`

If the same message id is selected again on a repeat run, prefer reusing the cached `extracted.json` instead of rebuilding it unless you explicitly need a refresh.

Normal workflow rule:

- use the cached artifact set as the source of truth for formatting handoff
- read `metadata.json`, `links.json`, and `clean.md`
- do not read `raw.html` or `raw.txt` during a normal digest run
- do not read duplicate body fields from `extracted.json` when `clean.md` is available
- use `raw.html` and `raw.txt` only when you are explicitly debugging extraction quality

Hard rules:

- do not use `gog gmail messages get`
- do not use `gog gmail messages search`
- do not use `--query` with `gog gmail search`
- do not paste raw `gog gmail get --json` output into the model conversation
- do not read raw MIME or raw HTML blobs directly into the conversation
- do not switch between multiple Gmail read subcommands during a normal run
- if the extractor fails, treat that as a tool failure and report it clearly
- do not silently substitute another unsupported command shape and continue
- do not use any Gmail account other than `pip@meador.me` for this workflow unless the user explicitly changes the workflow account

Treat `gog gmail search` as the only valid Gmail search command in this workflow.

Additional hard rule:

- if you need individual message ids, derive them from `gog gmail search ... --json --no-input` results and then use the extractor; do not switch to `gog gmail messages search`

### Fast-path senders

Start with these:

- `NY Times Morning`: `nytdirect@nytimes.com`
- `Daily Upside`: `squad@thedailyupside.com`
- `AI News`: `swyx+ainews@substack.com`

If no valid issue is found, fall back to broader sender, subject, publication, and body matching before marking the source as missing.

### Selection rules

- for each primary newsletter, choose the newest valid issue in the active window
- prefer the newest same-day issue in `America/Chicago` when one exists
- if the digest runs shortly after the normal send time, explicitly check whether a newer same-day issue arrived after an earlier digest run
- do not include `AI News` again in the Substack section

### Daily Upside matching

- do not rely on one exact sender forever
- if a message plausibly looks like Daily Upside but sender formatting changed, inspect it
- treat sender variants, wrappers, and aliases as eligible when the subject or publication clearly indicate Daily Upside
- be aware that the Sunday edition may be a long-form single-feature format rather than the usual multi-story weekday structure
- when handing a Sunday long-form edition to the formatter, preserve that fact so it is summarized as one main article instead of being forced into weekday sections

## Link extraction rules

Find one useful public link for every primary newsletter and every included Substack item.

### Preferred links

- for primary newsletters: issue-level browser version
- for Substack: article page
- for Stanford: useful public article page when one exists

Look for phrases such as:

- `View in browser`
- `Read in browser`
- `Read online`

Prefer those over generic publication pages.

### Disallowed links

Never use:

- Gmail links
- mailbox links
- message-view links
- thread-view links
- unsubscribe/settings links
- ad/sponsor links
- image asset URLs

## Formatter handoff

After source selection is complete, switch to the formatter skill:

- `/workspace/skills/pip-newsletter-digest-format/SKILL.md`

Pass it the selected source material cleanly:

- newsletter name
- issue date
- sender/publication
- chosen public link
- cleaned markdown from `clean.md`
- curated links from `links.json`
- metadata from `metadata.json`
- only the relevant extracted content needed for summarization

The formatter must return structured digest JSON that matches its schema and is ready for the renderer. It must not return raw HTML.

Do not keep discovering new emails while formatting unless a required primary newsletter is still missing.

The formatter owns:

- digest structure
- depth
- section labels
- JSON output checks

## Delivery

- send by default to `sean@meador.me` from `pip@meador.me`
- use `gog gmail send`, not SMTP
- subject format:
  - `Pip Newsletter Digest - YYYY-MM-DD`
- use the local date in `America/Chicago`
- send the digest as an HTML email with a plain-text fallback

Before sending, write delivery artifacts under:

- `/workspace/memory/digests/YYYY-MM-DD/`

Required files:

- `digest.json`
- `summary.json`

`summary.json` should include at least:

- subject
- recipient
- sender
- local date
- selected message ids
- source artifact directories

Hard rules:

- the formatter must return one valid `digest.json` object, not HTML
- write the formatter output to a local `digest.json` file before finalization
- use `gog gmail send` in a way that includes the HTML body for the digest
- include a plain-text fallback body for email compatibility
- a plaintext-only send is not a successful digest send unless the user explicitly asked for plaintext-only
- `digest.json` is the source of truth for final content
- use local `America/Chicago` time for the run directory name
- use a local day directory such as `/workspace/memory/digests/YYYY-MM-DD/`
- write `selected-message-ids.json` and `source-artifact-dirs.json` to temporary files for the finalizer input
- finalize render + send with:
  - `agent-newsletter-digest-finalize --digest-json DIGEST_JSON --day-dir DAY_DIR --account ACCOUNT --to TO --subject SUBJECT --from FROM --message-ids-json MESSAGE_IDS_JSON --source-artifacts-json SOURCE_ARTIFACTS_JSON`
- the finalizer owns copying day-root artifacts, rendering `email.html` and `email.txt`, and invoking the send helper
- the finalizer must write `digest.json`, `email.html`, `email.txt`, `summary.json`, and `send-result.json` into the final run record
- only treat delivery as successful if the helper returns a Gmail id in either `send_result.message_id` or `send_result.messageId`
- if both `message_id` and `messageId` are missing, treat that as a send failure even if the command printed other output

If delivery fails:

- keep the digest in the response
- report the failure clearly
- include intended recipient and subject
- do not auto-retry

## Test mode

If the request says `test mode`, `rerender`, or similar:

- reuse matching source content from the same `24 hour` lookback window
- ignore previously sent digest emails as source material
- still send the email
- do not reduce digest depth just because it is a test

## Constraints

- preserve the original content and intent while reducing length
- do not flatten the entire digest into one synthesis
- synthesize within each newsletter section only
- do not reproduce the full email body
- quote only short phrases when necessary
- do not perform delete or unsubscribe actions automatically
- do not include secrets or credentials in output
