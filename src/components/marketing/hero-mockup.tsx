// src/components/marketing/hero-mockup.tsx
"use client";
import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

export function HeroMockup({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduzir ? 0 : 80]);

  return (
    <div ref={ref}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <motion.div style={{ y }}>{children}</motion.div>
      </motion.div>
    </div>
  );
}
