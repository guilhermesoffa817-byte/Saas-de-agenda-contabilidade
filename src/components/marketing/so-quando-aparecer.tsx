"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Só monta o conteúdo quando ele está perto de aparecer na tela.
 *
 * `next/dynamic` adia o download até o componente montar — mas tudo o que está
 * no HTML monta de uma vez, mesmo dez telas abaixo. Este embrulho resolve isso:
 * a peça pesada (o gráfico, o tour) só é baixada quando a pessoa chega perto
 * dela. Guarda o espaço com uma altura mínima, para nada pular no lugar.
 */
export function SoQuandoAparecer({
  children,
  alturaMinima = "24rem",
  margem = "400px",
}: {
  children: ReactNode;
  /** Espaço reservado enquanto não montou, para a página não dar solavanco. */
  alturaMinima?: string;
  /** Quanto antes da dobra começar a carregar. */
  margem?: string;
}) {
  const referencia = useRef<HTMLDivElement>(null);
  const [montar, setMontar] = useState(false);

  useEffect(() => {
    const alvo = referencia.current;
    if (!alvo) return;

    // Navegador sem observador: monta no próximo quadro, sem esperar rolagem.
    if (typeof IntersectionObserver === "undefined") {
      const quadro = requestAnimationFrame(() => setMontar(true));
      return () => cancelAnimationFrame(quadro);
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        setMontar(true);
        observador.disconnect();
      },
      { rootMargin: margem },
    );

    observador.observe(alvo);
    return () => observador.disconnect();
  }, [margem]);

  return (
    <div ref={referencia} style={montar ? undefined : { minHeight: alturaMinima }}>
      {montar ? children : null}
    </div>
  );
}
