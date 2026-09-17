"use client";

import Script from "next/script";
import { useCallback, useId, useRef, useState } from "react";

type JanelaComTurnstile = Window & {
  turnstile?: {
    render: (
      alvo: string | HTMLElement,
      opcoes: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
    ) => string;
  };
};

/**
 * Proteção contra robô no agendamento público (Cloudflare Turnstile).
 * Sem a chave configurada, o componente não aparece e o limite por IP segue valendo.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const chave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const id = useId().replace(/:/g, "");
  const renderizado = useRef(false);
  const [pronto, setPronto] = useState(false);

  const renderizar = useCallback(() => {
    if (renderizado.current || !chave) return;
    const janela = window as JanelaComTurnstile;
    const alvo = document.getElementById(id);
    if (!janela.turnstile || !alvo) return;

    renderizado.current = true;
    janela.turnstile.render(alvo, {
      sitekey: chave,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
    });
    setPronto(true);
  }, [chave, id, onToken]);

  if (!chave) return null;

  return (
    <div className="flex flex-col gap-2">
      <div id={id} />
      {!pronto ? <span className="text-xs text-muted-foreground">Carregando verificação…</span> : null}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderizar}
        onLoad={renderizar}
      />
    </div>
  );
}
