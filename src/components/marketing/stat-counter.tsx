"use client";

import { useEffect, useRef } from "react";

/**
 * Número que sobe de zero até o valor quando entra na tela.
 *
 * Contado à mão com requestAnimationFrame e escrito direto no elemento: são
 * quatro números na página inteira, e não vale carregar um motor de animação
 * por causa deles — nem re-renderizar a cada quadro. Com movimento reduzido, o
 * número já aparece pronto.
 */
export function StatCounter({ valor, sufixo = "" }: { valor: number; sufixo?: string }) {
  const referencia = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const alvo = referencia.current;
    if (!alvo) return;

    const escrever = (numero: number) => {
      alvo.textContent = numero.toLocaleString("pt-BR") + sufixo;
    };

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      escrever(valor);
      return;
    }

    let quadro = 0;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        observador.disconnect();

        const duracao = 900;
        const comeco = performance.now();
        const passo = (agora: number) => {
          const fracao = Math.min((agora - comeco) / duracao, 1);
          // Desacelera no fim, para o número assentar em vez de travar.
          escrever(Math.round(valor * (1 - Math.pow(1 - fracao, 3))));
          if (fracao < 1) quadro = requestAnimationFrame(passo);
        };
        quadro = requestAnimationFrame(passo);
      },
      { rootMargin: "-40px" },
    );

    observador.observe(alvo);
    return () => {
      observador.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [valor, sufixo]);

  return (
    <span ref={referencia} className="font-mono tabular text-4xl font-semibold text-primary">
      0{sufixo}
    </span>
  );
}
