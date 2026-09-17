import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Enums, Tables } from "./database.types";
import { createClient } from "./server";

export type Papel = Enums<"member_role">;
export type Empresa = Tables<"organizations">;

export type Vinculo = {
  papel: Papel;
  empresa: Empresa;
};

export const COOKIE_EMPRESA = "alicerce_empresa";

/** Papéis que enxergam as telas do sistema (o contador tem portal próprio). */
export const PAPEIS_DO_SISTEMA: Papel[] = ["dono", "recepcao", "profissional"];

export async function usuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function exigirUsuario() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

/** Todas as empresas em que a pessoa participa, com o papel dela em cada uma. */
export async function vinculosDoUsuario(): Promise<Vinculo[]> {
  const supabase = await createClient();
  const { data: membros } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .order("created_at", { ascending: true });

  if (!membros?.length) return [];

  const { data: empresas } = await supabase
    .from("organizations")
    .select("*")
    .in(
      "id",
      membros.map((membro) => membro.organization_id),
    );

  return membros
    .map((membro) => {
      const empresa = empresas?.find((item) => item.id === membro.organization_id);
      return empresa ? { papel: membro.role, empresa } : null;
    })
    .filter((vinculo): vinculo is Vinculo => vinculo !== null);
}

/**
 * Empresa que está selecionada no seletor do topo. Cai na primeira empresa da
 * pessoa quando o cookie não aponta para nenhuma que ela ainda participe.
 */
export async function empresaAtual(): Promise<{ vinculo: Vinculo | null; vinculos: Vinculo[] }> {
  const vinculos = await vinculosDoUsuario();
  if (!vinculos.length) return { vinculo: null, vinculos };

  const escolhida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const vinculo = vinculos.find((item) => item.empresa.id === escolhida) ?? vinculos[0];
  return { vinculo, vinculos };
}

/** Dias que faltam para o teste grátis acabar (0 quando já acabou). */
export function diasDeTesteRestantes(empresa: Pick<Empresa, "trial_ends_at" | "subscription_status">) {
  if (empresa.subscription_status !== "trialing") return null;
  const fim = new Date(empresa.trial_ends_at).getTime();
  const dias = Math.ceil((fim - Date.now()) / 86_400_000);
  return Math.max(dias, 0);
}
