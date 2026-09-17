// src/components/marketing/stat-counter.tsx
"use client";
import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

export function StatCounter({ valor, sufixo = "" }: { valor: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visivel = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const mola = useSpring(mv, { damping: 40, stiffness: 120 });

  useEffect(() => {
    if (visivel) mv.set(valor);
  }, [visivel, valor, mv]);

  useEffect(
    () => mola.on("change", (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString("pt-BR") + sufixo;
    }),
    [mola, sufixo],
  );

  return <span ref={ref} className="font-mono tabular text-4xl font-semibold text-primary">0{sufixo}</span>;
}
