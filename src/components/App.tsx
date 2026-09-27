"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import Entry from "./entry/Entry";
import type { MemberSummary } from "./entry/WalletPass";
import Workspace from "./workspace/Workspace";

export default function App({ tenant, initialMember }: { tenant: Tenant; initialMember?: string }) {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [memberId, setMemberId] = useState<string | undefined>(initialMember);
  const [lang, setLang] = useState<Lang>("ro");
  const [session, setSession] = useState<{ prompt: string; key: number } | null>(null);

  useEffect(() => {
    fetch(`/api/members?tenant=${tenant.id}`)
      .then((r) => r.json())
      .then((d: { members: MemberSummary[] }) => {
        setMembers(d.members);
        const initial = d.members.find((m) => m.memberId === initialMember) ?? d.members[0];
        if (initial) {
          setMemberId(initial.memberId);
          setLang(initial.language);
        }
      })
      .catch(() => {});
  }, [tenant.id, initialMember]);

  const member = useMemo(() => members.find((m) => m.memberId === memberId), [members, memberId]);

  const style = { "--accent": tenant.accent, "--on-accent": tenant.onAccent } as React.CSSProperties;

  return (
    <div style={style} className="min-h-dvh">
      <AnimatePresence mode="wait">
        {!session || !member ? (
          <motion.div key="entry" exit={{ opacity: 0, y: -24, filter: "blur(6px)" }} transition={{ duration: 0.45, ease: [0.7, 0, 0.84, 0] }}>
            <Entry
              tenant={tenant}
              members={members}
              member={member}
              lang={lang}
              onLang={setLang}
              onSelect={(m) => {
                setMemberId(m.memberId);
                setLang(m.language);
              }}
              onStart={(prompt) => setSession({ prompt, key: Date.now() })}
            />
          </motion.div>
        ) : (
          <motion.div key={`ws-${session.key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <Workspace
              tenant={tenant}
              member={member}
              lang={lang}
              onLang={setLang}
              initialPrompt={session.prompt}
              onExit={() => setSession(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
