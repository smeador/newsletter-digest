# Workflow Config Contract

This contract defines the workflow-specific configuration that drives source selection and formatting policy for the newsletter digest skills.

The goal is to keep repo code and core skill mechanics stable while moving publication-specific behavior into a versionable config file.

## Default config path

Current default path:

- `/workspace/config/newsletter-digest.json`

In this repo, the committed reference file lives at:

- `config/newsletter-digest.example.json`

## Purpose

The workflow config owns:

- digest title and timezone
- delivery subject template
- source lists and search/query hints
- per-source selection rules
- preferred issue-link behavior
- per-source formatting rules
- extra collection definitions such as Substack review or Stanford items

The workflow config should not own:

- Gmail command syntax
- extractor implementation details
- renderer HTML structure
- transport implementation details

## Top-level shape

Current top-level fields:

- `title`
- `timezone`
- `lookbackHours`
- `delivery`
- `sourcePolicy`

`lookbackHours` defines a strict message-selection window in hours. The workflow may use broader Gmail query hints to fetch candidate metadata when Gmail search syntax is coarse, but selected primary sources and extra items must have message timestamps inside the configured lookback window.

## Delivery fields

Current expected fields:

- `subjectTemplate`
- `defaultRecipient`
- `defaultRecipientFromPreviousSummary`
- `transport`

`subjectTemplate` is a human-readable string template.

Current example:

- `Newsletter Digest - {{localDate}}`

`defaultRecipient` is optional. If present, the workflow can use it when the caller does not pass an explicit recipient. If `defaultRecipientFromPreviousSummary` is true and no `defaultRecipient` is present, the workflow may fall back to the newest prior digest summary recipient.

## Source policy

`sourcePolicy` currently includes:

- `primary`
- `extras`
- `generalSelectionRules`
- `linkCues`
- `disallowedLinks`

### `primary`

Each primary source entry currently includes:

- `key`
- `title`
- `senders`
- `queryHints`
- `linkPreference`
- `selectionRules`
- `formatRules`

### `extras`

Each extra collection entry currently includes:

- `key`
- `title`
- `sectionType`
- `inventoryLabel`
- `itemName`
- `lookbackHours`
- `maxSelectedItems`
- `maxCleanMarkdownChars`
- `queryHints`, `searchQueries`, or `gmailLabels`
- `linkPreference`
- `itemRules`

`extras` may also include collection-specific exclusion fields such as `excludeSourceKeys`.

When an extra collection has its own `lookbackHours`, that value overrides the top-level window for that collection only. It is still a strict cutoff, not a soft preference.

When an extra collection has `maxSelectedItems`, that value overrides the runner's global extra item cap for that collection only. Omit it to use the runner default.

When an extra collection has `maxCleanMarkdownChars`, that value overrides the runner's global cleaned-content excerpt cap for each selected item in that collection. Use it to keep broad extra collections bounded for the model formatting step.

When an extra collection has `excludeSourceKeys`, the runner excludes both the selected primary message ids for those sources and other candidates that match those primary sources' sender identities. This keeps sources such as AI News, which may also be delivered through Substack, in their configured primary section instead of duplicating them in broad extra collections.

Extra collections should use `queryHints` or `searchQueries` when the exact Gmail search syntax should be controlled by config. When sender addresses vary but Gmail labels are stable, use `gmailLabels`; the runner turns each label into a bounded Gmail query, then still enforces the strict configured cutoff in code.

## Formatting rules

The config is allowed to describe publication-specific section expectations.

Current examples:

- required group titles
- expected `kind` values such as `paragraphs` or `bullets`
- min/max paragraph counts
- special-case overrides for alternate issue formats

The config should describe policy, not renderer internals.

## Current renderer boundary

The current renderer still expects the digest JSON contract documented in:

- [digest-json-contract.md](digest-json-contract.md)

That means this config may influence:

- which sections are produced
- the titles and group structure inside those sections
- how many items/groups are expected
- how configured extra counts are labeled in inventory output

Configured item sections are renderer-supported when they follow the digest JSON item-section shape. New structural section families still require renderer support.

## Versioning guidance

As this repo evolves:

- the config should become explicitly versioned
- new config fields should be additive when possible
- skills should fail clearly if required config is missing or malformed
