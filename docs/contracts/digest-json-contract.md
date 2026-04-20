# Digest JSON Contract

This contract defines the structured digest object that sits between synthesis and rendering.

`digest.json` is the source of truth for final digest content.

## Purpose

The formatter/model side owns producing a valid digest object.

The renderer owns deterministic HTML and plaintext generation from that object.

The send layer should not need to understand source newsletters directly once `digest.json` exists.

## File location

Normal staging path:

- `/workspace/memory/digests/YYYY-MM-DD/digest.json`

Final per-run archive path:

- `/workspace/memory/digests/YYYY-MM-DD/YYYY-MM-DDTHH-MM-SS/digest.json`

Cloud equivalents live under:

- `/opt/openclaw/state/memory/digests/...`

## Top-level shape

Current required top-level fields:

- `title`
- `date`
- `localDate`
- `inventory`
- `sections`

## Top-level field rules

### `title`

- string
- current expected value:
  - `Pip Newsletter Digest`

This may become more configurable later, but the contract is:

- human-readable digest title

### `date`

- string
- human-readable display date

### `localDate`

- string
- machine-friendly local date
- current format expectation:
  - `YYYY-MM-DD`

### `inventory`

Current expected fields:

- `foundPrimary`
- `missingPrimary`
- `substackCount`
- `stanfordCount`

Rules:

- `foundPrimary` and `missingPrimary` are arrays of strings
- count fields are numbers

### `sections`

- ordered array
- rendering order follows this array order exactly

## Section contract

Each section must include:

- `type`
- `title`

Additional fields depend on section type.

### Supported section types today

- `primary`
- `substack_review`
- `stanford`

### `primary` section

Current expected fields:

- `type`
- `key`
- `title`
- `issueDate`
- `sender`
- `issueLink`
- `groups`

#### `groups`

- ordered array

Each group includes:

- optional `title`
- `kind`
- `content`

Supported `kind` values today:

- `paragraphs`
- `bullets`

##### `paragraphs`

- `content` must be one string
- paragraph boundaries are represented by blank lines

##### `bullets`

- `content` must be an array of strings

### `substack_review` section

Current expected fields:

- `type`
- `title`
- `items`

Each item includes:

- `publication`
- `title`
- optional `link`
- `summary`

Current summary expectation:

- plain-text string

### `stanford` section

Current expected fields:

- `type`
- `title`
- `items`
- optional `emptyText`

Each item includes:

- `title`
- optional `link`
- `summary`

## Content rules

All prose-bearing fields must be publication-ready.

Allowed:

- plain text
- URLs only in explicit link fields

Disallowed:

- HTML
- Markdown links such as `[text](url)`
- browser CTA scaffolding such as `View in browser`
- sponsor chrome
- placeholder/filler writing

## Ownership boundary

Formatter/model side owns:

- section selection
- group selection
- prose content
- valid `digest.json`

Renderer side owns:

- typography
- HTML structure
- plaintext formatting
- validation/sanitization at render time

## Versioning guidance

For the future newsletter repo:

- this contract should become a versioned schema
- additive evolution is preferred over silent shape changes
- renderers/transports should declare which digest schema versions they support
