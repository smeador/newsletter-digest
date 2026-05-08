import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixturePath, makeTempDir, readJson, repoRoot, runNode } from "./helpers.mjs";

test("validator rewrites normalized JSON", () => {
  const tempDir = makeTempDir("newsletter-validate");
  const digestPath = join(tempDir, "digest.json");
  writeFileSync(digestPath, '{ "title":"Newsletter Digest","date":"May 8, 2026","localDate":"2026-05-08","inventory":{},"sections":[] }', "utf8");

  runNode(["bin/newsletter-digest-validate.mjs", "--input", digestPath, "--write"]);

  const parsed = readJson(digestPath);
  assert.equal(parsed.title, "Newsletter Digest");
  assert.match(readFileSync(digestPath, "utf8"), /\n  "title": "Newsletter Digest"/);
});

test("validator repairs control characters inside JSON strings", () => {
  const tempDir = makeTempDir("newsletter-validate-repair");
  const digestPath = join(tempDir, "digest.json");
  writeFileSync(
    digestPath,
    '{"title":"Hello\u0001World","date":"May 8, 2026","localDate":"2026-05-08","inventory":{},"sections":[]}',
    "utf8",
  );

  runNode(["bin/newsletter-digest-validate.mjs", "--input", digestPath, "--write"]);

  const parsed = readJson(digestPath);
  assert.equal(parsed.title, "Hello\u0001World");
  assert.match(readFileSync(digestPath, "utf8"), /\\u0001/);
});

test("validator fails on irreparable JSON", () => {
  const tempDir = makeTempDir("newsletter-validate-bad");
  const digestPath = join(tempDir, "digest.json");
  writeFileSync(digestPath, '{"title": "broken"', "utf8");

  assert.throws(
    () => runNode(["bin/newsletter-digest-validate.mjs", "--input", digestPath]),
    /could not be repaired automatically|automatic repair failed/,
  );
});

test("renderer produces HTML and text output from a valid digest fixture", () => {
  const tempDir = makeTempDir("newsletter-render");
  const htmlOut = join(tempDir, "email.html");
  const textOut = join(tempDir, "email.txt");

  runNode([
    "bin/newsletter-digest-render.mjs",
    "--input",
    fixturePath("digest-valid.json"),
    "--html-out",
    htmlOut,
    "--text-out",
    textOut,
  ]);

  const html = readFileSync(htmlOut, "utf8");
  const text = readFileSync(textOut, "utf8");

  assert.match(html, /Newsletter Digest/);
  assert.match(html, /NY Times Morning/);
  assert.match(html, /Issue link/);
  assert.match(text, /Substack Review/);
  assert.match(text, /Issue link: https:\/\/example\.com\/nyt-issue/);
});

test("renderer rejects placeholder prose that violates the digest contract", () => {
  const tempDir = makeTempDir("newsletter-render-bad");
  const htmlOut = join(tempDir, "email.html");
  const textOut = join(tempDir, "email.txt");

  assert.throws(
    () =>
      runNode([
        "bin/newsletter-digest-render.mjs",
        "--input",
        fixturePath("digest-invalid-markdown.json"),
        "--html-out",
        htmlOut,
        "--text-out",
        textOut,
      ]),
    /contains placeholder writing/,
  );
});
