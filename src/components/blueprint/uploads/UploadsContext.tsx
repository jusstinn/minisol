"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { UploadsStore } from "@/lib/uploads/store";

/**
 * Makes "bring your own plans and models" available to the sketch without threading props
 * through Board / MobilePanels: the workspace provides where files are kept (retailer +
 * member + project) and how a confirmed AI reading goes into the chat.
 */

export interface UploadsEnv {
  store: UploadsStore;
  /** Send a normal chat message (the customer confirms AI-read sizes by tapping them). */
  onSend?: (text: string) => void;
  /** The assistant is answering (chips wait). */
  busy?: boolean;
  /** Offline demo: no AI plan reading. */
  offline?: boolean;
}

const Ctx = createContext<UploadsEnv | null>(null);

/** Null outside a workspace (e.g. the pitch page): uploads are simply not offered there. */
export const useUploadsEnv = () => useContext(Ctx);

export function UploadsProvider({
  tenant,
  memberId,
  project,
  onSend,
  busy,
  offline,
  children,
}: {
  tenant: string;
  memberId: string;
  /** Stable id of the current project (the first message of the saved conversation). */
  project?: string;
  onSend?: (text: string) => void;
  busy?: boolean;
  offline?: boolean;
  children: React.ReactNode;
}) {
  const [store] = useState(() => new UploadsStore());
  useEffect(() => {
    store.configure({ scope: `${tenant}:${memberId}`, project, tenant, offline });
  }, [store, tenant, memberId, project, offline]);

  // Free the model's GPU buffers and the plan's object URL when the workspace goes
  // (deferred, so React's dev double-mount doesn't dispose a store that is still in use).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) store.dispose();
      }, 0);
    };
  }, [store]);

  return <Ctx.Provider value={{ store, onSend, busy, offline }}>{children}</Ctx.Provider>;
}
