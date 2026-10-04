"use client";

import { Component } from "react";
import type { ReactNode } from "react";

/**
 * Keeps a 3D failure (no WebGL, a lost GPU context, a bad model) inside the sketch panel: the
 * list, the plan and the chat keep working. Tries again when `resetKey` changes (a new build).
 */
export default class SceneBoundary extends Component<{ children: ReactNode; resetKey?: unknown; en?: boolean; dark?: boolean }, { failed: boolean; key?: unknown }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { failed: boolean; key?: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    console.warn("[sketch] 3D view failed:", error instanceof Error ? error.message : error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { en, dark } = this.props;
    return (
      <div className={`grid h-full w-full place-items-center p-6 text-center ${dark ? "text-[#dce9ff]" : "text-ink-2"}`}>
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] opacity-70">{en ? "3D sketch" : "Schiță 3D"}</div>
          <p className="mt-2 max-w-[320px] text-[14px] leading-snug">
            {en ? "The 3D view isn't available on this device — the list, prices and plan are all here." : "Vederea 3D nu e disponibilă pe acest dispozitiv — lista, prețurile și planul sunt toate aici."}
          </p>
          <button onClick={() => this.setState({ failed: false })} className="mt-3 rounded-full border border-current px-3 py-1 font-mono text-[11px] uppercase tracking-wider">
            {en ? "Try again" : "Reîncearcă"}
          </button>
        </div>
      </div>
    );
  }
}
