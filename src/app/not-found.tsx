import { ArrowLeft, Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

/**
 * A página de 404 do Next vem em inglês e sem marca nenhuma. Quem erra uma letra
 * no link de agendamento cai aqui — então aqui fala português e tem por onde
 * seguir.
 */
export default function NaoEncontrada() {
  return (
    <div className="tema-papel flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center text-foreground">
      <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
        <Compass className="size-6 text-primary" aria-hidden />
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Essa página não existe
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          O endereço pode ter mudado, ou faltou uma letra no caminho. Se você tentava abrir a agenda
          de um negócio, confira o link com quem te mandou.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">
            <ArrowLeft aria-hidden />
            Voltar para o início
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/entrar">Entrar no sistema</Link>
        </Button>
      </div>
    </div>
  );
}
