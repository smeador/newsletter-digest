import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  buildFinalizeArgs,
  buildFormatterInput,
  filterCandidatesByLookback,
  parseArgs,
  parseMessageDate,
  scoreCandidate,
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

test("runner args default to dry-run and reject unknown modes", () => {
  assert.equal(parseArgs([]).mode, "dry-run");
  assert.equal(parseArgs(["--mode", "send", "--account", "digest@example.com"]).mode, "send");
  assert.throws(() => parseArgs(["--mode", "wander"]), /Invalid --mode/);
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
