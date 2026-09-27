"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/domain/types";

const noopSubscribe = () => () => {};

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/** Browser speech-to-text (Chrome, Edge, Safari). `supported` is false elsewhere. */
export function useDictation(lang: Lang, onText: (text: string) => void) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => {
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );
  const [listening, setListening] = useState(false);
  const rec = useRef<RecognitionLike | null>(null);
  const base = useRef("");

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(
    (current: string) => {
      const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
      const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!Ctor) return;
      const r = new Ctor();
      r.lang = lang === "en" ? "en-GB" : "ro-RO";
      r.interimResults = true;
      r.continuous = false;
      base.current = current ? current.trimEnd() + " " : "";
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        onText(base.current + text);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      r.start();
      setListening(true);
    },
    [lang, onText],
  );

  return { supported, listening, start, stop };
}
