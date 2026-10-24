import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/icons";
import { loginCookieName, loginSession, parseGuests, siteLogin } from "@/lib/siteLogin";
import { COUNTED, usageByAccount } from "@/lib/usageCounters";
import type { Counted } from "@/lib/usageCounters";

export const metadata = { title: "Usage — Blueprint", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<Counted, string> = { login: "Sign-ins", visit: "Visits", project_started: "Projects", sketch_edited: "Sketch changes", reserved: "Reservations" };

/** For the owner only: did the invited accounts sign in, and what did they do (counts, last 14 days)? */
export default async function AdminPage() {
  const login = siteLogin();
  if (!login) notFound();
  const me = loginSession(login, (await cookies()).get(loginCookieName())?.value);
  const owner = login.accounts.find((a) => a.kind === "owner");
  if (!me || !owner || me.account !== owner.login) notFound();

  const guests = parseGuests(process.env.SITE_LOGIN_USERS);
  const names = [...guests.map((g) => g.login), owner.login];
  const usage = await usageByAccount(names, 14);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="paper-grid min-h-dvh px-4 py-6 sm:px-8">
      <header className="flex items-center gap-3">
        <Logo className="text-ink" />
        <span className="display text-[19px] leading-none">Blueprint</span>
        <span className="label">Usage · last 14 days</span>
      </header>
      <main className="mx-auto mt-8 max-w-[1000px]">
        <h1 className="display text-[clamp(30px,4vw,48px)] text-ink">Who tried it</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-ink-2">
          Counts per invited account (no messages, no project contents). An account&apos;s visits on one device in one page load count once.
        </p>
        {!usage ? (
          <div className="mt-6 rounded-[18px] border border-dashed border-ink/25 bg-card/80 p-5 text-[14.5px] text-ink-2">
            <b className="text-ink">Not recording yet.</b> These numbers need a shared store that survives deploys: in Vercel, open this project →
            <b> Storage → Upstash Redis</b> (free tier) → connect it, then redeploy. Counting starts from then.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[18px] border border-rule bg-card">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
                <tr className="border-b border-rule">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Access until</th>
                  {COUNTED.map((e) => (
                    <th key={e} className="px-4 py-3 text-right">
                      {LABEL[e]}
                    </th>
                  ))}
                  <th className="px-4 py-3">Last active</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => {
                  const g = guests.find((x) => x.login === u.account);
                  const ended = g?.until && g.until < today;
                  return (
                    <tr key={u.account} className="border-b border-rule last:border-0">
                      <td className="px-4 py-3 font-semibold text-ink">
                        {u.account}
                        {!g && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">you</span>}
                      </td>
                      <td className={`px-4 py-3 font-mono text-[12.5px] ${ended ? "text-bad" : "text-ink-2"}`}>{g ? (g.until ?? "no end") : "—"}{ended ? " (ended)" : ""}</td>
                      {COUNTED.map((e) => (
                        <td key={e} className={`px-4 py-3 text-right font-mono tabular-nums ${u.totals[e] ? "text-ink" : "text-ink-3"}`}>
                          {u.totals[e]}
                        </td>
                      ))}
                      <td className="px-4 py-3 font-mono text-[12.5px] text-ink-2">{u.lastActive ?? "never"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {usage?.some((u) => u.days.length) && (
          <section className="mt-8">
            <h2 className="label mb-3">By day</h2>
            <div className="grid gap-2">
              {usage
                .flatMap((u) => u.days.map((d) => ({ account: u.account, ...d })))
                .sort((a, b) => b.day.localeCompare(a.day))
                .slice(0, 60)
                .map((d) => (
                  <div key={`${d.account}-${d.day}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-rule bg-card/85 px-4 py-2 text-[13.5px]">
                    <span className="font-mono text-[12.5px] text-ink-3">{d.day}</span>
                    <span className="font-semibold text-ink">{d.account}</span>
                    {COUNTED.filter((e) => d.counts[e]).map((e) => (
                      <span key={e} className="text-ink-2">
                        {d.counts[e]} {LABEL[e].toLowerCase()}
                      </span>
                    ))}
                  </div>
                ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
