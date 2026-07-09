#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";

const VALID_MODES = new Set(["dry-run", "test-send", "send"]);
const DEFAULT_LIMITS = {
  maxCandidatesPerSource: 8,
  maxSelectedExtras: 3,
  maxCleanMarkdownChars: 9000,
  maxFormatterInputBytes: 180000,
};

export function parseArgs(argv) {
  const options = {
    mode: "dry-run",
    config: "",
    memoryRoot: "",
    account: process.env.GOG_ACCOUNT || "",
    recipient: "",
    modelBackend: process.env.NEWSLETTER_DIGEST_MODEL_BACKEND || "command",
    modelCommand: process.env.NEWSLETTER_DIGEST_MODEL_COMMAND || "newsletter-digest-openclaw-model",
    outputJson: "",
    refresh: false,
    allowFixtureSend: false,
    limits: { ...DEFAULT_LIMITS },
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--mode":
        options.mode = next ?? "";
        i += 1;
        break;
      case "--config":
        options.config = next ?? "";
        i += 1;
        break;
      case "--memory-root":
        options.memoryRoot = next ?? "";
        i += 1;
        break;
      case "--account":
        options.account = next ?? "";
        i += 1;
        break;
      case "--recipient":
      case "--to":
        options.recipient = next ?? "";
        i += 1;
        break;
      case "--model-backend":
        options.modelBackend = next ?? "";
        i += 1;
        break;
      case "--model-command":
        options.modelCommand = next ?? "";
        i += 1;
        break;
      case "--output-json":
        options.outputJson = next ?? "";
        i += 1;
        break;
      case "--max-candidates-per-source":
        options.limits.maxCandidatesPerSource = parsePositiveInt(next, arg);
        i += 1;
        break;
      case "--max-selected-extras":
        options.limits.maxSelectedExtras = parsePositiveInt(next, arg);
        i += 1;
        break;
      case "--max-clean-markdown-chars":
        options.limits.maxCleanMarkdownChars = parsePositiveInt(next, arg);
        i += 1;
        break;
      case "--max-formatter-input-bytes":
        options.limits.maxFormatterInputBytes = parsePositiveInt(next, arg);
        i += 1;
        break;
      case "--refresh":
        options.refresh = true;
        break;
      case "--allow-fixture-send":
        options.allowFixtureSend = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!VALID_MODES.has(options.mode)) {
    throw new Error(`Invalid --mode ${options.mode}. Expected one of: ${[...VALID_MODES].join(", ")}`);
  }

  return options;
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  newsletter-digest-run --mode dry-run
  newsletter-digest-run --mode test-send
  newsletter-digest-run --mode send

Options:
  --config PATH                    Workflow config path
  --memory-root PATH               Memory/artifact root (default: /workspace/memory when present)
  --account EMAIL                  Gmail workflow account (default: GOG_ACCOUNT)
  --recipient EMAIL                Override delivery recipient
  --model-backend command|fixture  Model backend (default: command)
  --model-command COMMAND          Bounded JSON model command (default: newsletter-digest-openclaw-model)
  --output-json PATH               Also write the run summary to PATH
  --refresh                        Refresh extraction artifacts
  --max-candidates-per-source N    Candidate cap before adjudication (default: 8)
  --max-selected-extras N          Extra item cap (default: 3)
  --max-clean-markdown-chars N     Per-source formatter body cap (default: 9000)
  --max-formatter-input-bytes N    Formatter input byte cap (default: 180000)

Model command contract:
  The command receives NEWSLETTER_DIGEST_MODEL_TASK, NEWSLETTER_DIGEST_MODEL_INPUT,
  and NEWSLETTER_DIGEST_MODEL_OUTPUT environment variables. It must write valid JSON
  to NEWSLETTER_DIGEST_MODEL_OUTPUT.
`);
}

export function resolveDefaultConfig() {
  const candidates = [
    "/workspace/config/newsletter-digest.json",
    "workspace/config/newsletter-digest.json",
    "config/newsletter-digest.json",
    "config/newsletter-digest.example.json",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export function resolveDefaultMemoryRoot() {
  const candidates = ["/workspace/memory", "workspace/memory", "memory"];
  return candidates.find((candidate) => existsSync(candidate)) || "memory";
}

function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} did not contain valid JSON: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function displayDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function timestampForPath(date, timeZone) {
  const datePart = localDateParts(date, timeZone);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll(":", "-");
  return `${datePart}T${timePart}`;
}

export function parseMessageDate(value) {
  if (typeof value === "number") {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEmail(text) {
  return String(text ?? "").toLowerCase();
}

function messageIdOf(candidate) {
  return String(candidate.id || candidate.messageId || candidate.message_id || "").trim();
}

function normalizeCandidate(raw, sourceKey, query) {
  const dateValue = raw.date || raw.internalDate || raw.timestamp || raw.receivedAt;
  const parsedDate = parseMessageDate(dateValue);
  return {
    messageId: messageIdOf(raw),
    sourceKey,
    query,
    from: String(raw.from || raw.sender || raw.headers?.from || ""),
    subject: String(raw.subject || raw.headers?.subject || ""),
    date: parsedDate ? parsedDate.toISOString() : String(dateValue || ""),
    snippet: String(raw.snippet || raw.summary || ""),
    rawDate: dateValue ?? "",
  };
}

export function scoreCandidate(candidate, source, now = new Date()) {
  const date = parseMessageDate(candidate.date);
  let score = 0;
  const matchedRules = [];
  const from = normalizeEmail(candidate.from);
  const subject = normalizeEmail(candidate.subject);
  const title = normalizeEmail(source.title || source.key);

  for (const sender of source.senders ?? []) {
    if (from.includes(normalizeEmail(sender))) {
      score += 50;
      matchedRules.push("sender");
      break;
    }
  }

  if (title && subject.includes(title)) {
    score += 20;
    matchedRules.push("title");
  } else {
    const titleTokens = title.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
    const hits = titleTokens.filter((token) => subject.includes(token)).length;
    if (hits > 0) {
      score += Math.min(15, hits * 5);
      matchedRules.push("subject-token");
    }
  }

  if (date) {
    const ageHours = Math.max(0, (now.getTime() - date.getTime()) / 3_600_000);
    score += Math.max(0, 15 - Math.min(15, ageHours / 4));
    matchedRules.push("recency");
  }

  if (candidate.messageId) {
    score += 5;
    matchedRules.push("message-id");
  }

  return {
    ...candidate,
    score: Number(score.toFixed(2)),
    matchedRules,
  };
}

export function filterCandidatesByLookback(candidates, cutoff) {
  return candidates.filter((candidate) => {
    const date = parseMessageDate(candidate.date);
    return date && date.getTime() >= cutoff.getTime();
  });
}

export function selectDeterministicCandidate(scoredCandidates) {
  const sorted = [...scoredCandidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.date).localeCompare(String(a.date));
  });
  const top = sorted[0] || null;
  const second = sorted[1] || null;
  const ambiguous = Boolean(top && second && top.score - second.score < 10);
  return { top, sorted, ambiguous };
}

function quoteGmailSearchValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /[\s()[\]{}"]/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
}

export function buildExtraQueries(extra, lookbackHours) {
  const explicitQueries = extra.queryHints ?? extra.searchQueries ?? [];
  if (Array.isArray(explicitQueries) && explicitQueries.length > 0) {
    return explicitQueries.filter(Boolean);
  }

  const labels = extra.gmailLabels ?? extra.labels ?? [];
  if (!Array.isArray(labels) || labels.length === 0) {
    return [];
  }

  const queryDays = Math.max(1, Math.ceil(Number(lookbackHours || 36) / 24) + 1);
  return labels
    .map((label) => quoteGmailSearchValue(label))
    .filter(Boolean)
    .map((label) => `label:${label} newer_than:${queryDays}d -label:sent`);
}

export function maxSelectedForExtra(extra, limits) {
  const configured = extra.maxSelectedItems ?? extra.maxItems ?? extra.maxSelected;
  if (configured === undefined) {
    return limits.maxSelectedExtras;
  }
  return parsePositiveInt(String(configured), `${extra.key || "extra"}.maxSelectedItems`);
}

export function candidateMatchesSourceIdentity(candidate, source) {
  const from = normalizeEmail(candidate.from);
  const subject = normalizeEmail(candidate.subject);
  for (const sender of source.senders ?? []) {
    const normalizedSender = normalizeEmail(sender);
    if (normalizedSender && from.includes(normalizedSender)) {
      return true;
    }
  }

  const title = normalizeEmail(source.title || "");
  return Boolean(title && subject.includes(title));
}

export function selectExtraCandidatesFromCandidates(
  candidates,
  extra,
  cutoff,
  limits,
  excludedMessageIds = new Set(),
  excludedSources = [],
) {
  const unique = uniqueByMessageId(candidates).filter(
    (candidate) =>
      !excludedMessageIds.has(candidate.messageId) &&
      !excludedSources.some((source) => candidateMatchesSourceIdentity(candidate, source)),
  );
  const inWindow = filterCandidatesByLookback(unique, cutoff);
  const sorted = [...inWindow].sort((a, b) => {
    const aDate = parseMessageDate(a.date)?.getTime() ?? 0;
    const bDate = parseMessageDate(b.date)?.getTime() ?? 0;
    if (bDate !== aDate) return bDate - aDate;
    return String(a.subject).localeCompare(String(b.subject));
  });
  const maxSelected = maxSelectedForExtra(extra, limits);
  const candidateCap = Math.max(maxSelected * 3, limits.maxCandidatesPerSource);
  return {
    extra,
    cutoff: cutoff.toISOString(),
    candidates: sorted.slice(0, candidateCap),
    maxSelected,
    selected: sorted.slice(0, maxSelected),
  };
}

function runGogSearch(query, account, maxResults) {
  const args = ["gmail", "search", query, "--account", account, "--json", "--results-only", "--no-input"];
  if (maxResults) {
    args.push("--max", String(maxResults));
  }
  const raw = execFileSync("gog", args, { encoding: "utf8" });
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.messages ?? parsed.results ?? [];
}

async function collectPrimaryCandidates(config, options, runMeta) {
  if (!options.account) {
    throw new Error("GOG_ACCOUNT is required, or pass --account EMAIL.");
  }

  const now = runMeta.now;
  const workflowLookback = Number(config.lookbackHours ?? 36);
  const primaryResults = [];

  for (const source of config.sourcePolicy?.primary ?? []) {
    const cutoff = new Date(now.getTime() - workflowLookback * 3_600_000);
    const rawCandidates = [];
    for (const query of source.queryHints ?? []) {
      const results = runGogSearch(query, options.account, options.limits.maxCandidatesPerSource * 2);
      rawCandidates.push(...results.map((candidate) => normalizeCandidate(candidate, source.key, query)));
    }
    const unique = uniqueByMessageId(rawCandidates);
    const inWindow = filterCandidatesByLookback(unique, cutoff);
    const scored = inWindow.map((candidate) => scoreCandidate(candidate, source, now));
    const { top, sorted, ambiguous } = selectDeterministicCandidate(scored);
    primaryResults.push({
      source,
      cutoff: cutoff.toISOString(),
      candidates: sorted.slice(0, options.limits.maxCandidatesPerSource),
      selected: top,
      ambiguous,
    });
  }

  return primaryResults;
}

function collectExtraCandidates(config, options, runMeta, selectedPrimaryCandidates) {
  const now = runMeta.now;
  const workflowLookback = Number(config.lookbackHours ?? 36);
  const primarySourcesByKey = new Map(
    (config.sourcePolicy?.primary ?? []).map((source) => [source.key, source]),
  );
  const selectedPrimaryByKey = new Map(
    selectedPrimaryCandidates.map(({ source, candidate }) => [source.key, candidate]),
  );
  const extraResults = [];

  for (const extra of config.sourcePolicy?.extras ?? []) {
    const lookbackHours = Number(extra.lookbackHours ?? workflowLookback);
    const cutoff = new Date(now.getTime() - lookbackHours * 3_600_000);
    const queries = buildExtraQueries(extra, lookbackHours);
    const rawCandidates = [];
    for (const query of queries) {
      const maxResults = Math.max(
        maxSelectedForExtra(extra, options.limits) * 6,
        options.limits.maxCandidatesPerSource * 2,
      );
      const results = runGogSearch(query, options.account, maxResults);
      rawCandidates.push(...results.map((candidate) => normalizeCandidate(candidate, extra.key, query)));
    }

    const excludedMessageIds = new Set(
      selectedPrimaryCandidates.map(({ candidate }) => candidate.messageId).filter(Boolean),
    );
    for (const sourceKey of extra.excludeSourceKeys ?? []) {
      const selected = selectedPrimaryByKey.get(sourceKey);
      if (selected?.messageId) excludedMessageIds.add(selected.messageId);
    }
    const excludedSources = (extra.excludeSourceKeys ?? [])
      .map((sourceKey) => primarySourcesByKey.get(sourceKey))
      .filter(Boolean);

    extraResults.push({
      ...selectExtraCandidatesFromCandidates(
        rawCandidates,
        extra,
        cutoff,
        options.limits,
        excludedMessageIds,
        excludedSources,
      ),
      queries,
      lookbackHours,
    });
  }

  return extraResults;
}

function uniqueByMessageId(candidates) {
  const seen = new Set();
  const output = [];
  for (const candidate of candidates) {
    const id = candidate.messageId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(candidate);
  }
  return output;
}

function artifactDirFor(memoryRoot, messageId) {
  return resolve(memoryRoot, "newsletters", messageId);
}

function shouldRefreshExtractedArtifact(artifactDir) {
  const extractedJson = resolve(artifactDir, "extracted.json");
  const cleanPath = resolve(artifactDir, "clean.md");
  if (!existsSync(extractedJson) || !existsSync(cleanPath)) {
    return true;
  }

  const cleanMarkdown = readFileSync(cleanPath, "utf8").trim();
  if (cleanMarkdown) {
    return false;
  }

  try {
    const extracted = readJson(extractedJson, extractedJson);
    return Number(extracted?.diagnostics?.rawTextChars ?? 0) > 0;
  } catch {
    return true;
  }
}

function ensureExtracted(candidate, options) {
  const artifactDir = artifactDirFor(options.memoryRoot, candidate.messageId);
  const extractedJson = resolve(artifactDir, "extracted.json");
  const needsRefresh = options.refresh || shouldRefreshExtractedArtifact(artifactDir);
  if (needsRefresh) {
    const args = [
      "--account",
      options.account,
      "--message-id",
      candidate.messageId,
      "--artifact-dir",
      artifactDir,
      "--output",
      extractedJson,
    ];
    if (options.refresh) {
      args.push("--refresh");
    }
    execFileSync("newsletter-digest-extract", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  return artifactDir;
}

function readSourceArtifact(artifactDir, source, candidate, limits) {
  const metadata = readJson(resolve(artifactDir, "metadata.json"), `${artifactDir}/metadata.json`);
  const links = readJson(resolve(artifactDir, "links.json"), `${artifactDir}/links.json`);
  const cleanMarkdown = readFileSync(resolve(artifactDir, "clean.md"), "utf8");
  const maxCleanMarkdownChars = maxCleanMarkdownCharsForSource(source, limits);
  return {
    key: source.key,
    type: "primary",
    title: source.title,
    sourceConfig: source,
    candidate,
    artifactDir,
    metadata,
    links: Array.isArray(links) ? links.slice(0, 12) : [],
    content: trimText(cleanMarkdown, maxCleanMarkdownChars),
    maxCleanMarkdownChars,
    originalContentChars: cleanMarkdown.length,
  };
}

function readExtraArtifact(artifactDir, extra, candidate, limits) {
  const metadata = readJson(resolve(artifactDir, "metadata.json"), `${artifactDir}/metadata.json`);
  const links = readJson(resolve(artifactDir, "links.json"), `${artifactDir}/links.json`);
  const cleanMarkdown = readFileSync(resolve(artifactDir, "clean.md"), "utf8");
  const maxCleanMarkdownChars = maxCleanMarkdownCharsForSource(extra, limits);
  return {
    key: extra.key,
    collectionKey: extra.key,
    type: "extra",
    sectionType: extra.sectionType || extra.key,
    title: extra.title,
    inventoryLabel: extra.inventoryLabel || extra.title,
    itemName: extra.itemName || "items",
    sourceConfig: extra,
    candidate,
    artifactDir,
    metadata,
    links: Array.isArray(links) ? links.slice(0, 12) : [],
    content: trimText(cleanMarkdown, maxCleanMarkdownChars),
    maxCleanMarkdownChars,
    originalContentChars: cleanMarkdown.length,
  };
}

export function maxCleanMarkdownCharsForSource(source, limits) {
  const configured = source?.maxCleanMarkdownChars ?? source?.maxContentChars;
  if (configured === undefined) return limits.maxCleanMarkdownChars;
  const parsed = Number.parseInt(String(configured), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${source?.key || source?.title || "source"} maxCleanMarkdownChars must be a positive integer`);
  }
  return parsed;
}

