/**
 * Print the priced basket for a project without the LLM.
 *   npx tsx scripts/inspect-project.ts deck '{"lengthM":4,"widthM":3}' [memberId] [quality]
 */
import { getDataSources } from "../src/adapters";
import { executeTool } from "../src/agent/tools";

async function main() {
  const [type = "deck", params = '{"lengthM":4,"widthM":3}', memberId = "WL-RO-100231", quality = "standard"] = process.argv.slice(2);
  const sources = getDataSources("demo");
  const customer = (await sources.loyalty.getMember(memberId))!;
  const r = await executeTool(
    "calculate_project",
    JSON.stringify({ projectType: type, params: JSON.parse(params), quality, storeId: null, includeOptional: null }),
    { sources, customer, state: { basket: [] }, lang: "ro", now: new Date() },
  );
  const q = r.cards?.find((c) => c.kind === "quote");
  if (!q || q.kind !== "quote") return console.log(JSON.stringify(r.forModel, null, 2));
  for (const l of q.quote.lines) {
    console.log(
      `${String(l.qty).padStart(4)} × ${l.name.padEnd(64).slice(0, 64)} ${l.unitPrice.toFixed(2).padStart(8)} = ${l.lineTotal.toFixed(2).padStart(9)}  ${l.stock.status}(${l.stock.available})  ${l.basis ?? ""}`,
    );
  }
  console.log("subtotal", q.quote.subtotal, "total", q.quote.total);
  console.log("discounts", q.quote.discounts.map((d) => `${d.title}: ${d.amount}`));
  console.log("points", q.quote.points);
  console.log("alternatives", q.quote.availability.alternatives.map((a) => `${a.name} ${a.distanceKm}km all=${a.allInStock} missing=${a.missingCount}`));
  console.log("suggestions", q.suggestions.map((s) => `${s.qty}× ${s.name} ${s.total}`));
  console.log("owned", q.owned.map((o) => o.roleLabel));
}
main();
