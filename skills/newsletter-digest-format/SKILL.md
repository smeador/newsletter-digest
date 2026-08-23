---
name: newsletter-digest-format
description: "Format already-selected, cleaned newsletter material into contract-valid digest JSON."
user-invocable: false
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["newsletter-digest-openclaw-model"] },
      },
  }
---

# newsletter-digest-format

Use this skill to turn the already-selected newsletter source material into the final newsletter digest.

This skill does not own inbox discovery or email rendering. Do not do mailbox search, tool discovery, or hand-authored HTML generation here unless the caller explicitly says the source set is incomplete.

At the start of the run, load the workflow policy from:

- `/workspace/config/newsletter-digest.json`

Treat that config as the source of truth for:

- digest title
- section expectations for each selected source
- extra collection behavior
- any special-case formatting rules

## Core writing contract

Write a real digest, not a quick summary.

Hard rules:

- preserve the original content and intent while reducing length
- give detail according to the section-specific rules below
- present the substance as a direct briefing, not commentary about a source document
- avoid source-framing language such as `the article says`, `the piece argues`, `the post mentions`, `the newsletter notes`, or `the author explains`
- prefer direct constructions like `OpenAI released...`, `Congress is considering...`, or `the company reported...`
- return structured JSON only
- synthesize only within each newsletter section, not across the whole digest
- do not flatten the whole digest into one narrative
- do not return HTML
- do not return Markdown outside JSON string fields
- do not wrap the JSON in code fences
- do not include Markdown link syntax like `[text](url)` anywhere in text fields
- do not copy browser-link labels, CTA text, or newsletter chrome into content fields
- do not use filler or placeholder writing such as `this section covers`, `enough context to show`, `who benefits, who is exposed`, or other generic template prose
- if a source section is too messy to summarize cleanly, omit it or reduce it; do not pad with generic stand-in language
- before returning the JSON, inspect every `content` and `summary` field and rewrite any markdown remnants into plain prose
- never "fix up" a bad section by leaving source artifacts in place; replace them with a real summary or drop the section

## Output structure

Return one valid JSON object with this shape:

```json
{
  "title": "Newsletter Digest",
  "date": "April 10, 2026",
  "localDate": "2026-04-10",
  "inventory": {
    "foundPrimary": ["Primary source title"],
    "missingPrimary": [],
    "extraCounts": {
      "configured-extra-key": {
        "title": "Configured Extra Title",
        "count": 3,
        "itemName": "items"
      }
    }
  },
  "sections": [
    {
      "type": "primary",
      "key": "nyt",
      "title": "Primary source title",
      "issueDate": "April 10, 2026",
      "sender": "The New York Times",
      "issueLink": "https://...",
      "groups": [
        {
          "title": "Main article",
          "kind": "paragraphs",
          "content": "First paragraph.\\n\\nSecond paragraph."
        },
        {
          "title": "Configured subsection",
          "kind": "bullets",
          "content": ["Bullet one.", "Bullet two."]
        }
      ]
    }
  ]
}
```

Shape rules:

- `title`, `date`, and `localDate` must be strings
- `inventory.foundPrimary` and `inventory.missingPrimary` must be arrays of strings
- `inventory.extraCounts` should be an object keyed by the configured extra collection key
- each `inventory.extraCounts` entry should include `title`, `count`, and optional `itemName`
- `sections` must be an ordered array
- `primary` sections must use `groups`
- each group must include:
  - optional `title`
  - `kind`
  - `content`
- if `kind` is `paragraphs`, `content` must be one string with paragraphs separated by blank lines
- if `kind` is `bullets`, `content` must be an array of strings
- extra sections such as `substack_review` and `stanford` must use `items` when that is what the workflow config requires
- each `items` entry must stay plain text except for the link field
- all text values must be plain text, not HTML
- prose fields must read like a finished digest, not notes about what the section should do

### Header

Include only:

- title
- date
- short inventory of newsletters found

The inventory should be brief:

- which configured primary sources were found
- which configured primary sources were missing
- counts for configured extra collections in `inventory.extraCounts`
- use each extra collection's configured `key`, `inventoryLabel` or `title`, and `itemName`

Do not:

- add a separate lookback line
- repeat the title in multiple stacked forms
- add extra header blocks

## Config-driven section rules

Create one section per found configured primary source.

For each primary source section:

- use the source title from the workflow config
- include issue date
- include sender or publication
- include issue link near the section header
- follow the source's configured `formatRules`

When a source has configured groups:

- preserve the configured group titles when the source actually supports them
- preserve the configured `kind` for each group
- follow configured paragraph-count guidance and notes

When a source has configured special cases:

- apply the matching special-case override instead of forcing the default structure
- do not fabricate groups the source material does not support

For configured extra collections:

- create the section type required by the workflow config
- follow the collection's configured `itemRules`
- preserve any configured exclusions or cross-source rules supplied by the orchestrator

## Rendering boundary

The renderer command owns HTML and plaintext formatting:

- `newsletter-digest-render`

Your job here is to provide stable structured content so the renderer can generate deterministic HTML and plaintext from the same JSON.

## Content hygiene

Every prose-bearing field must already be publication-ready.

Never place any of the following inside `content` or `summary` fields:

- Markdown links such as `[View in browser](...)`
- raw source scaffolding like `View in browser`, `Read online`, `Presented by`, `Sponsor message`, or empty link tokens like `[](...)`
- instructions to yourself
- generic placeholder language
- commentary about what a section is supposed to accomplish

Good:

- `The Justice Department is examining whether the NFL's streaming deals are making games more expensive and harder to access for viewers.`

Bad:

- `This section covers a meaningful business development with enough financial and strategic context to show who benefits, who is exposed, and why it matters now.`

- `[View in browser](https://...)`

- `Meta released a new model. [Read online](https://...)`

Final reminder:

- every prose field should be something you would be comfortable emailing directly if the renderer printed it exactly as written

## Pre-send checklist

Before finalizing, verify every item below:

1. every found configured primary source has a visible issue link near its header
2. every section follows its configured `formatRules` or matching special-case override
3. every configured extra collection follows its configured `itemRules`
4. the JSON is valid and contains no prose outside the JSON object

If any item fails, revise the digest before handing it back for send.

## Constraints

- keep output readable and scannable, but do not optimize for brevity at the expense of understanding
- it is acceptable for the digest to be long if that is required to preserve useful synthesis
- do not reproduce the full email body
- quote only short phrases when necessary
- do not include secrets or credentials
