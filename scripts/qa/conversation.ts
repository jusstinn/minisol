/**
 * Replay a conversation against the offline (scripted) agent with the real tools — no LLM, no server.
 *   npx tsx scripts/qa/conversation.ts WL-RO-100231 "Vreau o terasă de 4 x 3 m" "adaugă 3 trepte în față" "anulează"
 * Prints each reply with its cards and the verified-amounts badge. QA_TENANT=hornbach picks another tenant.
 */
import { getDataSources } from "@/adapters";
import { runScriptedAgent } from "@/agent/scripted";
import type { AgentEvent, SessionState } from "@/agent/types";
import { getTenant } from "@/config/tenant";

async function main() {
  const [member, ...msgs] = process.argv.slice(2);
  const tenant = getTenant(process.env.QA_TENANT ?? "demo");
  const sources = getDataSources(tenant.id);
  const customer = (await sources.loyalty.getMember(member))!;
  let state: SessionState = { basket: [] };
  let history: unknown[] = [];
  for (const message of msgs) {
    const events: AgentEvent[] = [];
    for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang: customer.language, history })) events.push(ev);
    for (const e of events) {
      if (e.type === "state") state = e.state;
      if (e.type === "history") history = e.items;
    }
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    const cards = events.filter((e) => e.type === "card").map((e) => (e as { card: { kind: string } }).card.kind);
    const v = events.find((e) => e.type === "verified") as { ok: boolean; checked: number } | undefined;
    const err = events.filter((e) => e.type === "error");
    console.log(`> ${message}\n  [${cards.join(",")}] ${v ? `✓${v.checked}${v.ok ? "" : " FAILED"}` : ""} ${err.length ? "ERROR " + JSON.stringify(err) : ""} ${text}\n`);
  }
}
void main();
