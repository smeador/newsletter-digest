#!/usr/bin/env node

import { main } from "../lib/run/newsletter-digest-run.mjs";

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
