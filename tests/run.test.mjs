import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFinalizeArgs,
  buildExtraQueries,
  buildFormatterInput,
  callModelBackend,
  candidateMatchesSourceIdentity,
  filterCandidatesByLookback,
  maxCleanMarkdownCharsForSource,
  maxSelectedForExtra,
  parseArgs,
  parseMessageDate,
  runNewsletterDigest,
  scoreCandidate,
  selectExtraCandidatesFromCandidates,
  selectDeterministicCandidate,
} from "../lib/run/newsletter-digest-run.mjs";
import { internals as openclawModelInternals } from "../lib/run/openclaw-model-command.mjs";
import { makeTempDir, readJson, runNode, writeExecutable, writeJson } from "./helpers.mjs";

test("runner CLI exposes the stable command surface", () => {
  const output = runNode(["bin/newsletter-digest-run.mjs", "--help"]);
  assert.match(output, /newsletter-digest-run --mode dry-run/);
  assert.match(output, /NEWSLETTER_DIGEST_MODEL_INPUT/);
});

test("OpenClaw model adapter writes parsed JSON output", () => {
  const tempDir = makeTempDir("newsletter-openclaw-model");
  const fakeOpenClaw = join(tempDir, "openclaw");
  const argsPath = join(tempDir, "args.json");
  const inputPath = join(tempDir, "input.json");
  const outputPath = join(tempDir, "output.json");

  writeExecutable(
    fakeOpenClaw,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2), null, 2));
process.stdout.write(JSON.stringify({ outputs: [{ text: JSON.stringify({ ok: true, selectedMessageIds: ["msg-1"] }) }] }));
`,
  );
  writeJson(inputPath, { candidatesBySource: [{ sourceKey: "source", candidates: [{ messageId: "msg-1" }] }] });

  runNode(
    [
      "bin/newsletter-digest-openclaw-model.mjs",
      "--task",
      "select-candidates",
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--transport",
      "gateway",
    ],
    {
      env: {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH}`,
      },
    },
  );

  assert.deepEqual(readJson(outputPath), { ok: true, selectedMessageIds: ["msg-1"] });
  assert.deepEqual(readJson(argsPath).slice(0, 6), ["infer", "model", "run", "--json", "--gateway", "--thinking"]);
});

test("OpenClaw adapter uses agent file handoff for digest formatting", () => {
  const tempDir = makeTempDir("newsletter-openclaw-format");
  const fakeOpenClaw = join(tempDir, "openclaw");
  const argsPath = join(tempDir, "args.json");
  const inputPath = join(tempDir, "formatter-input.json");
  const outputPath = join(tempDir, "format-digest-output.json");

  writeExecutable(
    fakeOpenClaw,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2), null, 2));
writeFileSync(process.env.NEWSLETTER_DIGEST_MODEL_OUTPUT, JSON.stringify({ title: "Digest", sections: [] }));
process.stdout.write(JSON.stringify({ ok: true }));
`,
  );
  writeJson(inputPath, {
    title: "Digest",
    selectedSources: [{ key: "source", content: "already cleaned content" }],
  });

  runNode(
    [
      "bin/newsletter-digest-openclaw-model.mjs",
      "--task",
      "format-digest",
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--transport",
      "gateway",
      "--agent",
      "main",
    ],
    {
      env: {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH}`,
      },
    },
  );

  const args = readJson(argsPath);
  assert.deepEqual(args.slice(0, 4), ["agent", "--agent", "main", "--message"]);
  assert.equal(args.includes("--json"), true);
  assert.equal(args.includes("--session-id"), true);
  assert.equal(args.includes(inputPath), false);
  assert.match(args[4], new RegExp(inputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(args[4], new RegExp(outputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(args[4], /already cleaned content/);
  assert.deepEqual(readJson(outputPath), { title: "Digest", sections: [] });
});

test("OpenClaw adapter supports direct JSON repair task", () => {
  const tempDir = makeTempDir("newsletter-openclaw-repair");
  const fakeOpenClaw = join(tempDir, "openclaw");
  const argsPath = join(tempDir, "args.json");
  const inputPath = join(tempDir, "repair-input.json");
  const outputPath = join(tempDir, "repair-output.json");

  writeExecutable(
    fakeOpenClaw,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2), null, 2));
process.stdout.write(JSON.stringify({ outputs: [{ text: JSON.stringify({ title: "Digest", sections: [] }) }] }));
`,
  );
  writeJson(inputPath, {
    parseError: "Unexpected string",
    malformedOutput: '{"title":"Digest","sections":[]}',
    expectedDigest: { title: "Digest" },
  });

  runNode(
    [
      "bin/newsletter-digest-openclaw-model.mjs",
      "--task",
      "repair-digest-json",
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--transport",
      "gateway",
    ],
    {
      env: {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH}`,
      },
    },
  );

  const args = readJson(argsPath);
  assert.deepEqual(args.slice(0, 6), ["infer", "model", "run", "--json", "--gateway", "--thinking"]);
  assert.match(args.join("\n"), /You repair malformed newsletter digest JSON/);
  assert.deepEqual(readJson(outputPath), { title: "Digest", sections: [] });
});

