// src/components/marketing/alternador-preco.tsx
"use client";
import { motion } from "motion/react";

export function AlternadorPreco({ anual, onChange }: { anual: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" role="switch" aria-checked={anual} aria-label="Cobrança anual"
        onClick={() => onChange(!anual)}
        className="relative grid h-10 w-48 grid-cols-2 rounded-full bg-muted p-1 text-sm font-medium">
        <motion.span aria-hidden className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-primary"
          animate={{ x: anual ? "100%" : "0%" }} transition={{ type: "spring", stiffness: 300, damping: 30 }} />
        <span className={`relative z-10 self-center ${anual ? "" : "text-primary-foreground"}`}>Mensal</span>
        <span className={`relative z-10 self-center ${anual ? "text-primary-foreground" : ""}`}>Anual</span>
      </button>
      <span className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">2 meses grátis</span>
    </div>
  );
}