function trimText(text, maxChars) {
  const normalized = String(text ?? "").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}\n\n[trimmed at ${maxChars} chars]`;
}

export function buildFormatterInput({ config, selectedSources, runMeta }) {
  const foundPrimary = selectedSources.filter((source) => source.type === "primary").map((source) => source.title);
  const configuredPrimary = config.sourcePolicy?.primary ?? [];
  const configuredExtras = config.sourcePolicy?.extras ?? [];
  const selectedExtras = selectedSources.filter((source) => source.type === "extra");
  const foundPrimaryKeys = new Set(
    selectedSources.filter((source) => source.type === "primary").map((source) => source.key),
  );
  const missingPrimary = configuredPrimary
    .filter((source) => !foundPrimaryKeys.has(source.key))
    .map((source) => source.title || source.key);
  const extraCounts = Object.fromEntries(
    configuredExtras.map((extra) => {
      const count = selectedExtras.filter((source) => source.collectionKey === extra.key).length;
      return [
        extra.key,
        {
          title: extra.inventoryLabel || extra.title || extra.key,
          count,
          itemName: extra.itemName || "items",
        },
      ];
    }),
  );

  return {
    title: config.title || "Newsletter Digest",
    date: displayDate(runMeta.now, config.timezone || "UTC"),
    localDate: runMeta.localDate,
    timezone: config.timezone || "UTC",
    inventory: {
      foundPrimary,
      missingPrimary,
      extraCounts,
    },
    selectedSources,
    formatPolicy: {
      primary: configuredPrimary.map((source) => ({
        key: source.key,
        title: source.title,
        formatRules: source.formatRules ?? {},
      })),
      extras: config.sourcePolicy?.extras ?? [],
      linkCues: config.sourcePolicy?.linkCues ?? [],
      disallowedLinks: config.sourcePolicy?.disallowedLinks ?? [],
    },
  };
}

function assertFormatterInputSize(formatterInput, limits) {
  const bytes = Buffer.byteLength(JSON.stringify(formatterInput), "utf8");
  if (bytes > limits.maxFormatterInputBytes) {
    throw new Error(
      `Formatter input is ${bytes} bytes, above limit ${limits.maxFormatterInputBytes}. Reduce source payload limits.`,
    );
  }
  return bytes;
}

function modelTempPath(runDir, name) {
  return resolve(runDir, name);
}

function runModelCommand(task, input, options, runDir, names = {}) {
  const inputPath = modelTempPath(runDir, names.inputName || `${task}-input.json`);
  const outputPath = modelTempPath(runDir, names.outputName || `${task}-output.json`);
  writeJson(inputPath, input);

  const result = spawnSync(options.modelCommand, {
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      NEWSLETTER_DIGEST_MODEL_TASK: task,
      NEWSLETTER_DIGEST_MODEL_INPUT: inputPath,
      NEWSLETTER_DIGEST_MODEL_OUTPUT: outputPath,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      `Model command failed for ${task} with exit code ${result.status ?? "unknown"}: ${result.stderr || result.stdout}`,
    );
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Model command did not write ${outputPath}`);
  }

  return { outputPath };
}

