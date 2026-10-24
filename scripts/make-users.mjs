#!/usr/bin/env node
/**
 * Guest accounts for the site sign-in (e.g. the retailer's team), without passwords ever being
 * printed or committed.
 *
 *   node scripts/make-users.mjs hornbach-1 hornbach-2 hornbach-3 --days 30
 *   node scripts/make-users.mjs --list
 *   node scripts/make-users.mjs --remove hornbach-2
 *
 * - Each new account gets a strong random password. Only its scrypt hash goes into .env.local
 *   (SITE_LOGIN_USERS); the passwords go to accounts-for-sharing.txt (gitignored, readable only by
 *   you) with the site address and the last day of access — open it and send each person theirs.
 * - Re-running for an existing name gives it a new password (the old one stops working).
 * - Then upload: node scripts/push-env.mjs   (and redeploy).
 */
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV = new URL("../.env.local", import.meta.url);
const OUT = new URL("../accounts-for-sharing.txt", import.meta.url);
const SITE = process.env.PUBLIC_BASE_URL || "https://blueprint-walletloop.vercel.app";
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 }; // same as src/lib/siteLogin.ts
const LOGIN = /^[a-z0-9][a-z0-9._@-]{1,39}$/;

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const names = args.filter((a, i) => !a.startsWith("--") && !["--days", "--until", "--remove"].includes(args[i - 1])).map((a) => a.toLowerCase());

const envText = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
const current = (envText.match(/^SITE_LOGIN_USERS=(.*)$/m)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const byLogin = new Map(current.map((e) => [e.split(":")[0], e]));

function save(entries) {
  const line = `SITE_LOGIN_USERS=${entries.join(",")}`;
  const next = /^SITE_LOGIN_USERS=.*$/m.test(envText)
    ? envText.replace(/^SITE_LOGIN_USERS=.*$/m, line)
    : `${envText.replace(/\n*$/, "\n")}\n# Guest accounts (scripts/make-users.mjs) — hashes only, no passwords:\n${line}\n`;
  writeFileSync(ENV, next);
  chmodSync(ENV, 0o600);
}

if (args.includes("--list")) {
  if (!byLogin.size) console.log("No guest accounts.");
  for (const e of byLogin.values()) {
    const [login, , , until] = e.split(":");
    console.log(`${login.padEnd(24)} ${until ? `until ${until}` : "no end date"}`);
  }
  process.exit(0);
}

const remove = flag("--remove");
if (remove) {
  if (!byLogin.delete(remove.toLowerCase())) {
    console.error(`No account named ${remove}.`);
    process.exit(1);
  }
  save([...byLogin.values()]);
  console.log(`Removed ${remove}. Run node scripts/push-env.mjs and redeploy — they're signed out everywhere.`);
  process.exit(0);
}

if (!names.length) {
  console.error("Name the accounts, e.g.: node scripts/make-users.mjs hornbach-1 hornbach-2 --days 30");
  process.exit(1);
}
const bad = names.filter((n) => !LOGIN.test(n));
if (bad.length) {
  console.error(`Invalid name(s): ${bad.join(", ")} — use lowercase letters, digits, . _ @ - (2–40 characters).`);
  process.exit(1);
}

const days = Number(flag("--days") ?? 30);
const until = flag("--until") ?? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
  console.error("--until must be YYYY-MM-DD");
  process.exit(1);
}

// Readable but strong: 3 groups of 5 from an alphabet without look-alikes (≈ 75 bits).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const password = () => Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");

const lines = [];
for (const login of names) {
  const pw = password();
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString("base64url");
  byLogin.set(login, `${login}:${salt}:${hash}:${until}`);
  lines.push(`${login}\n  password: ${pw}\n  valid until: ${until} (end of day, UTC)\n`);
}
save([...byLogin.values()]);

const header = `Blueprint — access for guests\nSite: ${SITE}\nSign in with the user name and password below. Created ${new Date().toISOString().slice(0, 10)}.\n\n`;
const previous = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/^Blueprint — access[\s\S]*?\n\n/, "") : "";
const kept = previous.split(/\n(?=[a-z0-9][a-z0-9._@-]+\n {2}password:)/).filter((b) => b.trim() && !names.includes(b.split("\n")[0].trim()));
writeFileSync(OUT, header + [...kept.map((b) => b.trimEnd() + "\n"), ...lines].join("\n"));
chmodSync(OUT, 0o600);

console.log(`✓ ${names.length} account(s): ${names.join(", ")} — valid until ${until}`);
console.log(`✓ Passwords are in accounts-for-sharing.txt (not printed, gitignored). Hashes are in .env.local.`);
console.log(`Next: node scripts/push-env.mjs   then redeploy.`);
