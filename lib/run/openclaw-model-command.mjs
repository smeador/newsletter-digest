#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    task: process.env.NEWSLETTER_DIGEST_MODEL_TASK || "",
    input: process.env.NEWSLETTER_DIGEST_MODEL_INPUT || "",
    output: process.env.NEWSLETTER_DIGEST_MODEL_OUTPUT || "",
    model: process.env.NEWSLETTER_DIGEST_MODEL || "",
    thinking: process.env.NEWSLETTER_DIGEST_THINKING || "minimal",
    transport: process.env.NEWSLETTER_DIGEST_OPENCLAW_TRANSPORT || "gateway",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--task":
        options.task = next ?? "";
        i += 1;
        break;
      case "--input":
        options.input = next ?? "";
        i += 1;
        break;
      case "--output":
        options.output = next ?? "";
        i += 1;
        break;
      case "--model":
        options.model = next ?? "";
        i += 1;
        break;
      case "--thinking":
        options.thinking = next ?? "";
        i += 1;
        break;
      case "--transport":
        options.transport = next ?? "";
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

  if (!options.task) throw new Error("Model task is required.");
  if (!options.input) throw new Error("Model input path is required.");
  if (!options.output) throw new Error("Model output path is required.");
  if (!existsSync(options.input)) throw new Error(`Model input not found: ${options.input}`);
  if (!["gateway", "local"].includes(options.transport)) {
    throw new Error("--transport must be gateway or local");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  newsletter-digest-openclaw-model --task TASK --input INPUT_JSON --output OUTPUT_JSON

Environment contract used by newsletter-digest-run:
  NEWSLETTER_DIGEST_MODEL_TASK
  NEWSLETTER_DIGEST_MODEL_INPUT
  NEWSLETTER_DIGEST_MODEL_OUTPUT

Options:
  --model PROVIDER/MODEL      Optional OpenClaw model override
  --thinking LEVEL            OpenClaw thinking level (default: minimal)
  --transport gateway|local   OpenClaw infer transport (default: gateway)
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function packageRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function readFormatterContract() {
  const path = resolve(packageRoot(), "skills/newsletter-digest-format/SKILL.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").slice(0, 12000);
}

function buildSelectionPrompt(input) {
  return [
    "You are selecting newsletter email candidates for a deterministic digest runner.",
    "Return only valid JSON. Do not use markdown.",
    "Choose at most one candidate from the provided list.",
    "A candidate is eligible only when its date is on or after the cutoff timestamp.",
    "Respect the selection rules. Do not invent message ids.",
    "",
    "Required output shape:",
    '{"selectedMessageIds":["MESSAGE_ID"],"missingSourceKeys":[],"reason":"short plain text"}',
    "",
    "Input JSON:",
    JSON.stringify(input),
  ].join("\n");
}

function buildFormatPrompt(input) {
  const contract = readFormatterContract();
  return [
    "You are formatting a newsletter digest from preselected, cleaned source artifacts.",
    "Return only one valid JSON object. Do not use markdown fences.",
    "Do not perform retrieval, mention missing files, or ask for more context.",
    "Use only the provided input JSON.",
    "",
    contract ? `Formatter contract excerpt:\n${contract}` : "",
    "",
    "Input JSON:",
    JSON.stringify(input),
  ].join("\n");
}

function buildPrompt(task, input) {
  switch (task) {
    case "select-candidates":
      return buildSelectionPrompt(input);
    case "format-digest":
      return buildFormatPrompt(input);
    default:
      throw new Error(`Unsupported model task: ${task}`);
  }
}

function parseOpenClawOutput(raw) {
  const response = JSON.parse(raw);
  const text = response.outputs?.[0]?.text ?? response.text ?? response.output ?? "";
  if (!text) {
    throw new Error("OpenClaw model response did not include output text.");
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error(`OpenClaw model output was not valid JSON: ${error.message}`);
  }
}

function runOpenClaw(prompt, options) {
  const args = ["infer", "model", "run", "--json", "--thinking", options.thinking, "--prompt", prompt];
  if (options.transport === "gateway") {
    args.splice(4, 0, "--gateway");
  } else {
    args.splice(4, 0, "--local");
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  return execFileSync("openclaw", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function main(argv) {
  const options = parseArgs(argv);
  const input = readJson(options.input);
  const prompt = buildPrompt(options.task, input);
  const raw = runOpenClaw(prompt, options);
  const parsed = parseOpenClawOutput(raw);
  writeJson(options.output, parsed);
}

export const internals = {
  parseArgs,
  buildPrompt,
  parseOpenClawOutput,
};