function writeModelParseError(runDir, task, outputPath, error, extra = {}) {
  const errorPath = modelTempPath(runDir, `${task}-parse-error.json`);
  writeJson(errorPath, {
    task,
    outputPath,
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  });
  return errorPath;
}

function repairFormatterJsonOutput(task, input, options, runDir, outputPath, parseError) {
  const malformedOutput = readFileSync(outputPath, "utf8");
  const malformedPath = modelTempPath(runDir, `${task}-malformed-output.json`);
  writeFileSync(malformedPath, malformedOutput, "utf8");

  const repairInput = {
    task: "repair malformed digest JSON",
    sourceTask: task,
    parseError: parseError instanceof Error ? parseError.message : String(parseError),
    malformedOutput,
    repairRules: [
      "Return exactly one valid JSON object.",
      "Preserve the digest content, wording, keys, ordering, and URLs from malformedOutput.",
      "Only repair JSON syntax problems such as unescaped quotes or control characters.",
      "Do not summarize, add, remove, or re-rank stories.",
    ],
    expectedDigest: {
      title: input.title,
      date: input.date,
      localDate: input.localDate,
      inventory: input.inventory,
    },
  };

  const { outputPath: repairOutputPath } = runModelCommand(
    "repair-digest-json",
    repairInput,
    options,
    runDir,
    {
      inputName: `${task}-repair-input.json`,
      outputName: `${task}-repair-output.json`,
    },
  );
  const parsed = readJson(repairOutputPath, repairOutputPath);
  writeJson(outputPath, parsed);
  writeJson(modelTempPath(runDir, `${task}-repair-summary.json`), {
    task,
    malformedPath,
    originalOutputPath: outputPath,
    repairOutputPath,
    parseError: repairInput.parseError,
    status: "repaired",
  });
  return parsed;
}

