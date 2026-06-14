#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    input: "",
    htmlOut: "",
    textOut: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--input":
        options.input = next ?? "";
        i += 1;
        break;
      case "--html-out":
        options.htmlOut = next ?? "";
        i += 1;
        break;
      case "--text-out":
        options.textOut = next ?? "";
        i += 1;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input || !options.htmlOut || !options.textOut) {
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  render-newsletter-digest.mjs --input DIGEST_JSON --html-out EMAIL_HTML --text-out EMAIL_TXT
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeText(path, contents) {
  writeFileSync(resolve(path), contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Expected non-empty string for ${label}`);
  }
  return value;
}

function optionalString(value) {
  return typeof value === "string" ? value : "";
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array for ${label}`);
  }
  return value;
}

const INVALID_TEXT_PATTERNS = [
  { pattern: /\[[^\]]+\]\((https?:\/\/|mailto:)[^)]+\)/i, message: "contains Markdown link syntax" },
  { pattern: /\[\]\((https?:\/\/|mailto:)[^)]+\)/i, message: "contains empty Markdown link tokens" },
  { pattern: /\bview in browser\b/i, message: "contains browser-link scaffolding" },
  { pattern: /\bread online\b/i, message: "contains browser-link scaffolding" },
  { pattern: /\bsponsor message\b/i, message: "contains sponsor/newsletter chrome" },
  { pattern: /\bthis section covers\b/i, message: "contains placeholder writing" },
  { pattern: /\benough (financial|strategic) context to show\b/i, message: "contains placeholder writing" },
  { pattern: /\bwho benefits, who is exposed\b/i, message: "contains placeholder writing" },
];

function validateTextContent(value, label) {
  const text = assertString(value, label);
  for (const rule of INVALID_TEXT_PATTERNS) {
    if (rule.pattern.test(text)) {
      throw new Error(`Invalid ${label}: ${rule.message}`);
    }
  }
  return text;
}

