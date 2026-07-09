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
    agent: process.env.NEWSLETTER_DIGEST_OPENCLAW_AGENT || "main",
    agentTimeoutSeconds: process.env.NEWSLETTER_DIGEST_OPENCLAW_AGENT_TIMEOUT_SECONDS || "900",
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
      case "--agent":
        options.agent = next ?? "";
        i += 1;
        break;
      case "--agent-timeout-seconds":
        options.agentTimeoutSeconds = next ?? "";
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
  if (!options.agent) throw new Error("OpenClaw agent id is required.");
  parsePositiveInt(options.agentTimeoutSeconds, "--agent-timeout-seconds");

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
  --agent ID                  OpenClaw agent for format-digest (default: main)
  --agent-timeout-seconds N   Agent timeout for format-digest (default: 900)
`);
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
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

function parsePositiveEnvInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function formatterSkillPath() {
  return resolve(packageRoot(), "skills/newsletter-digest-format/SKILL.md");
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

function buildExtraSelectionPrompt(input) {
  return [
    "You are selecting extra newsletter items for a deterministic digest runner.",
    "Return only valid JSON. Do not use markdown.",
    "Choose up to maxSelected candidates from the provided list.",
    "A candidate is eligible only when its date is on or after the cutoff timestamp.",
    "Prefer items that match the configured collection title, section type, and item rules.",
    "It is valid to return an empty selectedMessageIds array when no candidate belongs in the collection.",
    "Do not invent message ids.",
    "",
    "Required output shape:",
    '{"selectedMessageIds":["MESSAGE_ID"],"reason":"short plain text"}',
    "",
    "Input JSON:",
    JSON.stringify(input),
  ].join("\n");
}

function buildRepairDigestJsonPrompt(input) {
  return [
    "You repair malformed newsletter digest JSON.",
    "Return only one valid JSON object. Do not use markdown.",
    "Preserve the content, wording, keys, ordering, and URLs from malformedOutput.",
    "Only fix JSON syntax problems such as unescaped quotes, invalid control characters, or trailing text.",
    "Do not summarize, add, remove, rewrite, or re-rank stories.",
    "",
    "Parse error:",
    String(input.parseError || ""),
    "",
    "Expected digest identity:",
    JSON.stringify(input.expectedDigest ?? {}),
    "",
    "Malformed output:",
    String(input.malformedOutput || ""),
  ].join("\n");
}

function buildFormatAgentMessage(options) {
  return [
    "Run the newsletter digest formatter task.",
    "",
    "Use the formatter skill instructions at:",
    formatterSkillPath(),
    "",
    "Read the selected, cleaned formatter input JSON from:",
    options.input,
    "",
    "Write the final digest JSON to:",
    options.output,
    "",
    "Requirements:",
    "- Read the input file from disk instead of asking for it in chat.",
    "- Use only the selected source material in that input file.",
    "- Do not search Gmail, browse, retrieve additional sources, render HTML, or send email.",
    "- Write exactly one valid JSON object to the output path.",
    "- Do not wrap the JSON in Markdown.",
    "- After writing the file, reply briefly with the output path.",
  ].join("\n");
}

function buildPrompt(task, input) {
  switch (task) {
    case "select-candidates":
      return buildSelectionPrompt(input);
    case "select-extra-candidates":
      return buildExtraSelectionPrompt(input);
    case "repair-digest-json":
      return buildRepairDigestJsonPrompt(input);
    case "format-digest":
      throw new Error("format-digest uses the OpenClaw agent file handoff, not a direct model prompt.");
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
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const maxPromptBytes = parsePositiveEnvInt("NEWSLETTER_DIGEST_MAX_PROMPT_BYTES", 120000);
  if (promptBytes > maxPromptBytes) {
    throw new Error(
      `OpenClaw prompt is ${promptBytes} bytes, above argv-safe limit ${maxPromptBytes}. ` +
        "Reduce candidate caps or NEWSLETTER_DIGEST_MAX_PROMPT_BYTES.",
    );
  }
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

function runOpenClawAgent(message, options) {
  const args = [
    "agent",
    "--agent",
    options.agent,
    "--message",
    message,
    "--json",
    "--thinking",
    options.thinking,
    "--timeout",
    String(parsePositiveInt(options.agentTimeoutSeconds, "--agent-timeout-seconds")),
    "--session-id",
    `newsletter-digest-format-${Date.now()}`,
  ];
  if (options.transport === "local") {
    args.push("--local");
  }
  return execFileSync("openclaw", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      NEWSLETTER_DIGEST_MODEL_TASK: options.task,
      NEWSLETTER_DIGEST_MODEL_INPUT: options.input,
      NEWSLETTER_DIGEST_MODEL_OUTPUT: options.output,
    },
  });
}

function parseAgentFallbackOutput(raw) {
  const response = JSON.parse(raw);
  const text = response.text ?? response.output ?? response.reply ?? response.message ?? response.final ?? "";
  if (!text) {
    throw new Error("OpenClaw agent response did not include output text and did not write the output file.");
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error(`OpenClaw agent output was not valid JSON: ${error.message}`);
  }
}

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.task === "format-digest") {
    const message = buildFormatAgentMessage(options);
    const raw = runOpenClawAgent(message, options);
    if (!existsSync(options.output)) {
      writeJson(options.output, parseAgentFallbackOutput(raw));
    } else {
      readJson(options.output);
    }
    return;
  }
  const input = readJson(options.input);
  const prompt = buildPrompt(options.task, input);
  const raw = runOpenClaw(prompt, options);
  const parsed = parseOpenClawOutput(raw);
  writeJson(options.output, parsed);
}

export const internals = {
  parseArgs,
  buildPrompt,
  buildRepairDigestJsonPrompt,
  buildFormatAgentMessage,
  parseOpenClawOutput,
  parseAgentFallbackOutput,
  parsePositiveEnvInt,
};
