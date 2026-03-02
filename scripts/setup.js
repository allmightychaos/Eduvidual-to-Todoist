#!/usr/bin/env node
// scripts/setup.js
// One-time setup: creates the KV namespace and patches wrangler.toml with the real ID.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tomlPath = join(__dirname, "..", "wrangler.toml");

// Check first — avoid creating an orphaned namespace on re-runs
const toml = readFileSync(tomlPath, "utf8");
if (!toml.includes('id = "PLACEHOLDER"')) {
    console.log("wrangler.toml already contains a real KV namespace ID. Nothing to do.");
    console.log("If you want to re-run setup, manually restore 'id = \"PLACEHOLDER\"' in wrangler.toml first.");
    process.exit(0);
}

console.log("Creating KV namespace SYNC_STATE...");

let output;
try {
    output = execSync("npx wrangler kv namespace create SYNC_STATE", {
        encoding: "utf8",
        stdio: ["inherit", "pipe", "inherit"],
    });
} catch (err) {
    console.error("Failed to create KV namespace. Make sure you are logged in with `npx wrangler login`.");
    process.exit(1);
}

const match = output.match(/id\s*=\s*"([^"]+)"/);
if (!match) {
    console.error("Could not parse namespace ID from wrangler output:");
    console.error(output);
    process.exit(1);
}

const namespaceId = match[1];
console.log(`Namespace ID: ${namespaceId}`);

const patched = toml.replace('id = "PLACEHOLDER"', `id = "${namespaceId}"`);
writeFileSync(tomlPath, patched, "utf8");

console.log("wrangler.toml updated with real KV namespace ID.");
console.log("");
console.log("Next steps:");
console.log("  npx wrangler secret put EDUVIDUAL_ICAL_URL");
console.log("  npx wrangler secret put TODOIST_API_TOKEN");
console.log("  npx wrangler secret put TODOIST_PROJECT_ID   # optional");
console.log("  npx wrangler secret put STATUS_PASSWORD       # optional");
console.log("  npx wrangler deploy");
