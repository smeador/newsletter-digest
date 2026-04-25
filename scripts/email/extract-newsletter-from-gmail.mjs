#!/usr/bin/env node

import { main } from "../../lib/extract/extract-newsletter-from-gmail.mjs";

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