export function callModelBackend(task, input, options, runDir) {
  if (options.modelBackend === "fixture") {
    return fixtureModel(task, input);
  }

  if (options.modelBackend !== "command") {
    throw new Error(`Unsupported model backend: ${options.modelBackend}`);
  }

  if (!options.modelCommand) {
    throw new Error(
      "NEWSLETTER_DIGEST_MODEL_COMMAND or --model-command is required for bounded OpenClaw model calls.",
    );
  }

  const { outputPath } = runModelCommand(task, input, options, runDir);
  try {
    return readJson(outputPath, outputPath);
  } catch (error) {
    if (task === "format-digest" && existsSync(outputPath)) {
      writeModelParseError(runDir, task, outputPath, error, { repairAttempted: true });
      return repairFormatterJsonOutput(task, input, options, runDir, outputPath, error);
    }
    writeModelParseError(runDir, task, outputPath, error, { repairAttempted: false });
    throw error;
  }
}

function fixtureModel(task, input) {
  if (task === "select-candidates") {
    return {
      selectedMessageIds: input.candidates?.[0]?.messageId ? [input.candidates[0].messageId] : [],
      missingSourceKeys: input.candidates?.[0]?.messageId ? [] : [input.sourceKey],
      reason: "fixture backend selected the top candidate",
    };
  }

  if (task === "select-extra-candidates") {
    return {
      selectedMessageIds: (input.candidates ?? [])
        .slice(0, input.maxSelected ?? 0)
        .map((candidate) => candidate.messageId)
        .filter(Boolean),
      reason: "fixture backend selected the newest extra candidates",
    };
  }

  if (task === "format-digest") {
    return {
      title: input.title,
      date: input.date,
      localDate: input.localDate,
      inventory: input.inventory,
      sections: input.selectedSources.map((source) => {
        if (source.type === "extra") {
          return {
            type: source.sectionType || source.key,
            key: source.key,
            title: source.title,
            items: [
              {
                title: source.candidate?.subject || source.title,
                publication: source.metadata?.from || source.candidate?.from || "",
                link: source.links?.[0]?.url || "",
                summary: trimText(source.content, 600),
              },
            ],
          };
        }

        return {
          type: source.type,
          key: source.key,
          title: source.title,
          issueDate: source.metadata?.date || source.candidate?.date || input.date,
          sender: source.metadata?.from || source.candidate?.from || "",
          issueLink: source.links?.[0]?.url || "",
          groups: [
            {
              title: "Summary",
              kind: "paragraphs",
              content: trimText(source.content, 600),
            },
          ],
        };
      }),
    };
  }

  throw new Error(`Unsupported fixture model task: ${task}`);
}

