import { cookies } from "next/headers";
import { getDataSources } from "@/adapters";
import App from "@/components/App";
import PassRequired from "@/components/entry/PassRequired";
import { getTenant } from "@/config/tenant";
import { requirePassLink } from "@/lib/passToken";
import { memberSummary, sessionCookieName, verifySession } from "@/lib/session";

export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const retailer = typeof sp.retailer === "string" ? sp.retailer : undefined;
  const tenant = getTenant(retailer);

  if (requirePassLink()) {
    // Product mode: the member comes only from the session set by a signed pass link (src/proxy.ts).
    const lang = sp.lang === "en" ? "en" : "ro";
    const reason = sp.pass === "expired" ? "expired" : sp.pass === "invalid" ? "invalid" : undefined;
    const session = verifySession((await cookies()).get(sessionCookieName())?.value, tenant.id);
    if (!session) return <PassRequired tenant={tenant} initialLang={lang} reason={reason} />;
    const sources = getDataSources(tenant.id);
    const [customer, stores] = await Promise.all([sources.loyalty.getMember(session.memberId), sources.stores.list()]);
    if (!customer) return <PassRequired tenant={tenant} initialLang={session.lang ?? lang} reason="invalid" />;
    return <App tenant={tenant} passMember={memberSummary(customer, stores)} initialLang={session.lang ?? customer.language} />;
  }

  const member = typeof sp.member === "string" ? sp.member : undefined;
  return <App tenant={tenant} initialMember={member} />;
}