function sanitizeTextContent(value) {
  return String(value)
    .replace(/\[\]\((https?:\/\/|mailto:)[^)]+\)/gi, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/|mailto:)[^)]+\)/gi, "$1")
    .replace(/^\s*(view in browser|read online|read in browser)\s*$/gim, "")
    .replace(/^(view in browser|read online|read in browser)\s*[:\-]?\s*/gim, "")
    .replace(/\s+\|\s+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTextContent(value, label) {
  return validateTextContent(sanitizeTextContent(value), label);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLink(url, text) {
  const safeText = escapeHtml(text);
  if (!url) return safeText;
  return `<a href="${escapeHtml(url)}" style="color:#2563eb;text-decoration:none;">${safeText}</a>`;
}

function splitParagraphs(text) {
  return String(text)
    .trim()
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderParagraphBlockHtml(text) {
  return splitParagraphs(text)
    .map(
      (paragraph) =>
        `        <p style="margin:0 0 14px 0;font-size:15px;font-weight:400;">${escapeHtml(paragraph)}</p>`,
    )
    .join("\n");
}

function renderParagraphBlockText(text) {
  return splitParagraphs(text).join("\n\n");
}

function renderGroupHtml(group) {
  const title = optionalString(group.title);
  const kind = assertString(group.kind, "group.kind");
  let body = "";

  if (kind === "paragraphs") {
    body = renderParagraphBlockHtml(normalizeTextContent(group.content, "group.content"));
  } else if (kind === "bullets") {
    const items = assertArray(group.content, "group.content");
    body = [
      '        <ul style="margin:0 0 24px 22px;padding:0;font-size:15px;line-height:1.75;">',
      ...items.map((item) => `          <li style="margin:0 0 10px;">${escapeHtml(normalizeTextContent(item, "bullet"))}</li>`),
      "        </ul>",
    ].join("\n");
  } else {
    throw new Error(`Unsupported group kind: ${kind}`);
  }

  return [
    title
      ? `        <div style="font-size:17px;line-height:1.25;letter-spacing:0.9px;text-transform:uppercase;color:#3e3e39;font-weight:700;margin:18px 0 10px 0">${escapeHtml(title)}</div>`
      : "",
    body,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderGroupText(group) {
  const title = optionalString(group.title);
  const kind = assertString(group.kind, "group.kind");

  if (kind === "paragraphs") {
    const body = renderParagraphBlockText(normalizeTextContent(group.content, "group.content"));
    return [title, body].filter(Boolean).join("\n");
  }

  if (kind === "bullets") {
    const items = assertArray(group.content, "group.content");
    return [
      title,
      ...items.map((item) => `- ${normalizeTextContent(item, "bullet")}`),
    ]
      .filter(Boolean)
      .join("\n");
  }

  throw new Error(`Unsupported group kind: ${kind}`);
}

function renderPrimarySectionHtml(section) {
  const groups = assertArray(section.groups, "section.groups");
  return [
    '          <div style="margin:28px 0 0 0;padding-top:24px;border-top:1px solid #ece9e2">',
    `            <div style="font-size:28px;line-height:1.2;font-weight:700;margin:0 0 6px 0">${escapeHtml(assertString(section.title, "section.title"))}</div>`,
    `            <div style="font-size:15px;color:#5d5d57;margin:0 0 10px 0">${escapeHtml(assertString(section.issueDate, "section.issueDate"))} · ${escapeHtml(assertString(section.sender, "section.sender"))} · ${renderLink(assertString(section.issueLink, "section.issueLink"), "Issue link")}</div>`,
    groups.map(renderGroupHtml).join("\n\n"),
    "          </div>",
  ].join("\n");
}

function renderPrimarySectionText(section) {
  const groups = assertArray(section.groups, "section.groups");
  return [
    assertString(section.title, "section.title"),
    `Issue date: ${assertString(section.issueDate, "section.issueDate")}`,
    `Sender: ${assertString(section.sender, "section.sender")}`,
    `Issue link: ${assertString(section.issueLink, "section.issueLink")}`,
    "",
    groups.map(renderGroupText).join("\n\n"),
  ].join("\n");
}

function renderItemSectionHtml(section) {
  const items = assertArray(section.items, "section.items");
  const itemHtml =
    items.length === 0
      ? `        <ul style="margin:0 0 24px 22px;padding:0;font-size:15px;line-height:1.75;"><li style="margin:0;">${escapeHtml(optionalString(section.emptyText) || `No ${assertString(section.title, "section.title")} items included today.`)}</li></ul>`
      : [
          '            <ul style="margin:0 0 0 20px;padding:0;font-size:15px;line-height:1.75;">',
          ...items.map((item) => {
            const publication = optionalString(item.publication);
            const title = assertString(item.title, "item.title");
            const link = optionalString(item.link);
            const summary = normalizeTextContent(item.summary, "item.summary");
            const label = publication ? `<strong>${escapeHtml(publication)}</strong> — ` : "";
            return `              <li style="margin:0 0 12px 0">${label}${renderLink(link, title)}: ${escapeHtml(summary)}</li>`;
          }),
          "            </ul>",
        ].join("\n");

  return [
    '          <div style="margin:28px 0 0 0;padding-top:24px;border-top:1px solid #ece9e2">',
    `            <div style="font-size:28px;line-height:1.2;font-weight:700;margin:0 0 10px 0">${escapeHtml(assertString(section.title, "section.title"))}</div>`,
    itemHtml,
    "          </div>",
  ].join("\n");
}

function renderItemSectionText(section) {
  const items = assertArray(section.items, "section.items");
  const title = assertString(section.title, "section.title");
  return [
    title,
    items.length === 0
      ? optionalString(section.emptyText) || `No ${title} items included today.`
      : items
          .map((item) => {
            const publication = optionalString(item.publication);
            const itemTitle = assertString(item.title, "item.title");
            const link = optionalString(item.link);
            const summary = normalizeTextContent(item.summary, "item.summary");
            const prefix = publication ? `${publication} — ` : "";
            return `${prefix}${itemTitle}${link ? ` (${link})` : ""}. ${summary}`;
          })
          .map((line) => `- ${line}`)
          .join("\n"),
  ].join("\n");
}

function renderSectionHtml(section) {
  const type = assertString(section.type, "section.type");
  if (type === "primary") return renderPrimarySectionHtml(section);
  if (Array.isArray(section.items)) return renderItemSectionHtml(section);
  throw new Error(`Unsupported section type: ${type}`);
}

function renderSectionText(section) {
  const type = assertString(section.type, "section.type");
  if (type === "primary") return renderPrimarySectionText(section);
  if (Array.isArray(section.items)) return renderItemSectionText(section);
  throw new Error(`Unsupported section type: ${type}`);
}

function humanizeKey(key) {
  return String(key)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeExtraCountEntries(inventory, sections) {
  const extraCounts = inventory && typeof inventory.extraCounts === "object" && !Array.isArray(inventory.extraCounts)
    ? inventory.extraCounts
    : {};
  const entries = [];

  for (const [key, value] of Object.entries(extraCounts)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      entries.push({
        key,
        title: optionalString(value.title) || humanizeKey(key),
        count: Number(value.count ?? 0),
        itemName: optionalString(value.itemName) || "items",
      });
    } else {
      entries.push({
        key,
        title: humanizeKey(key),
        count: Number(value ?? 0),
        itemName: "items",
      });
    }
  }

  if (entries.length === 0) {
    const itemSections = sections.filter((section) => section && section.type !== "primary" && Array.isArray(section.items));
    for (const section of itemSections) {
      entries.push({
        key: optionalString(section.key) || assertString(section.type, "section.type"),
        title: assertString(section.title, "section.title"),
        count: section.items.length,
        itemName: "items",
      });
    }
  }

  return entries;
}

function renderInventoryText(inventory, sections) {
  const foundPrimary = assertArray(inventory.foundPrimary, "inventory.foundPrimary");
  const missingPrimary = assertArray(inventory.missingPrimary, "inventory.missingPrimary");
  const extraEntries = normalizeExtraCountEntries(inventory, sections);
  const extras = extraEntries.length
    ? extraEntries.map((entry) => `${entry.count} ${entry.title} ${entry.itemName}`).join(", ")
    : "none";
  const foundSummary = renderPrimaryInventorySummary(foundPrimary, missingPrimary);
  return `Found primary newsletters: ${foundSummary}.\nMissing primary newsletters: ${missingPrimary.join(", ") || "none"}.\nIncluded extras: ${extras}.`;
}

function renderInventoryHtml(inventory, sections) {
  const foundPrimary = assertArray(inventory.foundPrimary, "inventory.foundPrimary");
  const missingPrimary = assertArray(inventory.missingPrimary, "inventory.missingPrimary");
  const extraEntries = normalizeExtraCountEntries(inventory, sections);
  const extras = extraEntries.length
    ? extraEntries.map((entry) => `<strong>${escapeHtml(entry.title)}:</strong> ${entry.count} ${escapeHtml(entry.itemName)}`).join(". ")
    : "<strong>Extras:</strong> none";
  const foundSummary = renderPrimaryInventorySummary(foundPrimary, missingPrimary);
  return `<strong>Found:</strong> ${escapeHtml(foundSummary)}. <strong>Missing:</strong> ${escapeHtml(missingPrimary.join(", ") || "none")}. ${extras}.`;
}

function renderPrimaryInventorySummary(foundPrimary, missingPrimary) {
  const foundCount = foundPrimary.length;
  const totalCount = foundCount + missingPrimary.length;
  const noun = totalCount === 1 ? "newsletter" : "newsletters";
  const foundNames = foundPrimary.length ? ` (${foundPrimary.join(", ")})` : "";
  return `${foundCount} of ${totalCount} primary ${noun}${foundNames}`;
}

function renderHtml(digest) {
  const sections = assertArray(digest.sections, "sections");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(assertString(digest.title, "title"))}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="max-width:980px;margin:0 auto;background:#ffffff;border:1px solid #ffffff;overflow:hidden">
    <div style="padding:28px 0 22px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e1e1b;line-height:1.6">
      <div style="font-family:'American Typewriter','American Typewriter Condensed','Courier New',serif;font-size:38px;line-height:1.05;font-weight:700;margin:0 0 8px 0">${escapeHtml(assertString(digest.title, "title"))}</div>
      <div style="font-size:15px;color:#5d5d57;margin:0 0 14px 0">${escapeHtml(assertString(digest.date, "date"))}</div>
      <div style="font-size:15px;color:#3e3e39;margin:0">${renderInventoryHtml(digest.inventory ?? {}, sections)}</div>

${sections.map(renderSectionHtml).join("\n")}
    </div>
  </div>
</body>
</html>`;
}

function renderText(digest) {
  const sections = assertArray(digest.sections, "sections");
  return [
    assertString(digest.title, "title"),
    assertString(digest.date, "date"),
    "",
    renderInventoryText(digest.inventory ?? {}, sections),
    "",
    sections.map(renderSectionText).join("\n\n"),
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const digest = readJson(options.input);
  const html = renderHtml(digest);
  const text = renderText(digest);
  writeText(options.htmlOut, html);
  writeText(options.textOut, text);
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === new URL(process.argv[1], "file:").href;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
