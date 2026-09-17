"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { enviarEmail, moldura } from "@/lib/email";
import { limiteDeProfissionais } from "@/lib/planos";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoSite } from "@/lib/url";
import { COOKIE_EMPRESA } from "@/lib/supabase/sessao";
import {
  esquemaConvite,
  esquemaExpediente,
  esquemaNovaEmpresa,
  esquemaServicos,
  esquemaSlug,
  type ConviteInput,
  type ExpedienteInput,
  type NovaEmpresaInput,
  type ServicosInput,
} from "@/lib/validacao/empresa";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

async function selecionarEmpresa(empresaId: string) {
  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Passos 1 e 2: cria a empresa e coloca quem cadastrou como dono. */
export async function criarEmpresa(dados: NovaEmpresaInput): Promise<Resposta<{ empresaId: string }>> {
  const validado = esquemaNovaEmpresa.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados digitados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: validado.data.nome,
    p_slug: validado.data.slug,
    p_segment: validado.data.segmento,
    p_tax_regime: validado.data.regime,
    p_timezone: validado.data.fuso,
  });

  if (error) {
    if (error.code === "23505" || error.message.includes("organizations_slug_key")) {
      return { erro: "Esse link de agendamento já está em uso. Escolha outro." };
    }
    return { erro: error.message };
  }

  await selecionarEmpresa(data);
  return { dados: { empresaId: data } };
}

/** Passo 3: profissionais e horário de funcionamento. */
export async function salvarEquipeEExpediente(
  empresaId: string,
  dados: ExpedienteInput,
): Promise<Resposta> {
  const validado = esquemaExpediente.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os horários." };
  }

  const supabase = await createClient();

  const { data: existentes } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("organization_id", empresaId);

  const nomes = validado.data.profissionais.map((profissional) => profissional.nome);

  // Limite do plano conferido no servidor.
  const { data: empresa } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", empresaId)
    .maybeSingle();
  const limite = limiteDeProfissionais(empresa?.plan);
  if (nomes.length > limite) {
    return {
      erro: `Seu plano permite ${limite} ${limite === 1 ? "profissional" : "profissionais"}. Deixe ${limite} por agora e troque de plano depois, em Assinatura.`,
    };
  }
  const paraCriar = nomes.filter((nome) => !existentes?.some((item) => item.name === nome));

  if (paraCriar.length) {
    const { error } = await supabase
      .from("professionals")
      .insert(paraCriar.map((nome) => ({ organization_id: empresaId, name: nome })));
    if (error) return { erro: error.message };
  }

  const { data: profissionais, error: erroLista } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("organization_id", empresaId)
    .eq("active", true);
  if (erroLista) return { erro: erroLista.message };

  const dosProfissionais = (profissionais ?? []).filter((profissional) => nomes.includes(profissional.name));

  // O expediente é reescrito por inteiro: é o jeito mais simples de refletir a tela.
  const { error: erroApagar } = await supabase
    .from("working_hours")
    .delete()
    .eq("organization_id", empresaId);
  if (erroApagar) return { erro: erroApagar.message };

  const faixas = dosProfissionais.flatMap((profissional) =>
    validado.data.dias
      .filter((dia) => dia.aberto)
      .map((dia) => ({
        organization_id: empresaId,
        professional_id: profissional.id,
        weekday: dia.dia,
        start_time: dia.inicio,
        end_time: dia.fim,
      })),
  );

  if (faixas.length) {
    const { error } = await supabase.from("working_hours").insert(faixas);
    if (error) return { erro: error.message };
  }

  return {};
}

/** Passo 4: serviços com duração e preço. */
export async function salvarServicos(empresaId: string, dados: ServicosInput): Promise<Resposta> {
  const validado = esquemaServicos.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os serviços." };
  }

  const supabase = await createClient();
  const { data: existentes } = await supabase
    .from("services")
    .select("id, name")
    .eq("organization_id", empresaId);

  const novos = validado.data.servicos.filter(
    (servico) => !existentes?.some((item) => item.name === servico.nome),
  );

  if (novos.length) {
    const { error } = await supabase.from("services").insert(
      novos.map((servico) => ({
        organization_id: empresaId,
        name: servico.nome,
        duration_min: servico.duracao,
        buffer_min: servico.buffer,
        price_cents: servico.preco,
        bookable_online: servico.online,
      })),
    );
    if (error) return { erro: error.message };
  }

  return {};
}

/** Passo 5: convite (contador, recepção ou profissional). */
export async function convidarPessoa(
  empresaId: string,
  dados: ConviteInput,
): Promise<Resposta<{ link: string; enviado: boolean }>> {
  const validado = esquemaConvite.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira o e-mail." };
  }

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
  const papel = validado.data.papel === "contador" ? "contador" : "parte da equipe";

  const envio = await enviarEmail({
    para: validado.data.email,
    assunto: `${empresa?.name ?? "Um negócio"} te convidou para o Alicerce`,
    texto: `${empresa?.name ?? "Um negócio"} quer te dar acesso como ${papel}. Aceite o convite em ${link} (o link vale por 7 dias).`,
    html: moldura({
      titulo: "Você foi convidado",
      corpo: `<p><strong>${empresa?.name ?? "Um negócio"}</strong> quer te dar acesso como ${papel} no Alicerce, o sistema de agenda e financeiro do negócio.</p><p>O convite vale por 7 dias.</p>`,
      botao: { texto: "Aceitar convite", url: link },
    }),
  });

  return { dados: { link, enviado: envio.enviado } };
}

/** Passo 5: ajustar o link público de agendamento. */
export async function atualizarSlug(empresaId: string, slug: string): Promise<Resposta> {
  const validado = esquemaSlug.safeParse(slug);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Link inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ slug: validado.data })
    .eq("id", empresaId);

  if (error) {
    if (error.code === "23505") return { erro: "Esse link já está em uso. Escolha outro." };
    return { erro: error.message };
  }
  return {};
}

export async function concluirOnboarding() {
  redirect("/app");
}