async function maybeAdjudicateSelection(primaryResult, options, runDir) {
  if (!primaryResult.ambiguous || primaryResult.candidates.length < 2) {
    return primaryResult.selected;
  }

  if (!options.modelCommand && options.modelBackend === "command") {
    return primaryResult.selected;
  }

  const input = {
    task: "select one newsletter issue candidate for the configured source",
    sourceKey: primaryResult.source.key,
    sourceTitle: primaryResult.source.title,
    cutoff: primaryResult.cutoff,
    selectionRules: primaryResult.source.selectionRules ?? [],
    candidates: primaryResult.candidates.map((candidate) => ({
      messageId: candidate.messageId,
      from: candidate.from,
      subject: candidate.subject,
      date: candidate.date,
      snippet: candidate.snippet,
      score: candidate.score,
      matchedRules: candidate.matchedRules,
    })),
  };

  const output = callModelBackend("select-candidates", input, options, runDir);
  const selectedId = output.selectedMessageIds?.[0];
  return primaryResult.candidates.find((candidate) => candidate.messageId === selectedId) || primaryResult.selected;
}

function maybeAdjudicateExtraSelection(extraResult, options, runDir) {
  if (extraResult.candidates.length === 0) {
    return [];
  }

  if (!options.modelCommand && options.modelBackend === "command") {
    return extraResult.selected;
  }

  const input = {
    task: "select extra newsletter items for a configured digest collection",
    collectionKey: extraResult.extra.key,
    collectionTitle: extraResult.extra.title,
    sectionType: extraResult.extra.sectionType,
    cutoff: extraResult.cutoff,
    maxSelected: extraResult.maxSelected,
    itemRules: extraResult.extra.itemRules ?? [],
    linkPreference: extraResult.extra.linkPreference ?? "",
    candidates: extraResult.candidates.map((candidate) => ({
      messageId: candidate.messageId,
      from: candidate.from,
      subject: candidate.subject,
      date: candidate.date,
      snippet: candidate.snippet,
      query: candidate.query,
    })),
  };

  const output = callModelBackend("select-extra-candidates", input, options, runDir);
  if (!Array.isArray(output.selectedMessageIds)) {
    return extraResult.selected;
  }

  const byId = new Map(extraResult.candidates.map((candidate) => [candidate.messageId, candidate]));
  return output.selectedMessageIds
    .map((messageId) => byId.get(messageId))
    .filter(Boolean)
    .slice(0, extraResult.maxSelected);
}

