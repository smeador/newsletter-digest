# pip-newsletter-digest-format

Use this skill to turn the already-selected newsletter source material into the final Pip newsletter digest.

This skill does not own inbox discovery or email rendering. Do not do mailbox search, tool discovery, or hand-authored HTML generation here unless the caller explicitly says the source set is incomplete.

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
  "title": "Pip Newsletter Digest",
  "date": "April 10, 2026",
  "localDate": "2026-04-10",
  "inventory": {
    "foundPrimary": ["NY Times Morning", "Daily Upside", "AI News"],
    "missingPrimary": [],
    "substackCount": 3,
    "stanfordCount": 0
  },
  "sections": [
    {
      "type": "primary",
      "key": "nyt",
      "title": "NY Times Morning",
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
          "title": "Other major stories",
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
- `sections` must be an ordered array
- `primary` sections must use `groups`
- each group must include:
  - optional `title`
  - `kind`
  - `content`
- if `kind` is `paragraphs`, `content` must be one string with paragraphs separated by blank lines
- if `kind` is `bullets`, `content` must be an array of strings
- `substack_review` and `stanford` sections must use `items`
- each `items` entry must stay plain text except for the link field
- all text values must be plain text, not HTML
- prose fields must read like a finished digest, not notes about what the section should do

### Header

Include only:

- title
- date
- short inventory of newsletters found

The inventory should be brief:

- which primary newsletters were found
- which primary newsletters were missing
- count of Substack and Stanford items included

Do not:

- add a separate lookback line
- repeat the title in multiple stacked forms
- add extra header blocks

## Primary newsletters

Create one section per found primary newsletter.

Each primary newsletter section must include:

- newsletter title
- issue date
- sender or publication
- issue link near the section header
- body content using the exact section rules below

Each section must use clear internal subsection labels.

### NY Times

Required structure:

- one `groups` entry titled `Main article`
- one `groups` entry titled `Other major stories`

Hard rules:

- `Main article` must be `2-3` paragraphs
- do not collapse it into one paragraph
- explain the lead story clearly and with real detail
- `Other major stories` must be `kind: "bullets"`
- each bullet must describe what happened and why it matters
- do not use headline fragments as bullets

### Daily Upside

Required structure:

- one `groups` entry titled `Opener`
- one `groups` entry for each of the `3` main stories using the actual article titles as the group titles
- one `groups` entry titled `Extra Upside` when present

Sunday long-form exception:

- if the selected `Daily Upside` issue is the Sunday long-form edition and it is clearly built around one main feature rather than the usual opener-plus-multiple-story format, do not force the weekday structure
- in that case, create exactly one `groups` entry titled `Main article`
- `Main article` should be `2-4` paragraphs, depending on how much substance the feature contains
- do not fabricate an `Opener`, fake story titles, or an `Extra Upside` section when the source does not actually have them

Hard rules:

- do not use generic labels like `Story 1` if the article title is clear
- the opener must be its own labeled section
- the three main stories must each get one paragraph
- if more than three meaningful story blocks exist, keep the main three and place the remaining useful material in `Extra Upside`
- do not let the opener and the main stories run together as unlabeled paragraphs
- for the Sunday long-form edition, the exception above overrides the normal weekday structure

### AI News

Required structure:

- one `groups` entry titled `Main article`
- one `groups` entry titled `Twitter roundup`

Hard rules:

- `Main article` must be `2-3` paragraphs
- do not collapse it into one paragraph
- `Twitter roundup` must be `kind: "bullets"`
- each roundup bullet must be `1-2` descriptive sentences
- choose the most important items rather than trying to include everything

## Substack review

Include one bullet per included item.

Do not include `AI News` here.

Each bullet must contain:

- newsletter or publication name first
- title
- link in a separate `link` field when available
- `2-3` sentence summary in a plain-text `summary` field

## Stanford

Include one bullet per included item.

Each bullet must contain:

- title
- link in a separate `link` field when a useful public link exists
- `1-2` sentence summary in a plain-text `summary` field

## Rendering boundary

The renderer script owns HTML and plaintext formatting:

- `/workspace/scripts/render-newsletter-digest.sh`

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

1. every found primary newsletter has a visible issue link near its header
2. `NY Times` has a `Main article` group with at least `2` paragraphs
3. `NY Times` `Other major stories` bullets explain significance, not just headlines
4. `Daily Upside` has `Opener`, three titled story groups, and `Extra Upside` when present, unless it is the Sunday long-form edition, in which case it has one `Main article` group
5. `AI News` has a `Main article` group with at least `2` paragraphs
6. `AI News` roundup bullets are `1-2` descriptive sentences each
7. Substack items start with the publication name and use a separate `link` field when available
8. the JSON is valid and contains no prose outside the JSON object

If any item fails, revise the digest before handing it back for send.

## Constraints

- keep output readable and scannable, but do not optimize for brevity at the expense of understanding
- it is acceptable for the digest to be long if that is required to preserve useful synthesis
- do not reproduce the full email body
- quote only short phrases when necessary
- do not include secrets or credentials
