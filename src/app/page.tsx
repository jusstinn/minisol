import App from "@/components/App";
import { getTenant } from "@/config/tenant";

export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const retailer = typeof sp.retailer === "string" ? sp.retailer : undefined;
  const member = typeof sp.member === "string" ? sp.member : undefined;
  return <App tenant={getTenant(retailer)} initialMember={member} />;
}