function resolveRecipient(config, options) {
  if (options.recipient) return options.recipient;
  if (config.delivery?.defaultRecipient && config.delivery.defaultRecipient !== "recipient@example.com") {
    return config.delivery.defaultRecipient;
  }
  if (!config.delivery?.defaultRecipientFromPreviousSummary) {
    return "";
  }
  const digestRoot = resolve(options.memoryRoot, "digests");
  if (!existsSync(digestRoot)) return "";
  const summaries = [];
  for (const day of readdirSync(digestRoot)) {
    const dayPath = resolve(digestRoot, day);
    if (!statSync(dayPath).isDirectory()) continue;
    for (const run of readdirSync(dayPath)) {
      const summaryPath = resolve(dayPath, run, "summary.json");
      if (existsSync(summaryPath)) {
        summaries.push(summaryPath);
      }
    }
    const daySummary = resolve(dayPath, "summary.json");
    if (existsSync(daySummary)) summaries.push(daySummary);
  }
  summaries.sort();
  for (const summaryPath of summaries.reverse()) {
    const summary = readJson(summaryPath, summaryPath);
    if (summary.recipient) return summary.recipient;
  }
  return "";
}

function renderSubject(config, localDate) {
  const template = config.delivery?.subjectTemplate || `${config.title || "Newsletter Digest"} - {{localDate}}`;
  return template.replaceAll("{{localDate}}", localDate);
}

