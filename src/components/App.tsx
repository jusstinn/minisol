"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import Entry from "./entry/Entry";
import type { MemberSummary } from "./entry/WalletPass";
import Workspace from "./workspace/Workspace";
import { clearSaved, useSavedSummary } from "@/lib/savedSession";
import { clearPendingShare, readPendingShare, stashIncomingShare } from "@/lib/shareLink";
import IncomingShare from "./entry/IncomingShare";
import { setUsageTenant, trackOnce } from "@/lib/track";

export default function App({
  tenant,
  initialMember,
  passMember,
  initialLang,
  account,
  isOwner = false,
}: {
  tenant: Tenant;
  initialMember?: string;
  /** Product mode: the member from the signed pass-link session (no demo picker). */
  passMember?: MemberSummary;
  initialLang?: Lang;
  /** Signed in through the site sign-in as this account: shown with "Sign out" on the start screen. */
  account?: string;
  /** That account is the owner's: a link to the usage page. */
  isOwner?: boolean;
}) {
  const [members, setMembers] = useState<MemberSummary[]>(passMember ? [passMember] : []);
  const [memberId, setMemberId] = useState<string | undefined>(passMember?.memberId ?? initialMember);
  const [lang, setLang] = useState<Lang>(initialLang ?? "ro");
  const [session, setSession] = useState<{ prompt: string; key: number; resume?: boolean; shared?: string; tour?: boolean } | null>(null);
  const saved = useSavedSummary(tenant.id, memberId);
  const fromPass = Boolean(passMember);
  // A project sent from another device ("#p=…" link) waits here until the member is known.
  const [incoming, setIncoming] = useState<string | null>(null);
  useEffect(() => {
    stashIncomingShare();
    const token = readPendingShare();
    if (token) queueMicrotask(() => setIncoming(token));
    setUsageTenant(tenant.id);
    trackOnce("visit", { entry: token ? "share" : fromPass ? "pass" : "landing", device: matchMedia("(max-width: 767px)").matches ? "phone" : "desktop", lang });
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The demo members: retried twice quietly (a busy venue Wi-Fi), then a "try again" on the card.
  const [membersFailed, setMembersFailed] = useState(false);
  const [loadSeq, setLoadSeq] = useState(0);
  useEffect(() => {
    if (fromPass) return;
    let cancelled = false;
    const load = async (attempt: number): Promise<void> => {
      try {
        const r = await fetch(`/api/members?tenant=${tenant.id}`);
        const d = (await r.json().catch(() => null)) as { members?: MemberSummary[] } | null;
        if (!r.ok || !Array.isArray(d?.members) || !d.members.length) throw new Error(`members ${r.status}`);
        if (cancelled) return;
        setMembers(d.members);
        setMembersFailed(false);
        const initial = d.members.find((m) => m.memberId === initialMember) ?? d.members[0];
        setMemberId(initial.memberId);
        setLang(initial.language);
      } catch {
        if (cancelled) return;
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
          if (!cancelled) return load(attempt + 1);
        } else setMembersFailed(true);
      }
    };
    void load(0);
    return () => {
      cancelled = true;
    };
  }, [tenant.id, initialMember, fromPass, loadSeq]);

  const member = useMemo(() => members.find((m) => m.memberId === memberId), [members, memberId]);

  const style = { "--accent": tenant.accent, "--on-accent": tenant.onAccent } as React.CSSProperties;

  return (
    // Respect the OS "reduce motion" setting in every motion animation (CSS ones: globals.css).
    <MotionConfig reducedMotion="user">
    <div style={style} className="min-h-dvh" data-app-root>
      <AnimatePresence mode="wait">
        {!session || !member ? (
          // A short, plain fade: the workspace (often a whole restored session) mustn't wait behind a long blurred exit.
          <motion.div key="entry" exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <Entry
              account={account}
              isOwner={isOwner}
              membersFailed={membersFailed}
              onRetryMembers={() => {
                setMembersFailed(false);
                setLoadSeq((n) => n + 1);
              }}
              tenant={tenant}
              members={members}
              member={member}
              fromPass={fromPass}
              lang={lang}
              onLang={setLang}
              onSelect={(m) => {
                setMemberId(m.memberId);
                setLang(m.language);
              }}
              onStart={(prompt) => setSession({ prompt, key: Date.now() })}
              onTour={() => setSession({ prompt: "", key: Date.now(), tour: true })}
              saved={saved}
              onResume={() => setSession({ prompt: "", key: Date.now(), resume: true })}
              onForget={() => memberId && clearSaved(tenant.id, memberId)}
            />
          </motion.div>
        ) : (
          <motion.div key={`ws-${session.key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <Workspace
              tenant={tenant}
              member={member}
              lang={lang}
              onLang={setLang}
              initialPrompt={session.prompt}
              resume={session.resume}
              shared={session.shared}
              tour={session.tour}
              onExit={() => setSession(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {incoming && !session && (
        <IncomingShare
          token={incoming}
          lang={lang}
          memberName={member?.firstName}
          onOpen={(snap) => {
            if (snap) setLang(snap.lang);
            clearPendingShare();
            setIncoming(null);
            setSession({ prompt: "", key: Date.now(), shared: incoming });
          }}
          onDismiss={() => {
            clearPendingShare();
            setIncoming(null);
          }}
        />
      )}
    </div>
    </MotionConfig>
  );
}
