"use client";

import { useEffect, useRef, useState } from "react";
import { bus } from "@/lib/render/bus";

export default function NarratorPanel() {
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handle = async ({ topic, context }: { topic: string; context: string }) => {
      abortRef.current?.abort();
      if (hideTimer.current) clearTimeout(hideTimer.current);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setText("");
      setVisible(true);
      try {
        const res = await fetch("/api/narrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic, context }),
          signal: ctrl.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          setText((t) => t + decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setText("(the world falls quiet)");
        }
      } finally {
        hideTimer.current = setTimeout(() => setVisible(false), 12_000);
      }
    };

    bus.on("narration:request", handle);
    return () => {
      bus.off("narration:request", handle);
      abortRef.current?.abort();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4">
      <div className="pointer-events-auto max-w-md rounded-xl border border-[var(--color-border)] bg-black/70 px-4 py-3 text-sm leading-relaxed text-[var(--color-fg)] backdrop-blur-md">
        {text || "…"}
      </div>
    </div>
  );
}
