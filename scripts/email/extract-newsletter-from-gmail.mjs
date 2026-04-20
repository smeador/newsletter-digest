#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import process from "node:process";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const EXTRACTOR_VERSION = "2026-04-10-1";

function parseArgs(argv) {
  const options = {
    account: "",
    input: "",
    messageId: "",
    output: "",
    artifactDir: "",
    maxLinks: 12,
    refresh: false,
    stdoutFull: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--account":
        options.account = next ?? "";
        i += 1;
        break;
      case "--input":
        options.input = next ?? "";
        i += 1;
        break;
      case "--message-id":
        options.messageId = next ?? "";
        i += 1;
        break;
      case "--output":
        options.output = next ?? "";
        i += 1;
        break;
      case "--artifact-dir":
        options.artifactDir = next ?? "";
        i += 1;
        break;
      case "--max-links":
        options.maxLinks = Number.parseInt(next ?? "12", 10);
        i += 1;
        break;
      case "--refresh":
        options.refresh = true;
        break;
      case "--stdout-full":
        options.stdoutFull = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input && !options.messageId) {
    throw new Error("Provide either --input PATH or --message-id MESSAGE_ID");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  extract-newsletter-from-gmail.mjs --message-id MESSAGE_ID [--account EMAIL] [--output PATH]
  extract-newsletter-from-gmail.mjs --input PATH [--output PATH]

Options:
  --account EMAIL     Gmail account for gog gmail get
  --message-id ID     Gmail message id to fetch via gog
  --input PATH        Existing Gmail message JSON file
  --output PATH       Write full extracted JSON to file
  --artifact-dir PATH Directory for inspectable artifacts and cached extraction
  --max-links N       Number of curated links to keep (default: 12)
  --refresh           Ignore cached extracted.json and rebuild artifacts
  --stdout-full       Print the full extracted JSON to stdout
`);
}

function runGogGet(account, messageId) {
  const args = ["gmail", "get", messageId, "--json", "--results-only", "--no-input"];
  if (account) {
    args.push("--account", account);
  }
  const raw = execFileSync("gog", args, { encoding: "utf8" });
  return JSON.parse(raw);
}

function readInputJson(inputPath) {
  return JSON.parse(readFileSync(resolve(inputPath), "utf8"));
}

function sanitizeSlug(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function defaultArtifactRoot() {
  const cwd = resolve(process.cwd());
  const workspaceMemory = resolve(cwd, "workspace", "memory");
  if (existsSync(workspaceMemory)) {
    return resolve(workspaceMemory, "newsletters");
  }

  const directMemory = resolve(cwd, "memory");
  if (existsSync(directMemory)) {
    return resolve(directMemory, "newsletters");
  }

  return resolve(cwd, "memory", "newsletters");
}

function artifactKey(options) {
  if (options.messageId) {
    return options.messageId;
  }

  const inputName = basename(options.input || "", extname(options.input || ""));
  return sanitizeSlug(inputName) || "newsletter-input";
}

function resolveArtifactDir(options) {
  if (options.artifactDir) {
    return resolve(options.artifactDir);
  }

  return resolve(defaultArtifactRoot(), artifactKey(options));
}

function normalizedMessageShape(input) {
  if (input?.message) {
    return {
      gmailMessage: input.message,
      topLevelBody: typeof input.body === "string" ? input.body : "",
      topLevelHeaders: input.headers ?? {},
      topLevelUnsubscribe: input.unsubscribe ?? "",
    };
  }

  return {
    gmailMessage: input,
    topLevelBody: "",
    topLevelHeaders: {},
    topLevelUnsubscribe: "",
  };
}

function headerMap(payload = {}, topLevelHeaders = {}) {
  const map = new Map((payload.headers ?? []).map((header) => [String(header.name || "").toLowerCase(), header.value || ""]));
  for (const [name, value] of Object.entries(topLevelHeaders)) {
    if (!map.has(String(name).toLowerCase())) {
      map.set(String(name).toLowerCase(), value ?? "");
    }
  }
  return map;
}

function decodeBase64Url(data) {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function stripTrackingParams(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith("utm_") ||
        key === "isFreemail" ||
        key === "token" ||
        key === "r" ||
        key === "j" ||
        key === "redirect"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    const next = parsed.toString();
    return next.endsWith("?") ? next.slice(0, -1) : next;
  } catch {
    return url;
  }
}

function normalizeSubstackUrl(url) {
  const trimmed = String(url ?? "").trim().replace(/&amp;/g, "&");

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname === "substack.com" && parsed.pathname.startsWith("/redirect/2/")) {
      const token = parsed.pathname.slice("/redirect/2/".length).split(".")[0];
      const decoded = decodeBase64Url(token);
      const payload = JSON.parse(decoded);
      if (typeof payload?.e === "string" && payload.e) {
        const target = new URL(payload.e);
        const next = target.searchParams.get("next");
        if (next) {
          return stripTrackingParams(next);
        }
        return stripTrackingParams(payload.e);
      }
    }

    if (parsed.hostname === "substack.com" && parsed.pathname.startsWith("/app-link/post")) {
      return "";
    }

    if (parsed.hostname === "open.substack.com") {
      return stripTrackingParams(trimmed);
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

function normalizeCandidateUrl(url) {
  const trimmed = String(url ?? "").trim().replace(/&amp;/g, "&");
  if (!trimmed) return "";

  if (trimmed.includes("substack.com")) {
    return normalizeSubstackUrl(trimmed);
  }

  return trimmed;
}

function flattenParts(part, output = []) {
  if (!part) return output;
  output.push(part);
  for (const child of part.parts ?? []) {
    flattenParts(child, output);
  }
  return output;
}

function pickBodyParts(message) {
  const payload = message.payload ?? {};
  const parts = flattenParts(payload, []);
  const htmlParts = parts.filter((part) => part.mimeType === "text/html" && part.body?.data);
  const textParts = parts.filter((part) => part.mimeType === "text/plain" && part.body?.data);

  htmlParts.sort((a, b) => (b.body?.size ?? 0) - (a.body?.size ?? 0));
  textParts.sort((a, b) => (b.body?.size ?? 0) - (a.body?.size ?? 0));

  return {
    html: htmlParts[0] ? decodeBase64Url(htmlParts[0].body.data) : "",
    text: textParts[0] ? decodeBase64Url(textParts[0].body.data) : "",
    htmlSize: htmlParts[0]?.body?.size ?? 0,
    textSize: textParts[0]?.body?.size ?? 0,
  };
}

function cleanWhitespace(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "")
    .replace(/[͏ ­]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripBracketedUrls(text) {
  return text.replace(/\s*\[\s*https?:\/\/[^\]]+\s*\]/gi, "");
}

function cleanNewsletterTextBody(text) {
  const junkLinePatterns = [
    /^view this (post|email) on the web\b/i,
    /^forwarded this email\?/i,
    /^subscribe here\b/i,
    /^as a reminder\b.*opt in\/out/i,
    /^you can opt in\/out\b/i,
    /^manage preferences\b/i,
    /^unsubscribe\b/i,
    /^download app\b/i,
    /^open in app\b/i,
    /^start writing\b/i,
    /^privacy policy\b/i,
    /^terms of use\b/i,
  ];

  const cleanedLines = cleanWhitespace(text)
    .split("\n")
    .map((line) => stripBracketedUrls(cleanWhitespace(line)))
    .filter((line) => line && !junkLinePatterns.some((pattern) => pattern.test(line)));

  return cleanWhitespace(cleanedLines.join("\n"));
}

function looksLikeHtml(text) {
  const sample = String(text ?? "").slice(0, 1000).trim();
  if (!sample) return false;
  return /^<!doctype html/i.test(sample) || /<\/?(html|body|table|div|p|a|span|td|tr|h1|h2)\b/i.test(sample);
}

function htmlToRawText(html) {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,canvas,iframe,object,meta,link").remove();
  $("br").replaceWith("\n");
  $("p,li,section,article,div,h1,h2,h3,h4,h5,h6,tr").each((_, element) => {
    $(element).append("\n");
  });
  $("td,th").each((_, element) => {
    $(element).append(" ");
  });
  return cleanWhitespace($.root().text());
}

function prepareMessageSource(message) {
  const normalized = normalizedMessageShape(message);
  const gmailMessage = normalized.gmailMessage ?? {};
  const payload = gmailMessage.payload ?? {};
  const headers = headerMap(payload, normalized.topLevelHeaders);
  const bodies = pickBodyParts(gmailMessage);
  const rawTopLevelBody = normalized.topLevelBody ?? "";
  const topLevelBodyIsHtml = looksLikeHtml(rawTopLevelBody);
  const gogBody = topLevelBodyIsHtml ? "" : cleanNewsletterTextBody(rawTopLevelBody);
  const html = topLevelBodyIsHtml ? rawTopLevelBody : bodies.html || "";
  const rawText = topLevelBodyIsHtml
    ? htmlToRawText(rawTopLevelBody)
    : html
      ? htmlToRawText(html)
      : cleanWhitespace(rawTopLevelBody || bodies.text || gmailMessage.snippet || "");
  const text = cleanNewsletterTextBody(gogBody || rawText || gmailMessage.snippet || "");
  const sourceBody = gogBody ? "gog-body" : html ? "html" : "text";

  return {
    normalized,
    gmailMessage,
    headers,
    bodies,
    sourceBody,
    html,
    rawText,
    text,
    rawTopLevelBody,
  };
}

function shouldRejectLink(url, text) {
  const combined = `${text} ${url}`.toLowerCase();
  const invalidPatterns = [
    "mailto:",
    "javascript:",
    "tel:",
    "cid:",
    "data:",
    "mail.google.com",
    "gmail.com",
    "unsubscribe",
    "manage-preferences",
    "manage preferences",
    "subscription",
    "settings",
    "privacy",
    "terms",
    "comment",
    "restack",
    "share",
    "like",
    "download app",
    "open in app",
    "app-link",
    "upgrade",
    "advertis",
    "sponsor",
    "presented by",
    "tracking",
    "pixel",
    "written by",
    "photo via",
    "newscom.com",
    "about",
    "author",
    "contact us",
    "change your email",
    "california notices",
    "sign up here",
    "subscribe to the times",
  ];

  return invalidPatterns.some((pattern) => combined.includes(pattern));
}

function normalizeLinkText(text, url) {
  const normalized = cleanWhitespace(text)
    .replace(/^[|,:\-)\]]+\s*/, "")
    .replace(/\s*[|,:\-(]+\s*$/, "")
    .trim();

  if (!normalized) {
    return url;
  }

  if (normalized.length <= 140) {
    return normalized;
  }

  const shortened = normalized.match(/[^.!?]*$/)?.[0]?.trim() || normalized.slice(0, 140).trim();
  return shortened.length <= 140 ? shortened : shortened.slice(0, 140).trim();
}

function scoreLink(url, text) {
  const normalizedText = text.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  let score = 0;
  const isOpenSubstackArticle =
    normalizedUrl.includes("open.substack.com/pub/") && normalizedUrl.includes("/p/");

  if (normalizedText.includes("view in browser")) score += 120;
  if (normalizedText.includes("read in browser")) score += 120;
  if (normalizedText.includes("read online")) score += 110;
  if (normalizedText.includes("view this post on the web")) score += 130;
  if (normalizedText.includes("issue link")) score += 100;
  if (normalizedText.includes("read in app") && isOpenSubstackArticle) score += 180;
  if (normalizedText.includes("open in app") && isOpenSubstackArticle) score += 180;
  if (normalizedText.includes("listen now")) score += 30;
  if (normalizedUrl.includes("open.substack.com/pub/")) score += 110;
  if (/https?:\/\/[^/]+\/p\//.test(normalizedUrl)) score += 80;
  if (normalizedUrl.includes("substack.com/redirect")) score -= 60;
  if (normalizedUrl.includes("substack.com")) score += 10;
  if (/^https?:\/\//.test(normalizedUrl)) score += 5;
  if (text.length >= 4 && text.length <= 120) score += 10;

  return score;
}

function extractCuratedLinks($, maxLinks) {
  const seen = new Set();
  const links = [];

  $("a[href]").each((_, element) => {
    const href = normalizeCandidateUrl($(element).attr("href") ?? "");
    const text = cleanWhitespace($(element).text());
    if (!href || shouldRejectLink(href, text)) {
      return;
    }
    const key = href;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const label = normalizeLinkText(text, href);
    links.push({
      url: href,
      text: label,
      score: scoreLink(href, label),
    });
  });

  links.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return links.slice(0, maxLinks);
}

function extractCuratedLinksFromText(text, maxLinks) {
  const seen = new Set();
  const links = [];
  const pattern = /([^\n\[]*?)\s*\[\s*(https?:\/\/[^\]\s]+)\s*\]/g;

  for (const match of text.matchAll(pattern)) {
    const rawText = cleanWhitespace(match[1] ?? "");
    const url = String(match[2] ?? "").trim();
    const textLabel = rawText.split(/[:.!?]\s*$/).join("").trim();
    if (!url || shouldRejectLink(url, textLabel)) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    const label = normalizeLinkText(textLabel || url, url);
    links.push({
      url,
      text: label,
      score: scoreLink(url, label),
    });
  }

  links.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const linePattern = /(view this post on the web at|view in browser|read in browser|read online)\s+\(?\s*(https?:\/\/[^\s)]+)\s*\)?/gi;
  for (const match of text.matchAll(linePattern)) {
    const label = cleanWhitespace(match[1] ?? "");
    const url = normalizeCandidateUrl(match[2] ?? "");
    if (!url || shouldRejectLink(url, label) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    links.push({
      url,
      text: normalizeLinkText(label, url),
      score: scoreLink(url, label),
    });
  }

  links.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return links.slice(0, maxLinks);
}

function mergeCuratedLinks(linkLists, maxLinks) {
  const best = new Map();
  for (const list of linkLists) {
    for (const link of list) {
      const existing = best.get(link.url);
      if (!existing || link.score > existing.score) {
        best.set(link.url, link);
      }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, maxLinks);
}

function stripJunkHtml(html) {
  const $ = cheerio.load(html);
  const curatedLinks = extractCuratedLinks($, Number.MAX_SAFE_INTEGER);

  const hardRemoveSelectors = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "form",
    "button",
    "input",
    "textarea",
    "select",
    "video",
    "audio",
    "iframe",
    "picture",
    "source",
    "object",
    "img",
    "meta",
    "link",
  ];
  $(hardRemoveSelectors.join(",")).remove();

  $("[class],[id],[role],[aria-label]").each((_, element) => {
    const attrs = [
      $(element).attr("class") ?? "",
      $(element).attr("id") ?? "",
      $(element).attr("role") ?? "",
      $(element).attr("aria-label") ?? "",
    ]
      .join(" ")
      .toLowerCase();

    if (/(footer|subscribe|unsubscribe|promo|advert|sponsor|social|comment|restack|share|tracking|pixel|banner|cta|reaction)/.test(attrs)) {
      $(element).remove();
    }
  });

  $("table, div, section, p, li, td").each((_, element) => {
    const text = cleanWhitespace($(element).text()).toLowerCase();
    if (!text) return;
    const isJunkText =
      text.length < 400 &&
      /(unsubscribe|manage preferences|open in app|download app|upgrade to paid|like\b|comment\b|restack\b|share\b|start writing|privacy policy|terms of use|view this email in your browser)/.test(text);
    if (isJunkText) {
      $(element).remove();
    }
  });

  $("br").replaceWith("\n");

  const contentRoot = $("body").length ? $("body") : $.root();
  const cleanedHtml = contentRoot.html() ?? $.html();

  return {
    cleanedHtml,
    curatedLinks,
  };
}

function htmlToMarkdown(html) {
  const turndown = new TurndownService({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
  });

  return cleanWhitespace(turndown.turndown(html));
}

function buildExtraction(prepared, options) {
  const { normalized, gmailMessage, headers, bodies, sourceBody, html, rawText, text, rawTopLevelBody } = prepared;

  let cleanedHtml = "";
  let markdown = text;
  let curatedLinks = [];
  let htmlCuratedLinks = [];

  if (sourceBody === "gog-body") {
    curatedLinks = extractCuratedLinksFromText(rawTopLevelBody || rawText, options.maxLinks);
  }

  if (html) {
    const cleaned = stripJunkHtml(html);
    cleanedHtml = cleaned.cleanedHtml;
    htmlCuratedLinks = cleaned.curatedLinks.slice(0, options.maxLinks);
    if (sourceBody !== "gog-body") {
      markdown = htmlToMarkdown(cleaned.cleanedHtml);
      curatedLinks = htmlCuratedLinks;
    } else {
      curatedLinks = mergeCuratedLinks([curatedLinks, htmlCuratedLinks], options.maxLinks);
    }
  }

  return {
    extractorVersion: EXTRACTOR_VERSION,
    metadata: {
      messageId: gmailMessage.id ?? "",
      threadId: gmailMessage.threadId ?? "",
      subject: headers.get("subject") ?? "",
      from: headers.get("from") ?? "",
      to: headers.get("to") ?? "",
      date: headers.get("date") ?? "",
      snippet: gmailMessage.snippet ?? "",
      unsubscribe: normalized.topLevelUnsubscribe,
      labelIds: gmailMessage.labelIds ?? [],
    },
    content: {
      sourceBody,
      markdown,
    },
    links: curatedLinks,
    diagnostics: {
      sizeEstimate: gmailMessage.sizeEstimate ?? 0,
      markdownChars: markdown.length,
      rawTextChars: rawText.length,
      textChars: text.length,
      htmlBytes: bodies.htmlSize,
      textBytes: bodies.textSize,
      linkCount: curatedLinks.length,
    },
  };
}

function writeOutput(outputPath, data) {
  writeFileSync(resolve(outputPath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeTextFile(outputPath, contents) {
  writeFileSync(resolve(outputPath), contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
}

function writeArtifacts(artifactDir, extracted, prepared) {
  mkdirSync(artifactDir, { recursive: true });
  writeOutput(resolve(artifactDir, "extracted.json"), extracted);
  writeOutput(resolve(artifactDir, "metadata.json"), extracted.metadata);
  writeOutput(resolve(artifactDir, "links.json"), extracted.links);
  writeTextFile(resolve(artifactDir, "clean.md"), extracted.content.markdown);

  if (prepared.html) {
    writeTextFile(resolve(artifactDir, "raw.html"), prepared.html);
  }

  if (prepared.rawText) {
    writeTextFile(resolve(artifactDir, "raw.txt"), prepared.rawText);
  }
}

function readCachedExtraction(artifactDir) {
  const extractedPath = resolve(artifactDir, "extracted.json");
  const requiredPaths = [
    extractedPath,
    resolve(artifactDir, "metadata.json"),
    resolve(artifactDir, "links.json"),
    resolve(artifactDir, "clean.md"),
    resolve(artifactDir, "raw.txt"),
  ];

  if (!requiredPaths.every((filePath) => existsSync(filePath))) {
    return null;
  }

  const extracted = JSON.parse(readFileSync(extractedPath, "utf8"));
  if (extracted?.extractorVersion !== EXTRACTOR_VERSION) {
    return null;
  }

  return extracted;
}

function printSummary(extracted, outputPath, artifactDir) {
  const summary = {
    metadata: extracted.metadata,
    diagnostics: extracted.diagnostics,
    links: extracted.links,
    output: outputPath || "",
    artifactDir: artifactDir || "",
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifactDir = resolveArtifactDir(options);
  const cached = options.refresh ? null : readCachedExtraction(artifactDir);
  const extracted =
    cached ??
    (() => {
      const message = options.input ? readInputJson(options.input) : runGogGet(options.account, options.messageId);
      const prepared = prepareMessageSource(message);
      const nextExtracted = buildExtraction(prepared, options);
      writeArtifacts(artifactDir, nextExtracted, prepared);
      return nextExtracted;
    })();

  if (options.output) {
    writeOutput(options.output, extracted);
  }

  if (options.stdoutFull) {
    process.stdout.write(`${JSON.stringify(extracted, null, 2)}\n`);
    return;
  }

  printSummary(extracted, options.output, artifactDir);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
