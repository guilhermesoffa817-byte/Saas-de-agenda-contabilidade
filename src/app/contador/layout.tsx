import { Briefcase } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AvisoConfiguracao } from "@/components/app/aviso-configuracao";
import { MenuUsuario } from "@/components/app/menu-usuario";
import { Tema } from "@/components/tema";
import { Toaster } from "@/components/ui/sonner";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { exigirUsuario, vinculosDoUsuario } from "@/lib/supabase/sessao";

export const dynamic = "force-dynamic";

export default async function LayoutContador({ children }: { children: ReactNode }) {
  if (!supabaseConfigurado) return <AvisoConfiguracao />;

  const usuario = await exigirUsuario();
  const vinculos = await vinculosDoUsuario();
  const comoContador = vinculos.filter((vinculo) => vinculo.papel === "contador");

  // Quem não é contador de ninguém vai para o sistema normal.
  if (!comoContador.length) redirect(vinculos.length ? "/app" : "/comecar");

  const nome = (usuario.user_metadata?.nome as string | undefined) ?? usuario.email ?? "Você";

  return (
    <Tema>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
          <Link href="/contador" className="font-display text-lg font-semibold tracking-tight">
            Alicerce
          </Link>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Briefcase className="size-4" aria-hidden />
            Portal do contador
          </span>
          <div className="flex-1" />
          <MenuUsuario nome={nome} email={usuario.email ?? ""} papel="contador" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>

        <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground md:px-8">
          O acesso do contador é gratuito em todos os planos do Alicerce.
        </footer>

        <Toaster position="top-center" />
      </div>
    </Tema>
  );
}
