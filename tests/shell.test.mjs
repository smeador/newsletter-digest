import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, makeTempDir, readJson, repoRoot, runBash, writeExecutable, writeJson } from "./helpers.mjs";

test("finalize script validates, renders, copies artifacts, and delegates send", () => {
  const tempDir = makeTempDir("newsletter-finalize");
  const binDir = join(tempDir, "bin");
  const dayDir = join(tempDir, "day");
  const digestPath = join(tempDir, "digest.json");
  const messageIdsPath = join(tempDir, "message-ids.json");
  const sourceArtifactsPath = join(tempDir, "source-artifacts.json");
  const logPath = join(tempDir, "calls.log");

  ensureDir(binDir);
  writeJson(digestPath, {
    title: "Newsletter Digest",
    date: "May 8, 2026",
    localDate: "2026-05-08",
    inventory: {},
    sections: [],
  });
  writeJson(messageIdsPath, ["m1", "m2"]);
  writeJson(sourceArtifactsPath, ["/tmp/newsletters/m1"]);

  writeExecutable(
    join(binDir, "newsletter-digest-validate"),
    `#!/bin/bash
echo "validate:$*" >> "${logPath}"
`,
  );
  writeExecutable(
    join(binDir, "newsletter-digest-render"),
    `#!/bin/bash
echo "render:$*" >> "${logPath}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --html-out) HTML_OUT="$2"; shift 2 ;;
    --text-out) TEXT_OUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '<html><body>Rendered</body></html>\\n' > "$HTML_OUT"
printf 'Rendered text\\n' > "$TEXT_OUT"
`,
  );
  writeExecutable(
    join(binDir, "newsletter-digest-send"),
    `#!/bin/bash
echo "send:$*" >> "${logPath}"
`,
  );

  const result = runBash(
    join(repoRoot, "lib/send/finalize-newsletter-digest.sh"),
    [
      "--digest-json",
      digestPath,
      "--day-dir",
      dayDir,
      "--account",
      "pip@meador.me",
      "--to",
      "sean@meador.me",
      "--subject",
      "Newsletter Digest - 2026-05-08",
      "--message-ids-json",
      messageIdsPath,
      "--source-artifacts-json",
      sourceArtifactsPath,
    ],
    {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readJson(join(dayDir, "selected-message-ids.json")), ["m1", "m2"]);
  assert.deepEqual(readJson(join(dayDir, "source-artifact-dirs.json")), ["/tmp/newsletters/m1"]);
  assert.match(readFileSync(join(dayDir, "email.html"), "utf8"), /Rendered/);
  assert.match(readFileSync(join(dayDir, "email.txt"), "utf8"), /Rendered text/);

  const log = readFileSync(logPath, "utf8");
  assert.match(log, /validate:--input .*day\/digest\.json --write/);
  assert.match(log, /render:--input .*day\/digest\.json --html-out .*day\/email\.html --text-out .*day\/email\.txt/);
  assert.match(log, /send:--account pip@meador\.me --to sean@meador\.me --subject Newsletter Digest - 2026-05-08/);
});

test("send script archives artifacts and succeeds when gog returns a message id", () => {
  const tempDir = makeTempDir("newsletter-send");
  const binDir = join(tempDir, "bin");
  const dayDir = join(tempDir, "day");
  const digestPath = join(tempDir, "digest.json");
  const textPath = join(tempDir, "email.txt");
  const htmlPath = join(tempDir, "email.html");
  const gogLogPath = join(tempDir, "gog.log");

  ensureDir(binDir);
  ensureDir(dayDir);
  writeJson(digestPath, {
    title: "Newsletter Digest",
    date: "May 8, 2026",
    localDate: "2026-05-08",
    inventory: {},
    sections: [],
  });
  writeFileSync(textPath, "Rendered text\n", "utf8");
  writeFileSync(htmlPath, "<html><body>Rendered HTML</body></html>\n", "utf8");

  writeExecutable(
    join(binDir, "gog"),
    `#!/bin/bash
echo "$*" >> "${gogLogPath}"
printf '{"message_id":"gmail-123"}\\n'
`,
  );

  const result = runBash(
    join(repoRoot, "lib/send/send-gog-digest.sh"),
    [
      "--account",
      "pip@meador.me",
      "--to",
      "sean@meador.me",
      "--subject",
      "Newsletter Digest - 2026-05-08",
      "--digest-json",
      digestPath,
      "--text-file",
      textPath,
      "--html-file",
      htmlPath,
      "--day-dir",
      dayDir,
    ],
    {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  const runDir = output.run_dir;
  assert.equal(readdirSync(dayDir).length, 1);
  assert.equal(readJson(output.result_file).message_id, "gmail-123");
  assert.equal(readJson(output.summary_file).recipient, "sean@meador.me");
  assert.match(readFileSync(join(runDir, "email.html"), "utf8"), /Rendered HTML/);
  assert.match(readFileSync(gogLogPath, "utf8"), /gmail send --account pip@meador\.me --to sean@meador\.me/);
});

test("send script fails when gog does not report a Gmail message id", () => {
  const tempDir = makeTempDir("newsletter-send-fail");
  const binDir = join(tempDir, "bin");
  const dayDir = join(tempDir, "day");
  const textPath = join(tempDir, "email.txt");
  const htmlPath = join(tempDir, "email.html");

  ensureDir(binDir);
  ensureDir(dayDir);
  writeFileSync(textPath, "Rendered text\n", "utf8");
  writeFileSync(htmlPath, "<html><body>Rendered HTML</body></html>\n", "utf8");

  writeExecutable(
    join(binDir, "gog"),
    `#!/bin/bash
printf '{"status":"ok"}\\n'
`,
  );

  const result = runBash(
    join(repoRoot, "lib/send/send-gog-digest.sh"),
    [
      "--account",
      "pip@meador.me",
      "--to",
      "sean@meador.me",
      "--subject",
      "Newsletter Digest - 2026-05-08",
      "--text-file",
      textPath,
      "--html-file",
      htmlPath,
      "--day-dir",
      dayDir,
    ],
    {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /did not include message_id\/messageId/);
});
