import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixturePath, makeTempDir, readJson, runNode } from "./helpers.mjs";

test("extractor builds artifacts and curated links from a fixture Gmail message", () => {
  const tempDir = makeTempDir("newsletter-extract");
  const artifactDir = join(tempDir, "artifacts");
  const outputPath = join(tempDir, "extracted.json");

  runNode([
    "bin/newsletter-digest-extract.mjs",
    "--input",
    fixturePath("gmail-message.json"),
    "--artifact-dir",
    artifactDir,
    "--output",
    outputPath,
  ]);

  const extracted = readJson(outputPath);
  const metadata = readJson(join(artifactDir, "metadata.json"));
  const links = readJson(join(artifactDir, "links.json"));
  const cleanMarkdown = readFileSync(join(artifactDir, "clean.md"), "utf8");

  assert.equal(extracted.metadata.subject, "Daily Brief - May 8, 2026");
  assert.equal(metadata.from, "Daily Brief <daily@example.com>");
  assert.equal(extracted.content.sourceBody, "html");
  assert.ok(links.some((link) => link.url === "https://example.com/issues/2026-05-08"));
  assert.ok(links.some((link) => link.url === "https://open.substack.com/pub/example/p/story"));
  assert.match(cleanMarkdown, /Daily Brief/);
  assert.doesNotMatch(cleanMarkdown, /Unsubscribe/i);
  assert.ok(existsSync(join(artifactDir, "raw.html")));
  assert.ok(existsSync(join(artifactDir, "raw.txt")));
});

test("extractor reuses cached extracted.json when artifact set is already valid", () => {
  const tempDir = makeTempDir("newsletter-extract-cache");
  const artifactDir = join(tempDir, "artifacts");
  const outputPath = join(tempDir, "extracted.json");

  runNode([
    "bin/newsletter-digest-extract.mjs",
    "--input",
    fixturePath("gmail-message.json"),
    "--artifact-dir",
    artifactDir,
    "--output",
    outputPath,
  ]);

  const extractedPath = join(artifactDir, "extracted.json");
  const cached = readJson(extractedPath);
  cached.metadata.subject = "Cached Subject";
  writeFileSync(extractedPath, `${JSON.stringify(cached, null, 2)}\n`, "utf8");

  runNode([
    "bin/newsletter-digest-extract.mjs",
    "--input",
    fixturePath("gmail-message.json"),
    "--artifact-dir",
    artifactDir,
    "--output",
    outputPath,
  ]);

  const secondRun = readJson(outputPath);
  assert.equal(secondRun.metadata.subject, "Cached Subject");
});

test("extractor falls back to raw text when cleaned HTML yields empty markdown", () => {
  const tempDir = makeTempDir("newsletter-extract-raw-fallback");
  const inputPath = join(tempDir, "message.json");
  const artifactDir = join(tempDir, "artifacts");
  const outputPath = join(tempDir, "extracted.json");

  writeFileSync(
    inputPath,
    `${JSON.stringify({
      message: {
        id: "raw-fallback",
        threadId: "raw-fallback-thread",
        snippet: "",
        payload: {
          headers: [
            { name: "Subject", value: "Raw fallback issue" },
            { name: "From", value: "Example <example@substack.com>" },
          ],
        },
      },
      body: "<html><body><picture>Important article text survived raw extraction.</picture></body></html>",
    })}\n`,
    "utf8",
  );

  runNode([
    "bin/newsletter-digest-extract.mjs",
    "--input",
    inputPath,
    "--artifact-dir",
    artifactDir,
    "--output",
    outputPath,
  ]);

  const extracted = readJson(outputPath);
  const cleanMarkdown = readFileSync(join(artifactDir, "clean.md"), "utf8");

  assert.equal(extracted.content.sourceBody, "html");
  assert.match(cleanMarkdown, /Important article text survived raw extraction/);
  assert.ok(extracted.diagnostics.rawTextChars > 0);
  assert.ok(extracted.diagnostics.markdownChars > 0);
});