function parseOptionalJson(text) {
  if (!String(text ?? "").trim()) return null;
  return JSON.parse(text);
}

export function buildFinalizeArgs({
  digestJson,
  runDir,
  account,
  recipient,
  subject,
  messageIdsJson,
  sourceArtifactsJson,
}) {
  return [
    "--digest-json",
    digestJson,
    "--day-dir",
    runDir,
    "--account",
    account,
    "--to",
    recipient,
    "--subject",
    subject,
    "--from",
    account,
    "--message-ids-json",
    messageIdsJson,
    "--source-artifacts-json",
    sourceArtifactsJson,
  ];
}

export async function runNewsletterDigest(rawOptions = {}) {
  const options = {
    ...rawOptions,
    config: rawOptions.config || resolveDefaultConfig(),
    memoryRoot: rawOptions.memoryRoot || resolveDefaultMemoryRoot(),
    limits: { ...DEFAULT_LIMITS, ...(rawOptions.limits ?? {}) },
  };

  if (!options.config) {
    throw new Error("Could not find newsletter-digest config. Pass --config PATH.");
  }

  const config = readJson(options.config, options.config);
  const timezone = config.timezone || "UTC";
  const now = new Date();
  const localDate = localDateParts(now, timezone);
  const runTimestamp = timestampForPath(now, timezone);
  const runDir = resolve(options.memoryRoot, "digests", localDate, runTimestamp);
  const tmpDir = resolve(options.memoryRoot, ".tmp", `newsletter-digest-${runTimestamp}`);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const runMeta = { now, localDate, runTimestamp, runDir };
  const primaryResults = await collectPrimaryCandidates(config, options, runMeta);
  const selectedCandidates = [];

  for (const result of primaryResults) {
    const selected = await maybeAdjudicateSelection(result, options, runDir);
    if (selected) selectedCandidates.push({ source: result.source, candidate: selected });
  }

  const extraResults = collectExtraCandidates(config, options, runMeta, selectedCandidates);
  const selectedExtraCandidates = [];
  const selectedExtraMessageIds = new Set();
  for (const result of extraResults) {
    for (const selected of maybeAdjudicateExtraSelection(result, options, runDir)) {
      if (selectedExtraMessageIds.has(selected.messageId)) {
        continue;
      }
      selectedExtraMessageIds.add(selected.messageId);
      selectedExtraCandidates.push({ extra: result.extra, candidate: selected });
    }
  }

  const selectedMessageIds = [
    ...selectedCandidates.map(({ candidate }) => candidate.messageId),
    ...selectedExtraCandidates.map(({ candidate }) => candidate.messageId),
  ];
  const candidateSummary = {
    localDate,
    runTimestamp,
    mode: options.mode,
    cutoffHours: Number(config.lookbackHours ?? 36),
    primary: primaryResults.map((result) => ({
      key: result.source.key,
      title: result.source.title,
      cutoff: result.cutoff,
      ambiguous: result.ambiguous,
      selectedMessageId: result.selected?.messageId || null,
      candidates: result.candidates,
    })),
    extras: extraResults.map((result) => ({
      key: result.extra.key,
      title: result.extra.title,
      cutoff: result.cutoff,
      lookbackHours: result.lookbackHours,
      maxSelected: result.maxSelected,
      queries: result.queries,
      selectedMessageIds: selectedExtraCandidates
        .filter(({ extra }) => extra.key === result.extra.key)
        .map(({ candidate }) => candidate.messageId),
      candidates: result.candidates,
    })),
    selectedMessageIds,
  };
  writeJson(resolve(runDir, "candidate-summary.json"), candidateSummary);

  if (options.mode === "dry-run") {
    const summary = {
      status: "ok",
      mode: options.mode,
      runDir,
      localDate,
      selectedMessageIds,
      candidateSummary: resolve(runDir, "candidate-summary.json"),
    };
    if (options.outputJson) writeJson(options.outputJson, summary);
    return summary;
  }

  if (options.modelBackend === "fixture" && !options.allowFixtureSend) {
    throw new Error("Refusing to send with fixture model backend unless --allow-fixture-send is set.");
  }

  const selectedSources = [];
  const sourceArtifactDirs = [];
  for (const { source, candidate } of selectedCandidates) {
    const artifactDir = ensureExtracted(candidate, options);
    sourceArtifactDirs.push(artifactDir);
    selectedSources.push(readSourceArtifact(artifactDir, source, candidate, options.limits));
  }
  for (const { extra, candidate } of selectedExtraCandidates) {
    const artifactDir = ensureExtracted(candidate, options);
    sourceArtifactDirs.push(artifactDir);
    selectedSources.push(readExtraArtifact(artifactDir, extra, candidate, options.limits));
  }

  const formatterInput = buildFormatterInput({ config, selectedSources, runMeta });
  const formatterInputBytes = assertFormatterInputSize(formatterInput, options.limits);
  const formatterInputPath = resolve(runDir, "formatter-input.json");
  writeJson(formatterInputPath, formatterInput);

  const digest = callModelBackend("format-digest", formatterInput, options, runDir);
  const digestJson = resolve(tmpDir, "digest.json");
  writeJson(digestJson, digest);

  const recipient = resolveRecipient(config, options);
  if (!recipient) {
    throw new Error("No digest recipient resolved. Pass --recipient or configure delivery.defaultRecipient.");
  }

  const messageIdsJson = resolve(tmpDir, "selected-message-ids.json");
  const sourceArtifactsJson = resolve(tmpDir, "source-artifact-dirs.json");
  writeJson(messageIdsJson, selectedMessageIds);
  writeJson(sourceArtifactsJson, sourceArtifactDirs);

  const subject = renderSubject(config, localDate);
  const finalizeOutput = execFileSync("newsletter-digest-finalize", buildFinalizeArgs({
    digestJson,
    runDir,
    account: options.account,
    recipient,
    subject,
    messageIdsJson,
    sourceArtifactsJson,
  }), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const finalizeResult = parseOptionalJson(finalizeOutput);

  const usageSummary = {
    status: "ok",
    mode: options.mode,
    runDir,
    localDate,
    runTimestamp,
    selectedMessageIds,
    sourceArtifactDirs,
    formatterInputBytes,
    limits: options.limits,
    modelBackend: options.modelBackend,
    digestJson: resolve(runDir, "digest.json"),
    summaryJson: finalizeResult?.summary_file || resolve(runDir, "summary.json"),
    sendResultJson: finalizeResult?.result_file || "",
  };
  writeJson(resolve(runDir, "usage-summary.json"), usageSummary);
  if (options.outputJson) writeJson(options.outputJson, usageSummary);
  return usageSummary;
}

export async function main(argv) {
  const options = parseArgs(argv);
  const summary = await runNewsletterDigest(options);
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
