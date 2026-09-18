"use client";

import { Children, useEffect, useRef, type ReactNode } from "react";

/**
 * Entrada em cascata quando a seção aparece na tela.
 *
 * Feito com IntersectionObserver e transição de CSS, e não com biblioteca de
 * animação: a página de vendas é a primeira coisa que a pessoa carrega, muitas
 * vezes no 4G, e um motor de animação inteiro sai caro no celular.
 *
 * A classe entra direto no elemento, sem passar por estado do React: não há
 * nada para re-renderizar, só uma transição do navegador. Quem pede menos
 * movimento não recebe nenhum — `globals.css` zera as transições e o conteúdo
 * aparece imediatamente.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alvo = referencia.current;
    if (!alvo) return;

    const filhos = Array.from(alvo.children) as HTMLElement[];
    const mostrar = () => filhos.forEach((filho) => filho.classList.add("revelado"));

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      mostrar();
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        mostrar();
        observador.disconnect();
      },
      { rootMargin: "-80px" },
    );

    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={referencia} className={className}>
      {Children.toArray(children).map((filho, indice) => (
        <div key={indice} className="a-revelar" style={{ "--atraso": `${indice * 120}ms` } as React.CSSProperties}>
          {filho}
        </div>
      ))}
    </div>
  );
}
