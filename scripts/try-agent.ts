/**
 * Run one conversation turn against the real model from the terminal.
 *   npx tsx --env-file=.env.local scripts/try-agent.ts "Vreau o terasă de 4x3 m" [memberId] [model]
 */
import { getDataSources } from "../src/adapters";
import { OpenAIResponsesClient } from "../src/agent/llm";
import { runAgent } from "../src/agent/run";
import { getTenant } from "../src/config/tenant";

async function main() {
  const message = process.argv[2] ?? "Vreau să-mi fac o terasă din lemn de 4 x 3 m în curte, pe pământ.";
  const memberId = process.argv[3] ?? "WL-RO-100231";
  const model = process.argv[4] ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const tenant = getTenant("demo");
  const sources = getDataSources(tenant.id);
  const customer = (await sources.loyalty.getMember(memberId))!;
  const llm = new OpenAIResponsesClient(process.env.OPENAI_API_KEY!, model, "low");
  const t0 = Date.now();
  let first = 0;
  for await (const ev of runAgent({ llm, sources, tenant, customer, message, history: [], state: { basket: [] } })) {
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (ev.type === "text") {
      if (!first) { first = Date.now() - t0; process.stdout.write(`\n[${dt}s] TEXT: `); }
      process.stdout.write(ev.delta);
    } else if (ev.type === "status") console.log(`[${dt}s] ▸ ${ev.tool}`);
    else if (ev.type === "card") {
      const c = ev.card;
      const summary = c.kind === "quote" ? `${c.quote.lines.length} lines, total ${c.quote.total}, saved ${c.quote.discountTotal}, pts ${c.quote.points.earned}, allInStock ${c.quote.availability.allInStock}, owned ${c.owned.length}, sugg ${c.suggestions.length}`
        : c.kind === "plan" ? `${c.plan.steps.length} steps, ${c.plan.tips.length} tips` : c.kind === "project" ? c.project.title : "";
      console.log(`[${dt}s]   card:${c.kind} ${summary}`);
    } else if (ev.type === "error") console.log(`[${dt}s] ERROR ${ev.message}`);
    else if (ev.type === "done") console.log(`\n[${dt}s] DONE model=${model} tokens in=${ev.usage?.inputTokens} out=${ev.usage?.outputTokens} firstText=${(first / 1000).toFixed(1)}s`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
