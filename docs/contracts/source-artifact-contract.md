# Source Artifact Contract

This contract defines the cleaned newsletter artifact set produced by extraction and consumed by selection, formatting, and debugging flows.

## Purpose

The extractor is allowed to change internally as long as it continues to produce this artifact set consistently.

Downstream code should treat these artifacts as the stable source boundary instead of reading raw Gmail JSON or raw HTML directly.

## Artifact directory

Per-message artifact root:

- `/workspace/memory/newsletters/MESSAGE_ID/`

Cloud equivalent:

- `/opt/openclaw/state/memory/newsletters/MESSAGE_ID/`

## Required artifacts

These files must exist for a valid cached extraction:

- `extracted.json`
- `metadata.json`
- `links.json`
- `clean.md`
- `raw.txt`

## Optional artifacts

- `raw.html`
  - present when an HTML body exists

## File responsibilities

### `metadata.json`

Purpose:

- stable message-level metadata for selection and labeling

Current required fields:

- `messageId`
- `threadId`
- `subject`
- `from`
- `to`
- `date`
- `snippet`
- `unsubscribe`
- `labelIds`

Rules:

- values should be plain JSON values, not HTML
- this file is the preferred source for display metadata during digest assembly

### `links.json`

Purpose:

- curated candidate public links derived from the message

Current shape:

- ordered array of link objects

Each item currently includes:

- `url`
- `text`
- `score`

Rules:

- ordered from best candidate to weaker candidates
- safe for downstream code to use without reading raw HTML
- should contain issue/browser/article links when they can be inferred

### `clean.md`

Purpose:

- primary model-facing cleaned body content

Rules:

- markdown/plain-text hybrid is acceptable
- newsletter chrome should be reduced as much as practical
- this is the normal source for summarization handoff
- downstream code should prefer this over `raw.html`, `raw.txt`, and duplicate body fields in `extracted.json`

### `raw.txt`

Purpose:

- inspectable fallback/raw body text

Rules:

- required for cache completeness
- primarily for debugging extraction quality
- not the default model-facing input during normal digest runs

### `raw.html`

Purpose:

- inspectable raw HTML body when available

Rules:

- optional
- debugging-only input
- should not be used during normal digest generation unless extraction quality is under investigation

### `extracted.json`

Purpose:

- canonical extraction record

Current top-level shape:

- `extractorVersion`
- `metadata`
- `content`
- `links`
- `diagnostics`

Current `content` shape:

- `sourceBody`
- `markdown`

Current `diagnostics` examples:

- `sizeEstimate`
- `markdownChars`
- `rawTextChars`
- `textChars`
- `htmlBytes`
- `textBytes`
- `linkCount`

Rules:

- `extractorVersion` is required for cache validity
- downstream code may inspect this file for a full extraction summary
- normal formatting flows should still prefer `metadata.json`, `links.json`, and `clean.md` directly

## Cache validity

An extraction cache is valid only if:

- all required files exist
- `extracted.json.extractorVersion` matches the current extractor version

If either condition fails:

- extraction must rebuild the artifact set

## Downstream usage rules

Normal digest flow should:

- read `metadata.json`
- read `links.json`
- read `clean.md`
- optionally read `extracted.json` for diagnostics or summary context

Normal digest flow should not:

- read `raw.html` directly
- read `raw.txt` directly
- paste raw Gmail message JSON into the model
- depend on undocumented fields from the raw Gmail payload

## Generalization guidance

For the future newsletter repo:

- this contract should become provider-neutral
- Gmail remains the first provider, but downstream code should not depend on Gmail-specific raw payload shapes
- additional providers should emit the same artifact set or a versioned superset of it
