import { redirect } from "next/navigation";
import LoginForm from "@/components/entry/LoginForm";
import { getTenant } from "@/config/tenant";
import { safeNext, siteLogin } from "@/lib/siteLogin";

export const metadata = { title: "Sign in — Blueprint" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!siteLogin()) redirect("/");
  const sp = await searchParams;
  const tenant = getTenant(typeof sp.retailer === "string" ? sp.retailer : undefined);
  return <LoginForm tenant={tenant} next={safeNext(sp.next)} initialLang={sp.lang === "en" ? "en" : "ro"} />;
}
