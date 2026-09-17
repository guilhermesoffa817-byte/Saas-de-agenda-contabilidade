"use server";

import { revalidatePath } from "next/cache";

import { enviarEmail, moldura } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoSite } from "@/lib/url";
import {
  esquemaConvite,
  esquemaDadosDaEmpresa,
  type ConviteInput,
  type DadosDaEmpresaInput,
} from "@/lib/validacao/empresa";
import type { Enums } from "@/lib/supabase/database.types";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

/** Só o dono chega aqui (a RLS recusa o resto), mas conferimos de novo no servidor. */
async function exigirDono(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", empresaId)
    .maybeSingle();
  return data?.role === "dono";
}

export async function atualizarDadosDaEmpresa(
  empresaId: string,
  dados: DadosDaEmpresaInput,
): Promise<Resposta> {
  const validado = esquemaDadosDaEmpresa.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados." };
  }
  if (!(await exigirDono(empresaId))) return { erro: "Só o dono altera os dados do negócio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: validado.data.nome,
      slug: validado.data.slug,
      segment: validado.data.segmento,
      tax_regime: validado.data.regime,
      timezone: validado.data.fuso,
      document: validado.data.documento || null,
      opened_on: validado.data.abertura || null,
      city: validado.data.cidade || null,
      state: validado.data.estado || null,
      pix_key: validado.data.chavePix || null,
    })
    .eq("id", empresaId);

  if (error) {
    if (error.code === "23505") return { erro: "Esse link de agendamento já está em uso." };
    return { erro: error.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/configuracoes");
  return { aviso: "Dados salvos." };
}

export async function convidarMembro(
  empresaId: string,
  dados: ConviteInput,
): Promise<Resposta<{ link: string; enviado: boolean }>> {
  const validado = esquemaConvite.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira o e-mail." };
  }
  if (!(await exigirDono(empresaId))) return { erro: "Só o dono convida pessoas." };

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", empresaId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("organization_invites")
    .insert({
      organization_id: empresaId,
      email: validado.data.email.toLowerCase(),
      role: validado.data.papel,
    })
    .select("token")
    .single();

  if (error) return { erro: error.message };

  const link = `${await enderecoDoSite()}/convite/${data.token}`;
  const envio = await enviarEmail({
    para: validado.data.email,
    assunto: `${empresa?.name ?? "Um negócio"} te convidou para o Alicerce`,
    texto: `Aceite o convite em ${link} (vale por 7 dias).`,
    html: moldura({
      titulo: "Você foi convidado",
      corpo: `<p><strong>${empresa?.name ?? "Um negócio"}</strong> quer te dar acesso no Alicerce. O convite vale por 7 dias.</p>`,
      botao: { texto: "Aceitar convite", url: link },
    }),
  });

  revalidatePath("/app/configuracoes");
  return { dados: { link, enviado: envio.enviado } };
}

export async function cancelarConvite(empresaId: string, conviteId: string): Promise<Resposta> {
  if (!(await exigirDono(empresaId))) return { erro: "Só o dono cancela convites." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_invites")
    .delete()
    .eq("id", conviteId)
    .eq("organization_id", empresaId);

  if (error) return { erro: error.message };
  revalidatePath("/app/configuracoes");
  return { aviso: "Convite cancelado." };
}

/** Impede que a empresa fique sem nenhum dono. */
async function sobraOutroDono(empresaId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", empresaId)
    .eq("role", "dono");
  return (data ?? []).some((membro) => membro.user_id !== userId);
}

export async function alterarPapel(
  empresaId: string,
  userId: string,
  papel: Enums<"member_role">,
): Promise<Resposta> {
  if (!(await exigirDono(empresaId))) return { erro: "Só o dono altera acessos." };

  if (papel !== "dono" && !(await sobraOutroDono(empresaId, userId))) {
    return { erro: "A empresa precisa ter pelo menos um dono. Promova outra pessoa antes." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role: papel })
    .eq("organization_id", empresaId)
    .eq("user_id", userId);

  if (error) return { erro: error.message };
  revalidatePath("/app/configuracoes");
  return { aviso: "Acesso atualizado." };
}

export async function removerMembro(empresaId: string, userId: string): Promise<Resposta> {
  if (!(await exigirDono(empresaId))) return { erro: "Só o dono remove pessoas." };

  if (!(await sobraOutroDono(empresaId, userId))) {
    return { erro: "A empresa precisa ter pelo menos um dono. Promova outra pessoa antes." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", empresaId)
    .eq("user_id", userId);

  if (error) return { erro: error.message };
  revalidatePath("/app/configuracoes");
  return { aviso: "Pessoa removida." };
}
