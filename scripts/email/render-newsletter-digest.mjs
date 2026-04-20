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

function renderSubstackHtml(section) {
  const items = assertArray(section.items, "section.items");
  const itemHtml =
    items.length === 0
      ? '        <ul style="margin:0 0 24px 22px;padding:0;font-size:15px;line-height:1.75;"><li style="margin:0;">No Substack items included today.</li></ul>'
      : [
          '            <ul style="margin:0 0 0 20px;padding:0;font-size:15px;line-height:1.75;">',
          ...items.map((item) => {
            const publication = assertString(item.publication, "substack.publication");
            const title = assertString(item.title, "substack.title");
            const link = optionalString(item.link);
            const summary = normalizeTextContent(item.summary, "substack.summary");
            return `              <li style="margin:0 0 12px 0"><strong>${escapeHtml(publication)}</strong> — ${renderLink(link, title)}: ${escapeHtml(summary)}</li>`;
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

function renderSubstackText(section) {
  const items = assertArray(section.items, "section.items");
  return [
    assertString(section.title, "section.title"),
    items.length === 0
      ? "No Substack items included today."
      : items
          .map((item) => {
            const publication = assertString(item.publication, "substack.publication");
            const title = assertString(item.title, "substack.title");
            const link = optionalString(item.link);
            const summary = normalizeTextContent(item.summary, "substack.summary");
            return `${publication} — ${title}${link ? ` (${link})` : ""}. ${summary}`;
          })
          .map((line) => `- ${line}`)
          .join("\n"),
  ].join("\n");
}

function renderStanfordHtml(section) {
  const items = assertArray(section.items, "section.items");
  const itemHtml =
    items.length === 0
      ? `        <ul style="margin:0 0 8px 22px;padding:0;font-size:15px;line-height:1.75;"><li style="margin:0;">${escapeHtml(optionalString(section.emptyText) || "No Stanford items included today.")}</li></ul>`
      : [
          '            <ul style="margin:0 0 8px 22px;padding:0;font-size:15px;line-height:1.75;">',
          ...items.map((item) => {
            const title = assertString(item.title, "stanford.title");
            const link = optionalString(item.link);
            const summary = normalizeTextContent(item.summary, "stanford.summary");
            return `              <li style="margin:0 0 12px;">${link ? renderLink(link, title) : escapeHtml(title)}. ${escapeHtml(summary)}</li>`;
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

function renderStanfordText(section) {
  const items = assertArray(section.items, "section.items");
  return [
    assertString(section.title, "section.title"),
    items.length === 0
      ? optionalString(section.emptyText) || "No Stanford items included today."
      : items
          .map((item) => {
            const title = assertString(item.title, "stanford.title");
            const link = optionalString(item.link);
            const summary = normalizeTextContent(item.summary, "stanford.summary");
            return `${title}${link ? ` (${link})` : ""}. ${summary}`;
          })
          .map((line) => `- ${line}`)
          .join("\n"),
  ].join("\n");
}

function renderSectionHtml(section) {
  const type = assertString(section.type, "section.type");
  if (type === "primary") return renderPrimarySectionHtml(section);
  if (type === "substack_review") return renderSubstackHtml(section);
  if (type === "stanford") return renderStanfordHtml(section);
  throw new Error(`Unsupported section type: ${type}`);
}

function renderSectionText(section) {
  const type = assertString(section.type, "section.type");
  if (type === "primary") return renderPrimarySectionText(section);
  if (type === "substack_review") return renderSubstackText(section);
  if (type === "stanford") return renderStanfordText(section);
  throw new Error(`Unsupported section type: ${type}`);
}

function renderInventoryText(inventory) {
  const foundPrimary = assertArray(inventory.foundPrimary, "inventory.foundPrimary");
  const missingPrimary = assertArray(inventory.missingPrimary, "inventory.missingPrimary");
  const substackCount = Number(inventory.substackCount ?? 0);
  const stanfordCount = Number(inventory.stanfordCount ?? 0);
  return `Found primary newsletters: ${foundPrimary.join(", ") || "none"}.\nMissing primary newsletters: ${missingPrimary.join(", ") || "none"}.\nIncluded extras: ${substackCount} Substack items, ${stanfordCount} Stanford items.`;
}

function renderInventoryHtml(inventory) {
  const foundPrimary = assertArray(inventory.foundPrimary, "inventory.foundPrimary");
  const missingPrimary = assertArray(inventory.missingPrimary, "inventory.missingPrimary");
  const substackCount = Number(inventory.substackCount ?? 0);
  const stanfordCount = Number(inventory.stanfordCount ?? 0);
  return `<strong>Found:</strong> ${escapeHtml(foundPrimary.join(", ") || "none")}. <strong>Missing:</strong> ${escapeHtml(missingPrimary.join(", ") || "none")}. <strong>Substack:</strong> ${substackCount} items. <strong>Stanford:</strong> ${stanfordCount} items.`;
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
      <div style="font-size:15px;color:#3e3e39;margin:0">${renderInventoryHtml(digest.inventory ?? {})}</div>

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
    renderInventoryText(digest.inventory ?? {}),
    "",
    sections.map(renderSectionText).join("\n\n"),
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const digest = readJson(options.input);
  const html = renderHtml(digest);
  const text = renderText(digest);
  writeText(options.htmlOut, html);
  writeText(options.textOut, text);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
