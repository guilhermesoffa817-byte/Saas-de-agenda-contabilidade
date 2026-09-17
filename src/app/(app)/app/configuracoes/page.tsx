import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Equipe, type ConvitePendente, type MembroDaEquipe } from "./equipe";
import { FormularioNegocio } from "./formulario-negocio";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, exigirUsuario } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Configurações — Alicerce" };

/** Busca nome e e-mail de cada pessoa da equipe (só o servidor pode ler isso). */
async function dadosDosMembros(ids: string[]) {
  if (!ids.length) return new Map<string, { nome: string; email: string }>();
  const admin = createAdminClient();
  const pares = await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const nome = (data.user?.user_metadata?.nome as string | undefined)?.trim();
      const email = data.user?.email ?? "";
      return [id, { nome: nome || email.split("@")[0] || "Sem nome", email }] as const;
    }),
  );
  return new Map(pares);
}

export default async function PaginaConfiguracoes() {
  const usuario = await exigirUsuario();
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const empresa = vinculo.empresa;
  const supabase = await createClient();

  const [{ data: membros }, { data: convites }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, display_name, created_at")
      .eq("organization_id", empresa.id)
      .order("created_at"),
    supabase
      .from("organization_invites")
      .select("id, email, role, expires_at, accepted_at")
      .eq("organization_id", empresa.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const identidades = await dadosDosMembros((membros ?? []).map((membro) => membro.user_id));

  const equipe: MembroDaEquipe[] = (membros ?? []).map((membro) => {
    const identidade = identidades.get(membro.user_id);
    return {
      userId: membro.user_id,
      nome: membro.display_name ?? identidade?.nome ?? "Sem nome",
      email: identidade?.email ?? "",
      papel: membro.role,
      desde: membro.created_at,
    };
  });

  const pendentes: ConvitePendente[] = (convites ?? []).map((convite) => ({
    id: convite.id,
    email: convite.email,
    papel: convite.role,
    expiraEm: convite.expires_at,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Dados do negócio e quem tem acesso ao sistema.
        </p>
      </div>

      <Tabs defaultValue="negocio">
        <TabsList>
          <TabsTrigger value="negocio">Negócio</TabsTrigger>
          <TabsTrigger value="equipe">Equipe e contador</TabsTrigger>
        </TabsList>

        <TabsContent value="negocio" className="pt-6">
          <FormularioNegocio
            empresaId={empresa.id}
            valores={{
              nome: empresa.name,
              slug: empresa.slug,
              segmento: empresa.segment as "salao",
              regime: empresa.tax_regime,
              fuso: empresa.timezone,
              documento: empresa.document ?? "",
              abertura: empresa.opened_on ?? "",
              cidade: empresa.city ?? "",
              estado: empresa.state ?? "",
              chavePix: empresa.pix_key ?? "",
            }}
          />
        </TabsContent>

        <TabsContent value="equipe" className="pt-6">
          <Equipe
            empresaId={empresa.id}
            fuso={empresa.timezone}
            membros={equipe}
            convites={pendentes}
            souEuId={usuario.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
