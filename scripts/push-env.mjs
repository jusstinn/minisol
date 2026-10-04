#!/usr/bin/env node
/**
 * Copy the demo's secrets from .env.local to the Vercel project, without printing them.
 *
 *   npx vercel login                 # once, opens the browser
 *   node scripts/push-env.mjs --check  # only checks .env.local (shows the user name, never the password or key)
 *   node scripts/push-env.mjs        # uploads OPENAI_API_KEY, SITE_LOGIN_USER, SITE_LOGIN_PASSWORD
 *
 * Each value goes to Production as a Sensitive variable (write-only in the dashboard), replacing any
 * existing one. Values travel over stdin to the official Vercel CLI — never on the command line.
 * Options: --project <name> (default blueprint-walletloop).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const KEYS = ["OPENAI_API_KEY", "SITE_LOGIN_USER", "SITE_LOGIN_PASSWORD"];
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const project = arg("--project", "blueprint-walletloop");
const scope = arg("--scope", "justin-stoicas-projects");

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const problems = [];
if (!env.OPENAI_API_KEY?.startsWith("sk-")) problems.push("OPENAI_API_KEY is empty or doesn't look like an OpenAI key (sk-…)");
if (!env.SITE_LOGIN_USER) problems.push("SITE_LOGIN_USER is empty");
if (!env.SITE_LOGIN_PASSWORD || env.SITE_LOGIN_PASSWORD.length < 12) problems.push("SITE_LOGIN_PASSWORD is empty or shorter than 12 characters");
for (const k of KEYS) if (env[k] !== undefined && env[k] !== env[k].trim()) problems.push(`${k} has spaces at the start or end`);
if (problems.length) {
  console.error("Fix .env.local first:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log(`✓ OpenAI key: looks right (${env.OPENAI_API_KEY.length} characters, starts with ${env.OPENAI_API_KEY.slice(0, 8)}…)`);
  console.log(`✓ Sign-in user: ${env.SITE_LOGIN_USER}  (not case-sensitive)`);
  console.log(`✓ Sign-in password: ${env.SITE_LOGIN_PASSWORD.length} characters (case-sensitive — type it exactly)`);
  process.exit(0);
}

const vercel = (args, input) => spawnSync("npx", ["--yes", "vercel@latest", ...args, "--scope", scope], { input, encoding: "utf8", stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"] });

const who = vercel(["whoami"]);
if (who.status !== 0) {
  console.error("Not logged in to Vercel. Run `npx vercel login` first, then run this again.");
  process.exit(1);
}

let failed = 0;
for (const k of KEYS) {
  const r = vercel(["env", "add", k, "production", "--project", project, "--sensitive", "--force", "--yes"], env[k]);
  // The CLI never echoes the value; show only its status line.
  const msg = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").map((s) => s.trim()).filter((s) => /added|overwr|error|not found|exists/i.test(s)).pop() ?? "";
  if (r.status === 0) console.log(`✓ ${k} → ${project} (Production, sensitive)`);
  else {
    failed++;
    console.log(`✗ ${k}: ${msg || "failed"}`);
  }
}
if (failed) process.exit(1);
console.log(`\nDone. Redeploy ${project} so the new values take effect (or ask Claude to).`);
