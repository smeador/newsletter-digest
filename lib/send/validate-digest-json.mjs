import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

function usage() {
  console.error(`Usage:
  agent-newsletter-digest-validate --input DIGEST_JSON [--write]

Options:
  --input PATH   Path to digest.json
  --write        Rewrite the file in place with repaired, normalized JSON
  -h, --help     Show this help message`);
}

function parseArgs(argv) {
  let inputPath = "";
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--input":
        inputPath = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--write":
        write = true;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!inputPath) {
    throw new Error("Missing required --input path.");
  }

  return {
    inputPath: resolve(inputPath),
    write,
  };
}

function normalizeParsedValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("digest.json must contain a top-level JSON object.");
  }

  return `${JSON.stringify(value, null, 2)}\n`;
}

function isControlCharacter(character) {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
}

function escapeControlCharacter(character) {
  switch (character) {
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\t":
      return "\\t";
    case "\b":
      return "\\b";
    case "\f":
      return "\\f";
    default:
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  }
}

function repairJsonStringControlCharacters(raw) {
  const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let repaired = "";
  let inString = false;
  let escaping = false;
  let changed = false;

  for (const character of source) {
    if (!inString) {
      repaired += character;
      if (character === "\"") {
        inString = true;
      }
      continue;
    }

    if (escaping) {
      repaired += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      repaired += character;
      escaping = true;
      continue;
    }

    if (character === "\"") {
      repaired += character;
      inString = false;
      continue;
    }

    if (isControlCharacter(character)) {
      repaired += escapeControlCharacter(character);
      changed = true;
      continue;
    }

    repaired += character;
  }

  return {
    repaired,
    changed,
  };
}

function loadAndNormalizeDigest(inputPath) {
  const raw = readFileSync(inputPath, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return {
      normalized: normalizeParsedValue(parsed),
      repaired: false,
    };
  } catch (parseError) {
    const { repaired, changed } = repairJsonStringControlCharacters(raw);
    if (!changed) {
      throw new Error(
        `Digest JSON is invalid and could not be repaired automatically: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`,
      );
    }

    try {
      const parsed = JSON.parse(repaired);
      return {
        normalized: normalizeParsedValue(parsed),
        repaired: true,
      };
    } catch (repairError) {
      throw new Error(
        `Digest JSON is invalid and automatic repair failed: ${
          repairError instanceof Error ? repairError.message : String(repairError)
        }`,
      );
    }
  }
}

export function main(argv) {
  const { inputPath, write } = parseArgs(argv);
  const { normalized, repaired } = loadAndNormalizeDigest(inputPath);

  if (write) {
    writeFileSync(inputPath, normalized, "utf8");
  }

  if (repaired) {
    console.error(`Repaired invalid digest JSON at ${inputPath}.`);
  } else {
    console.error(`Validated digest JSON at ${inputPath}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
