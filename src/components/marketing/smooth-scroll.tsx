"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Rolagem suave com Lenis, sincronizada com o ScrollTrigger do GSAP.
 *
 * As duas bibliotecas entram por importação dinâmica, dentro do efeito: elas
 * pesam junto quase 100 KB e não servem para nada antes da primeira rolagem.
 * Assim a página de vendas pinta primeiro e carrega o enfeite depois — e quem
 * pediu menos movimento no sistema nunca baixa nada disso.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let limpar: (() => void) | undefined;
    let cancelado = false;

    void (async () => {
      const [{ default: Lenis }, { default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelado) return;

      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({ duration: 1.1 });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      limpar = () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
      };
    })();

    return () => {
      cancelado = true;
      limpar?.();
    };
  }, []);

  return <>{children}</>;
}
