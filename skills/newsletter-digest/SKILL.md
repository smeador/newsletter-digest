# newsletter-digest

Use this skill to run the newsletter digest workflow end to end.

This skill is the orchestrator. It owns:

- email retrieval
- filtering and issue selection
- issue-link extraction
- handing the selected source material to the formatter
- delivery through `gog gmail send`

Do not use this skill to invent the final digest structure from scratch. Use the formatter skill at:

- `/workspace/skills/newsletter-digest-format/SKILL.md`

once the source set is selected.

At the start of the run, load the workflow policy from:

- `/workspace/config/newsletter-digest.json`

Treat that config as the source of truth for:

- which sources are in scope
- how those sources are queried and matched
- which extra collections to include
- issue-link preferences
- output subject template
- source-specific formatting expectations that need to be passed to the formatter

## Invocation rules

Treat these requests as direct execution commands:

- `Run newsletter-digest now.`
- `Run newsletter-digest now in test mode.`
- `Run the newsletter digest now.`
- `Send today's newsletter digest.`

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

## Source policy

Do not hardcode the publication list inside the run.

Instead:

- read `sourcePolicy.primary` from `/workspace/config/newsletter-digest.json`
- read `sourcePolicy.extras` from `/workspace/config/newsletter-digest.json`
- apply the configured source and collection selection rules during source selection

## Retrieval rules

### Lookback window

- default to `lookbackHours` from `/workspace/config/newsletter-digest.json`
- always do a historical pull; do not rely only on webhook or new-mail state
- compute the cutoff once at the start of the run as `now - lookbackHours`
- treat the cutoff as strict: do not select any source or extra item older than the configured lookback window
- first fetch metadata/snippets for the lookback window
- then fetch full bodies only for the messages you actually plan to use
- Gmail query hints may overfetch because Gmail date operators are coarse; filter candidates by message timestamp after search before selecting or extracting

### Gmail command pattern

Resolve the workflow Gmail account once at the start of the run:

- `ACCOUNT="$(printenv GOG_ACCOUNT)"`
- if `ACCOUNT` is empty, stop and report that the runtime did not provide `GOG_ACCOUNT`

If the request does not explicitly provide a digest recipient, resolve the default recipient from the newest prior digest summary:

- first use `delivery.defaultRecipient` from `/workspace/config/newsletter-digest.json` when present
- otherwise, if `delivery.defaultRecipientFromPreviousSummary` is true, read the most recent `/workspace/memory/digests/*/summary.json` and reuse its `recipient` field
- if neither config nor prior summary provides a recipient, stop and report that no default recipient could be determined

Use `gog` in this exact retrieval flow:

1. `gog gmail search QUERY --account "$ACCOUNT" --json --results-only --no-input`
2. choose the newest valid issue
3. run the newsletter extractor for each selected message id:
   - `newsletter-digest-extract --account "$ACCOUNT" --message-id MESSAGE_ID --output /workspace/memory/.tmp/NAME.json`
4. read the extractor output, not the raw Gmail payload

Command-shape rules:

- the Gmail search query is a positional argument, not a `--query` flag
- valid example:
  - `gog gmail search "from:newsletter@example.com newer_than:2d -label:sent" --account "$ACCOUNT" --json --results-only --no-input`
- invalid example:
  - `gog gmail search --query "from:newsletter@example.com newer_than:2d -label:sent" --account "$ACCOUNT" --json --no-input`

Account rules:

- all Gmail retrieval and send commands in this workflow must use the configured runtime workflow account from `GOG_ACCOUNT`
- do not substitute the recipient email, the current human user email, or an inferred account name
- when no recipient is explicitly provided, resolve the recipient from workflow config or the newest prior digest recipient as described above
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
- do not use any Gmail account other than the configured `GOG_ACCOUNT` for this workflow unless the user explicitly changes the workflow account

Treat `gog gmail search` as the only valid Gmail search command in this workflow.

Additional hard rule:

- if you need individual message ids, derive them from `gog gmail search ... --json --no-input` results and then use the extractor; do not switch to `gog gmail messages search`

### Source matching and selection

For each source in `sourcePolicy.primary`:

