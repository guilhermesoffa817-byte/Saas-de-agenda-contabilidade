import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

import { AvisoConfiguracao } from "@/components/app/aviso-configuracao";
import { MenuUsuario } from "@/components/app/menu-usuario";
import { NavegacaoCelular, NavegacaoLateral, itensPorPapel } from "@/components/app/navegacao";
import { SeletorEmpresa } from "@/components/app/seletor-empresa";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  PAPEIS_DO_SISTEMA,
  diasDeTesteRestantes,
  empresaAtual,
  exigirUsuario,
} from "@/lib/supabase/sessao";

/** O sistema logado lê sessão e cookies em toda visita: nada de pré-renderizar. */
export const dynamic = "force-dynamic";

const NOME_DO_PAPEL: Record<string, string> = {
  dono: "dono do negócio",
  profissional: "profissional",
  recepcao: "recepção",
  contador: "contador",
};

export default async function LayoutSistema({ children }: { children: ReactNode }) {
  if (!supabaseConfigurado) return <AvisoConfiguracao />;

  const usuario = await exigirUsuario();
  const { vinculo, vinculos } = await empresaAtual();

  if (!vinculo) redirect("/comecar");
  if (!PAPEIS_DO_SISTEMA.includes(vinculo.papel)) redirect("/contador");

  const itens = itensPorPapel(vinculo.papel);
  const dias = diasDeTesteRestantes(vinculo.empresa);
  const nome = (usuario.user_metadata?.nome as string | undefined) ?? usuario.email ?? "Você";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <NavegacaoCelular itens={itens} />
        <Link href="/app" className="font-display text-lg font-semibold tracking-tight">
          Alicerce
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {vinculos.length > 1 ? (
            <SeletorEmpresa
              atual={vinculo.empresa.id}
              empresas={vinculos.map((item) => ({ id: item.empresa.id, nome: item.empresa.name }))}
            />
          ) : (
            <span className="truncate text-sm text-muted-foreground">{vinculo.empresa.name}</span>
          )}
        </div>

        {dias !== null ? (
          dias > 0 ? (
            <Badge variant="outline" className="border-gold text-gold-ink">
              Teste grátis: {dias} {dias === 1 ? "dia" : "dias"}
            </Badge>
          ) : (
            <Badge variant="destructive">Teste encerrado</Badge>
          )
        ) : null}

        <MenuUsuario
          nome={nome}
          email={usuario.email ?? ""}
          papel={NOME_DO_PAPEL[vinculo.papel] ?? vinculo.papel}
        />
      </header>

      <div className="flex flex-1">
        <NavegacaoLateral itens={itens} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>

      <Toaster position="top-center" />
    </div>
  );
}
