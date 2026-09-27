import { getDataSources } from "@/adapters";
import { personaOf } from "@/adapters/demo";
import { getTenant } from "@/config/tenant";
import { LOYALTY } from "@/domain/loyalty";

/** Demo member picker (simulates arriving from a wallet-pass deep link). */
export async function GET(req: Request) {
  const tenant = getTenant(new URL(req.url).searchParams.get("tenant"));
  const sources = getDataSources(tenant.id);
  const [members, stores] = await Promise.all([sources.loyalty.listDemoMembers(), sources.stores.list()]);
  return Response.json({
    tenant,
    loyalty: { tierThresholds: LOYALTY.tierThresholds, pointValueRon: LOYALTY.pointValueRon },
    members: members.map((m) => ({
      memberId: m.memberId,
      firstName: m.firstName,
      tier: m.tier,
      points: m.points,
      language: m.language,
      city: m.location.city,
      homeStore: stores.find((s) => s.id === m.homeStoreId)?.name ?? m.homeStoreId,
      homeStoreId: m.homeStoreId,
      memberSince: m.memberSince,
      platform: m.walletPass.platform,
      personalization: m.consent.personalization,
      ...personaOf(m.memberId),
    })),
  });
}