- start with its configured `queryHints` and `senders`
- apply its configured `selectionRules`
- if no valid issue is found within the strict lookback window, fall back to broader sender, subject, publication, and body matching before marking the source as missing
- fallback matching must stay inside the strict lookback window; never pull an older issue just because the source has no weekend or delayed article

For each collection in `sourcePolicy.extras`:

- use its configured `lookbackHours` if present, otherwise inherit the workflow lookback window
- apply the same strict cutoff rule before including an extra item
- apply any configured exclusions such as `excludeSourceKeys`
- preserve enough metadata so the formatter can follow the collection's configured `itemRules`

## Link extraction rules

Find one useful public link for every selected source and every included extra item.

### Preferred links

Use the configured `linkPreference` for each source or collection.

Look for the phrases configured in `sourcePolicy.linkCues`, such as:

- `View in browser`
- `Read in browser`
- `Read online`

Prefer those over generic publication pages when they satisfy the configured `linkPreference`.

### Disallowed links

Never use the categories listed in `sourcePolicy.disallowedLinks`.

## Formatter handoff

After source selection is complete, switch to the formatter skill:

- `/workspace/skills/newsletter-digest-format/SKILL.md`

Pass it the selected source material cleanly:

- newsletter name
- issue date
- sender/publication
- chosen public link
- cleaned markdown from `clean.md`
- curated links from `links.json`
- metadata from `metadata.json`
- only the relevant extracted content needed for summarization
- the relevant source or collection config from `/workspace/config/newsletter-digest.json`, especially `formatRules`, `itemRules`, and any special-case notes

The formatter must return structured digest JSON that matches its schema and is ready for the renderer. It must not return raw HTML.

Do not keep discovering new emails while formatting unless a required primary newsletter is still missing.

The formatter owns:

- digest structure
- depth
- section labels
- JSON output checks

## Delivery

- send by default to the newest prior digest recipient from `/workspace/memory/digests/*/summary.json`
- send from the configured runtime workflow account in `GOG_ACCOUNT`
- use `gog gmail send`, not SMTP
- subject format:
  - use `delivery.subjectTemplate` from `/workspace/config/newsletter-digest.json`
- use the configured `timezone` from `/workspace/config/newsletter-digest.json`
- resolve `TIMEZONE` once from the config before building dates or finalizer arguments
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
- run `newsletter-digest-validate --input DIGEST_JSON --write` before finalization
- if the validator repairs `digest.json`, continue with the repaired file instead of hand-editing escaping inline
- use `gog gmail send` in a way that includes the HTML body for the digest
- include a plain-text fallback body for email compatibility
- a plaintext-only send is not a successful digest send unless the user explicitly asked for plaintext-only
- `digest.json` is the source of truth for final content
- use the configured `timezone` for the run directory name
- use a local day directory such as `/workspace/memory/digests/YYYY-MM-DD/`
- write `selected-message-ids.json` and `source-artifact-dirs.json` to temporary files for the finalizer input
- finalize render + send with:
  - `newsletter-digest-finalize --digest-json DIGEST_JSON --day-dir DAY_DIR --account "$ACCOUNT" --to "$TO" --subject SUBJECT --from "$ACCOUNT" --timezone TIMEZONE --message-ids-json MESSAGE_IDS_JSON --source-artifacts-json SOURCE_ARTIFACTS_JSON`
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

- reuse matching source content from the configured lookback window
- ignore previously sent digest emails as source material
- still send the email
- do not reduce digest depth just because it is a test
- execute the digest workflow directly inside the current run
- do not invoke `/workspace/scripts/run-digest-test-via-cron.sh`
- do not create another temporary cron job or nested test wrapper from inside this skill run
- if you need the local date in shell, use `TZ="$(jq -r '.timezone' /workspace/config/newsletter-digest.json)" date '+%F'`; do not assume `python3` is installed

## Constraints

- preserve the original content and intent while reducing length
- do not flatten the entire digest into one synthesis
- synthesize within each newsletter section only
- do not reproduce the full email body
- quote only short phrases when necessary
- do not perform delete or unsubscribe actions automatically
- do not include secrets or credentials in output
