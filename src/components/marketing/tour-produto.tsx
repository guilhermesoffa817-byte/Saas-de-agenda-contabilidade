// src/components/marketing/tour-produto.tsx
"use client";
import { useRef, useState, type ComponentType } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "motion/react";
import { BrowserFrame } from "./browser-frame";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Passo = { titulo: string; texto: string; Tela: ComponentType };

export function TourProduto({ passos }: { passos: Passo[] }) {
  const secao = useRef<HTMLElement>(null);
  const [ativo, setAtivo] = useState(0);

  useGSAP(() => {
    gsap.matchMedia().add("(min-width: 768px)", () => {
      ScrollTrigger.create({
        trigger: secao.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => setAtivo(Math.min(passos.length - 1, Math.floor(self.progress * passos.length))),
      });
    });
  }, { scope: secao });

  const Tela = passos[ativo].Tela;

  return (
    <section ref={secao} aria-label="Por dentro do Alicerce" className="relative md:h-[400vh]">
      {/* Celular: passos empilhados, cada um com a sua tela */}
      <div className="min-w-0 space-y-12 md:hidden">
        {passos.map(({ titulo, texto, Tela: T }) => (
          <div key={titulo} className="space-y-4">
            <h3 className="text-2xl">{titulo}</h3>
            <p className="text-muted-foreground">{texto}</p>
            <BrowserFrame><T /></BrowserFrame>
          </div>
        ))}
      </div>

      {/* Desktop: texto à esquerda, tela fixa à direita */}
      <div className="sticky top-0 hidden h-screen items-center gap-12 md:grid md:grid-cols-2 [&>*]:min-w-0">
        <ol className="space-y-8">
          {passos.map((p, i) => (
            <li key={p.titulo} className={`transition-opacity duration-300 ${i === ativo ? "opacity-100" : "opacity-35"}`}>
              <h3 className="text-2xl">{p.titulo}</h3>
              <p className="text-muted-foreground">{p.texto}</p>
            </li>
          ))}
        </ol>
        <BrowserFrame>
          <AnimatePresence mode="wait">
            <motion.div key={ativo} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <Tela />
            </motion.div>
          </AnimatePresence>
        </BrowserFrame>
      </div>
    </section>
  );
}
