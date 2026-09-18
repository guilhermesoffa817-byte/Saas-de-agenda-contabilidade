"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Tela de erro inesperado. A do Next vem em inglês e sem marca; esta fala
 * português, não mostra pilha de erro para o usuário e dá duas saídas: tentar
 * de novo ou voltar ao início.
 */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Vai para o log do servidor, onde o monitoramento enxerga.
    console.error(error);
  }, [error]);

  return (
    <div className="tema-papel flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center text-foreground">
      <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
        <TriangleAlert className="size-6 text-destructive" aria-hidden />
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Alguma coisa saiu do lugar
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          O erro foi registrado e a gente já sabe dele. Seus dados estão salvos — nada do que você
          fez até agora se perdeu.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs tabular text-muted-foreground">
            Código do erro: {error.digest}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw aria-hidden />
          Tentar de novo
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Voltar para o início</Link>
        </Button>
      </div>
    </div>
  );
}
