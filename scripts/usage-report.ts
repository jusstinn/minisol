/**
 * Pilot report from usage events.
 *
 *   npx tsx scripts/usage-report.ts logs.txt [more.txt …]   # exported server logs
 *   vercel logs <deployment> | npx tsx scripts/usage-report.ts
 *   npx tsx scripts/usage-report.ts logs.txt --json
 *
 * Reads lines containing `[usage] {...}` (or bare JSON records) and prints the funnel, what
 * people build and change, and how fast the assistant answers. Events carry no personal data.
 */
import { readFileSync } from "node:fs";
import { parseUsageLines, summarizeUsage } from "../src/lib/usageReport";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const files = args.filter((a) => !a.startsWith("--"));
const text = files.length ? files.map((f) => readFileSync(f, "utf8")).join("\n") : readFileSync(0, "utf8");
const records = parseUsageLines(text);
const s = summarizeUsage(records);

if (asJson) {
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}

const pad = (v: string | number, n: number) => String(v).padStart(n);
const list = (m: Record<string, number>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ") || "—";

console.log(`\n${records.length} events · ${s.visits} visits\n`);
console.log("Funnel");
for (const f of s.funnel) console.log(`  ${f.step.padEnd(22)} ${pad(f.visits, 6)}  ${pad(f.share.toFixed(1), 5)}%`);
console.log(`\nEntry     ${list(s.byEntry)}`);
console.log(`Device    ${list(s.byDevice)}`);
console.log(`Projects  ${list(s.projects)}`);
console.log(`Edits     ${s.edits.total} (${list(s.edits.byVia)})`);
console.log(`  top ops ${s.edits.topOps.map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}`);
console.log(`List      ${list(s.basket)}`);
const r = s.replies;
console.log(
  `Replies   ${r.total} (live ${r.live}, offline ${r.scripted}) · median ${r.medianMs ?? "—"} ms · p90 ${r.p90Ms ?? "—"} ms · errors ${r.errors}`,
);
console.log(`Reserved  ${s.reservations.total} (pickup ${s.reservations.pickup}, delivery ${s.reservations.delivery}, paid with points ${s.reservations.redeemedPoints})`);
console.log(`Other     ${list(s.other)}\n`);