test("runner repairs malformed formatter JSON once and preserves audit artifacts", () => {
  const tempDir = makeTempDir("newsletter-format-repair");
  const fakeModel = join(tempDir, "model-command");

  writeExecutable(
    fakeModel,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";

if (process.env.NEWSLETTER_DIGEST_MODEL_TASK === "format-digest") {
  writeFileSync(process.env.NEWSLETTER_DIGEST_MODEL_OUTPUT, String.raw\`{
  "title": "Digest",
  "date": "July 5, 2026",
  "localDate": "2026-07-05",
  "inventory": {},
  "sections": [
    {
      "groups": [
        {
          "content": [
            "A history of the phrase "make America great again" broke JSON."
          ]
        }
      ]
    }
  ]
}\`);
  process.exit(0);
}

if (process.env.NEWSLETTER_DIGEST_MODEL_TASK === "repair-digest-json") {
  writeFileSync(process.env.NEWSLETTER_DIGEST_MODEL_OUTPUT, JSON.stringify({
    title: "Digest",
    date: "July 5, 2026",
    localDate: "2026-07-05",
    inventory: {},
    sections: [
      {
        groups: [
          {
            content: [
              "A history of the phrase \\"make America great again\\" broke JSON."
            ]
          }
        ]
      }
    ]
  }));
  process.exit(0);
}

throw new Error("unexpected task " + process.env.NEWSLETTER_DIGEST_MODEL_TASK);
`,
  );

  const input = {
    title: "Digest",
    date: "July 5, 2026",
    localDate: "2026-07-05",
    inventory: {},
    selectedSources: [],
  };
  const digest = callModelBackend(
    "format-digest",
    input,
    {
      modelBackend: "command",
      modelCommand: fakeModel,
    },
    tempDir,
  );

  assert.equal(
    digest.sections[0].groups[0].content[0],
    'A history of the phrase "make America great again" broke JSON.',
  );
  assert.equal(existsSync(join(tempDir, "format-digest-parse-error.json")), true);
  assert.equal(existsSync(join(tempDir, "format-digest-malformed-output.json")), true);
  assert.equal(existsSync(join(tempDir, "format-digest-repair-summary.json")), true);
  assert.match(
    readFileSync(join(tempDir, "format-digest-malformed-output.json"), "utf8"),
    /phrase "make America great again" broke JSON/,
  );
});

test("runner args default to dry-run and reject unknown modes", () => {
  assert.equal(parseArgs([]).mode, "dry-run");
  assert.equal(parseArgs(["--mode", "send", "--account", "digest@example.com"]).mode, "send");
  assert.throws(() => parseArgs(["--mode", "wander"]), /Invalid --mode/);
});

test("runner refuses to send an empty digest", async () => {
  const tempDir = makeTempDir("newsletter-empty-send");
  const configPath = join(tempDir, "newsletter-digest.json");
  const outputPath = join(tempDir, "summary.json");

  writeJson(configPath, {
    title: "Newsletter Digest",
    timezone: "UTC",
    lookbackHours: 36,
    delivery: {
      defaultRecipient: "recipient@example.com",
    },
    sourcePolicy: {
      primary: [],
      extras: [],
    },
  });

  await assert.rejects(
    () =>
      runNewsletterDigest({
        mode: "send",
        config: configPath,
        memoryRoot: tempDir,
        account: "workflow@example.com",
        recipient: "recipient@example.com",
        modelBackend: "fixture",
        allowFixtureSend: true,
        outputJson: outputPath,
      }),
    /Refusing to send empty newsletter digest/,
  );

  const summary = readJson(outputPath);
  assert.equal(summary.status, "error");
  assert.equal(summary.reason, "no selected newsletter messages");
  assert.deepEqual(summary.selectedMessageIds, []);
  assert.deepEqual(readJson(summary.candidateSummary).selectedMessageIds, []);
  assert.deepEqual(readJson(join(summary.runDir, "usage-summary.json")), summary);
});

test("strict lookback filtering rejects older candidate dates", () => {
  const cutoff = new Date("2026-06-16T12:00:00.000Z");
  const candidates = [
    { messageId: "new", date: "2026-06-16T12:00:00.000Z" },
    { messageId: "old", date: "2026-06-16T11:59:59.000Z" },
    { messageId: "bad", date: "not a date" },
  ];

  assert.deepEqual(
    filterCandidatesByLookback(candidates, cutoff).map((candidate) => candidate.messageId),
    ["new"],
  );
});

test("candidate scoring favors sender/title matches and recency", () => {
  const source = {
    key: "technology-brief",
    title: "Technology Brief",
    senders: ["tech@example.com"],
  };
  const now = new Date("2026-06-16T12:00:00.000Z");
  const strong = scoreCandidate(
    {
      messageId: "a",
      from: "Technology <tech@example.com>",
      subject: "Technology Brief: Today",
      date: "2026-06-16T11:00:00.000Z",
    },
    source,
    now,
  );
  const weak = scoreCandidate(
    {
      messageId: "b",
      from: "Someone Else <else@example.com>",
      subject: "Random update",
      date: "2026-06-15T11:00:00.000Z",
    },
    source,
    now,
  );

  assert.ok(strong.score > weak.score);
  assert.ok(strong.matchedRules.includes("sender"));
  assert.ok(strong.matchedRules.includes("title"));
});

test("deterministic selection marks close scores ambiguous", () => {
  const { top, ambiguous } = selectDeterministicCandidate([
    { messageId: "a", score: 70, date: "2026-06-16T10:00:00.000Z" },
    { messageId: "b", score: 65, date: "2026-06-16T11:00:00.000Z" },
  ]);

  assert.equal(top.messageId, "a");
  assert.equal(ambiguous, true);
});

test("formatter input contains only bounded selected source material", () => {
  const runMeta = {
    now: new Date("2026-06-16T12:00:00.000Z"),
    localDate: "2026-06-16",
  };
  const formatterInput = buildFormatterInput({
    runMeta,
    config: {
      title: "Newsletter Digest",
      timezone: "UTC",
      sourcePolicy: {
        primary: [
          { key: "technology-brief", title: "Technology Brief", formatRules: { groups: [] } },
          { key: "business-brief", title: "Business Brief", formatRules: { groups: [] } },
        ],
        extras: [],
      },
    },
    selectedSources: [
      {
        key: "technology-brief",
        type: "primary",
        title: "Technology Brief",
        metadata: { from: "Technology <tech@example.com>" },
        links: [{ url: "https://example.com", text: "Read online" }],
        content: "A compact cleaned body.",
      },
    ],
  });

  assert.deepEqual(formatterInput.inventory.foundPrimary, ["Technology Brief"]);
  assert.deepEqual(formatterInput.inventory.missingPrimary, ["Business Brief"]);
  assert.equal(formatterInput.selectedSources[0].content, "A compact cleaned body.");
});

test("formatter input reports configured extra collection counts", () => {
  const formatterInput = buildFormatterInput({
    runMeta: {
      now: new Date("2026-06-16T12:00:00.000Z"),
      localDate: "2026-06-16",
    },
    config: {
      title: "Newsletter Digest",
      timezone: "UTC",
      sourcePolicy: {
        primary: [],
        extras: [
          {
            key: "substack-review",
            title: "Substack Review",
            inventoryLabel: "Substack Review",
            itemName: "items",
          },
          {
            key: "stanford",
            title: "Stanford",
            inventoryLabel: "Stanford",
            itemName: "items",
          },
        ],
      },
    },
    selectedSources: [
      {
        key: "substack-review",
        collectionKey: "substack-review",
        type: "extra",
        sectionType: "substack_review",
        title: "Substack Review",
        content: "A compact extra item.",
      },
    ],
  });

  assert.deepEqual(formatterInput.inventory.extraCounts, {
    "substack-review": {
      title: "Substack Review",
      count: 1,
      itemName: "items",
    },
    stanford: {
      title: "Stanford",
      count: 0,
      itemName: "items",
    },
  });
});

test("extra collection labels become bounded Gmail queries", () => {
  assert.deepEqual(
    buildExtraQueries({ gmailLabels: ["Stanford Updates", "substack-review"] }, 36),
    ['label:"Stanford Updates" newer_than:3d -label:sent', "label:substack-review newer_than:3d -label:sent"],
  );
  assert.deepEqual(buildExtraQueries({ queryHints: ["label:custom newer_than:2d"] }, 36), [
    "label:custom newer_than:2d",
  ]);
});

test("extra candidate selection enforces lookback, cap, and primary exclusions", () => {
  const cutoff = new Date("2026-06-16T12:00:00.000Z");
  const result = selectExtraCandidatesFromCandidates(
    [
      { messageId: "primary", subject: "AI News", date: "2026-06-16T13:00:00.000Z" },
      { messageId: "newest", subject: "Stanford item", date: "2026-06-16T14:00:00.000Z" },
      { messageId: "older-valid", subject: "Stanford item 2", date: "2026-06-16T12:00:00.000Z" },
      { messageId: "too-old", subject: "Stanford old", date: "2026-06-16T11:59:59.000Z" },
    ],
    { key: "stanford", title: "Stanford" },
    cutoff,
    { maxSelectedExtras: 1, maxCandidatesPerSource: 8 },
    new Set(["primary"]),
  );

  assert.deepEqual(result.candidates.map((candidate) => candidate.messageId), ["newest", "older-valid"]);
  assert.deepEqual(result.selected.map((candidate) => candidate.messageId), ["newest"]);
});

test("extra candidate selection supports per-collection caps", () => {
  assert.equal(maxSelectedForExtra({ key: "substack-review", maxSelectedItems: 8 }, { maxSelectedExtras: 3 }), 8);

  const cutoff = new Date("2026-06-16T12:00:00.000Z");
  const result = selectExtraCandidatesFromCandidates(
    [
      { messageId: "a", subject: "Item A", date: "2026-06-16T18:00:00.000Z" },
      { messageId: "b", subject: "Item B", date: "2026-06-16T17:00:00.000Z" },
      { messageId: "c", subject: "Item C", date: "2026-06-16T16:00:00.000Z" },
      { messageId: "d", subject: "Item D", date: "2026-06-16T15:00:00.000Z" },
    ],
    { key: "substack-review", title: "Substack Review", maxSelectedItems: 4 },
    cutoff,
    { maxSelectedExtras: 3, maxCandidatesPerSource: 8 },
  );

  assert.deepEqual(result.selected.map((candidate) => candidate.messageId), ["a", "b", "c", "d"]);
  assert.equal(result.maxSelected, 4);
});

test("extra candidate selection excludes configured primary source identities", () => {
  const cutoff = new Date("2026-06-16T12:00:00.000Z");
  const aiNewsSource = {
    key: "technology-brief",
    title: "AI News",
    senders: ["swyx+ainews@substack.com"],
  };
  const result = selectExtraCandidatesFromCandidates(
    [
      {
        messageId: "ainews-other-issue",
        subject: "[AINews] It's Meta-Harness Summer",
        from: "AINews <swyx+ainews@substack.com>",
        date: "2026-06-16T18:00:00.000Z",
      },
      {
        messageId: "substack-item",
        subject: "Make AI Boring Again",
        from: "Charity Majors <charitydotwtf@substack.com>",
        date: "2026-06-16T17:00:00.000Z",
      },
    ],
    { key: "substack-review", title: "Substack Review", maxSelectedItems: 8 },
    cutoff,
    { maxSelectedExtras: 3, maxCandidatesPerSource: 8 },
    new Set(),
    [aiNewsSource],
  );

  assert.equal(
    candidateMatchesSourceIdentity(
      {
        subject: "[AINews] It's Meta-Harness Summer",
        from: "AINews <swyx+ainews@substack.com>",
      },
      aiNewsSource,
    ),
    true,
  );
  assert.deepEqual(result.candidates.map((candidate) => candidate.messageId), ["substack-item"]);
  assert.deepEqual(result.selected.map((candidate) => candidate.messageId), ["substack-item"]);
});

test("clean markdown cap can be overridden per source or extra collection", () => {
  assert.equal(maxCleanMarkdownCharsForSource({ key: "default" }, { maxCleanMarkdownChars: 12000 }), 12000);
  assert.equal(
    maxCleanMarkdownCharsForSource({ key: "substack-review", maxCleanMarkdownChars: 4000 }, { maxCleanMarkdownChars: 12000 }),
    4000,
  );
  assert.equal(
    maxCleanMarkdownCharsForSource({ key: "legacy", maxContentChars: 5000 }, { maxCleanMarkdownChars: 12000 }),
    5000,
  );
});

test("finalize args match the finalizer command contract", () => {
  const args = buildFinalizeArgs({
    digestJson: "/tmp/digest.json",
    runDir: "/tmp/run",
    account: "sender@example.com",
    recipient: "recipient@example.com",
    subject: "Digest",
    messageIdsJson: "/tmp/message-ids.json",
    sourceArtifactsJson: "/tmp/source-artifacts.json",
  });

  assert.deepEqual(args, [
    "--digest-json",
    "/tmp/digest.json",
    "--day-dir",
    "/tmp/run",
    "--account",
    "sender@example.com",
    "--to",
    "recipient@example.com",
    "--subject",
    "Digest",
    "--from",
    "sender@example.com",
    "--message-ids-json",
    "/tmp/message-ids.json",
    "--source-artifacts-json",
    "/tmp/source-artifacts.json",
  ]);
  assert.equal(args.includes("--timezone"), false);
});

test("date parser handles Gmail millisecond timestamps", () => {
  assert.equal(parseMessageDate(1781613000000).toISOString(), "2026-06-16T12:30:00.000Z");
});

test("OpenClaw adapter accepts JSON wrapped in surrounding model text", () => {
  assert.deepEqual(openclawModelInternals.parseOpenClawOutput('{"outputs":[{"text":"Here: {\\"ok\\":true}"}]}'), {
    ok: true,
  });
});

test("OpenClaw selection prompt defines cutoff direction", () => {
  const prompt = openclawModelInternals.buildPrompt("select-candidates", {
    cutoff: "2026-06-24T00:00:00.000Z",
    candidates: [],
  });
  assert.match(prompt, /on or after the cutoff timestamp/);
});

test("OpenClaw extra selection prompt supports bounded multi-item filtering", () => {
  const prompt = openclawModelInternals.buildPrompt("select-extra-candidates", {
    collectionKey: "stanford",
    maxSelected: 3,
    cutoff: "2026-06-24T00:00:00.000Z",
    candidates: [],
  });
  assert.match(prompt, /Choose up to maxSelected candidates/);
  assert.match(prompt, /empty selectedMessageIds array/);
});
