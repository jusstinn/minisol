import type { Metadata } from "next";
import { getDataSources } from "@/adapters";
import { executeTool } from "@/agent/tools";
import Pitch from "@/components/pitch/Pitch";
import type { ProjectExample } from "@/components/pitch/Pitch";
import { getTenant } from "@/config/tenant";
import { PROJECT_STARTERS } from "@/lib/i18n";
import { parseIntent } from "@/agent/scripted";

export const metadata: Metadata = {
  title: "Blueprint — the project agent for DIY retail",
  robots: { index: false, follow: false },
};

/** Real numbers for the pitch, computed by the same engine the agent uses. */
async function examples(tenantId: string): Promise<ProjectExample[]> {
  const sources = getDataSources(tenantId);
  // Member without personalisation → list prices, no member-specific offers.
  const customer = (await sources.loyalty.getMember("WL-RO-411902"))!;
  const out: ProjectExample[] = [];
  for (const s of PROJECT_STARTERS) {
    const intent = parseIntent(s.promptRo, { basket: [] });
    if (intent.kind !== "project" || intent.missing) continue;
    const r = await executeTool(
      "calculate_project",
      JSON.stringify({ projectType: intent.type, params: intent.params, quality: null, storeId: null, includeOptional: null }),
      { sources, customer, state: { basket: [] }, lang: "ro", now: new Date() },
    );
    const q = r.cards?.find((c) => c.kind === "quote");
    const p = r.cards?.find((c) => c.kind === "project");
    if (q?.kind !== "quote" || p?.kind !== "project") continue;
    out.push({
      id: s.id,
      icon: s.icon,
      labelRo: s.ro,
      labelEn: s.en,
      products: q.quote.lines.length,
      total: q.quote.total,
      hours: `${p.project.estimate.hoursMin}–${p.project.estimate.hoursMax}`,
    });
  }
  return out;
}

export default async function PitchPage({ searchParams }: PageProps<"/pitch">) {
  const sp = await searchParams;
  const tenant = getTenant(typeof sp.retailer === "string" ? sp.retailer : undefined);
  const lang = sp.lang === "en" ? "en" : "ro";
  return <Pitch tenant={tenant} lang={lang} examples={await examples(tenant.id)} />;
}
