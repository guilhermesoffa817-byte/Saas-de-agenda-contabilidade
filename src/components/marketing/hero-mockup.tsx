"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A tela do produto entrando no topo da página, com um leve paralaxe na
 * rolagem.
 *
 * Tudo em CSS e num único listener de rolagem, sem biblioteca de animação: este
 * é o primeiro bloco que a pessoa carrega, e no celular cada quilobyte aqui
 * atrasa a promessa do topo. Com movimento reduzido não há entrada nem
 * paralaxe — a tela já aparece parada e no lugar.
 */
export function HeroMockup({ children }: { children: ReactNode }) {
  const externo = useRef<HTMLDivElement>(null);
  const interno = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caixa = externo.current;
    const alvo = interno.current;
    if (!caixa || !alvo) return;

    // A entrada é do CSS. Aqui só entra o paralaxe, e quem pediu menos
    // movimento não recebe nem isso.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let agendado = false;
    const aoRolar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(() => {
        agendado = false;
        const { top, height } = caixa.getBoundingClientRect();
        // 0 quando o topo encosta no alto da tela, 1 quando o bloco sai por cima.
        const andamento = Math.min(Math.max(-top / (height || 1), 0), 1);
        alvo.style.setProperty("--paralaxe", `${andamento * 80}px`);
      });
    };

    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <div ref={externo}>
      <div ref={interno} className="hero-mockup">
        {children}
      </div>
    </div>
  );
}
