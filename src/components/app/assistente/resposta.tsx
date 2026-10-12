import { ExternalLink } from "lucide-react";

import { interpretarMarkdown, type Trecho } from "./markdown";
import type { FonteDaResposta } from "./protocolo";

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return trechos.map((t, i) => {
    if (t.tipo === "negrito") return <strong key={i}>{t.texto}</strong>;
    if (t.tipo === "link") {
      return (
        <a
          key={i}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline underline-offset-2"
        >
          {t.texto}
        </a>
      );
    }
    return <span key={i}>{t.texto}</span>;
  });
}

/** Resposta do assistente em markdown simples, montada como elementos React (texto sempre escapado). */
export function TextoDaResposta({ texto }: { texto: string }) {
  const blocos = interpretarMarkdown(texto);
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {blocos.map((bloco, i) => {
        if (bloco.tipo === "titulo") {
          return (
            <p key={i} className="font-semibold">
              <Trechos trechos={bloco.trechos} />
            </p>
          );
        }
        if (bloco.tipo === "lista") {
          const Lista = bloco.ordenada ? "ol" : "ul";
          return (
            <Lista key={i} className={bloco.ordenada ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {bloco.itens.map((item, j) => (
                <li key={j}>
                  <Trechos trechos={item} />
                </li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={i}>
            <Trechos trechos={bloco.trechos} />
          </p>
        );
      })}
    </div>
  );
}

export function FontesDaResposta({ fontes }: { fontes: FonteDaResposta[] }) {
  if (fontes.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">Fontes consultadas na internet</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {fontes.map((fonte) => (
          <li key={fonte.url} className="text-xs">
            <a
              href={fonte.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-start gap-1.5 text-primary underline underline-offset-2"
            >
              <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span className="break-all">{fonte.titulo || new URL(fonte.url).hostname}</span>
              <span className="sr-only">(abre em outra aba)</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Tendência de mercado não garante resultado.</p>
    </div>
  );
}
