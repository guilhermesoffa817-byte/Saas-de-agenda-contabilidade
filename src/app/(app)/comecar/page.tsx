import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AssistenteInicial } from "./assistente";
import { AvisoConfiguracao } from "@/components/app/aviso-configuracao";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { exigirUsuario, vinculosDoUsuario } from "@/lib/supabase/sessao";
import { enderecoDoSite } from "@/lib/url";

export const metadata: Metadata = { title: "Começar — Alicerce" };

export const dynamic = "force-dynamic";

export default async function PaginaComecar() {
  if (!supabaseConfigurado) return <AvisoConfiguracao />;

  const usuario = await exigirUsuario();
  const vinculos = await vinculosDoUsuario();
  const comoDono = vinculos.find((vinculo) => vinculo.papel === "dono");

  // Quem entrou por convite (equipe ou contador) não passa pelo cadastro do negócio.
  if (!comoDono && vinculos.length) {
    redirect(vinculos[0].papel === "contador" ? "/contador" : "/app");
  }

  const nomeDoUsuario =
    (usuario.user_metadata?.nome as string | undefined)?.trim() || usuario.email?.split("@")[0] || "Você";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <AssistenteInicial
        nomeDoUsuario={nomeDoUsuario}
        enderecoDoSite={await enderecoDoSite()}
        empresaExistente={
          comoDono
            ? {
                id: comoDono.empresa.id,
                nome: comoDono.empresa.name,
                slug: comoDono.empresa.slug,
                segmento: comoDono.empresa.segment,
                fuso: comoDono.empresa.timezone,
              }
            : null
        }
      />
    </div>
  );
}
