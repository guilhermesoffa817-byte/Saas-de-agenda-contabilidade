"use server";

import { addMinutes } from "date-fns";
import { revalidatePath } from "next/cache";

import { instanteNaEmpresa } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";
import { normalizarTelefone } from "@/lib/telefone";
import {
  esquemaBloqueio,
  esquemaNovoAtendimento,
  esquemaRemarcacao,
  esquemaStatus,
  type BloqueioInput,
  type NovoAtendimentoInput,
  type RemarcacaoInput,
  type StatusInput,
} from "@/lib/validacao/agenda";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

/** O banco recusa dois atendimentos ativos no mesmo horário: este é o código do erro. */
const CODIGO_CONFLITO = "23P01";
const AVISO_CONFLITO = "Esse horário acabou de ser ocupado. Escolha outro.";

async function empresaDoUsuario() {
  const { vinculo } = await empresaAtual();
  return vinculo;
}

function limparRevalidacao() {
  revalidatePath("/app/agenda");
  revalidatePath("/app");
}

export async function criarAtendimento(
  entrada: NovoAtendimentoInput,
): Promise<Resposta<{ atendimentoId: string }>> {
  const validado = esquemaNovoAtendimento.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados do atendimento." };
  }

  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const empresa = vinculo.empresa;
  const supabase = await createClient();
  const dados = validado.data;

  const { data: servico } = await supabase
    .from("services")
    .select("id, duration_min, buffer_min, price_cents")
    .eq("organization_id", empresa.id)
    .eq("id", dados.servicoId)
    .maybeSingle();
  if (!servico) return { erro: "Serviço não encontrado." };

  const { data: profissional } = await supabase
    .from("professionals")
    .select("id")
    .eq("organization_id", empresa.id)
    .eq("id", dados.profissionalId)
    .maybeSingle();
  if (!profissional) return { erro: "Profissional não encontrado." };

  let clienteId = dados.clienteId ?? null;

  if (clienteId) {
    const { data: cliente } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", empresa.id)
      .eq("id", clienteId)
      .maybeSingle();
    if (!cliente) return { erro: "Cliente não encontrado." };
  } else {
    const telefone = dados.clienteTelefone ? normalizarTelefone(dados.clienteTelefone) : null;
    if (dados.clienteTelefone && !telefone) {
      return { erro: "Digite o WhatsApp com DDD, por exemplo (66) 99999-9999." };
    }

    if (telefone) {
      const { data: existente } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", empresa.id)
        .eq("phone_e164", telefone)
        .maybeSingle();
      clienteId = existente?.id ?? null;
    }

    if (!clienteId) {
      const { data: novo, error } = await supabase
        .from("clients")
        .insert({
          organization_id: empresa.id,
          name: dados.clienteNome!,
          phone_e164: telefone,
        })
        .select("id")
        .single();
      if (error) return { erro: error.message };
      clienteId = novo.id;
    }
  }

  const inicio = instanteNaEmpresa(dados.dia, dados.hora, empresa.timezone);
  const fim = addMinutes(inicio, servico.duration_min + servico.buffer_min);

  const { data: criado, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: empresa.id,
      professional_id: dados.profissionalId,
      client_id: clienteId,
      service_id: servico.id,
      starts_at: new Date(inicio.getTime()).toISOString(),
      ends_at: new Date(fim.getTime()).toISOString(),
      price_cents: dados.precoCents ?? servico.price_cents,
      source: "interno",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === CODIGO_CONFLITO) return { erro: AVISO_CONFLITO };
    return { erro: error.message };
  }

  limparRevalidacao();
  return { dados: { atendimentoId: criado.id }, aviso: "Atendimento marcado." };
}

export async function remarcarAtendimento(entrada: RemarcacaoInput): Promise<Resposta> {
  const validado = esquemaRemarcacao.safeParse(entrada);
  if (!validado.success) return { erro: "Não foi possível remarcar." };

  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const empresa = vinculo.empresa;
  const supabase = await createClient();

  const { data: atendimento } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status")
    .eq("organization_id", empresa.id)
    .eq("id", validado.data.atendimentoId)
    .maybeSingle();
  if (!atendimento) return { erro: "Atendimento não encontrado." };
  if (atendimento.status === "concluido") {
    return { erro: "Atendimento concluído não pode ser remarcado." };
  }

  const duracao =
    (new Date(atendimento.ends_at).getTime() - new Date(atendimento.starts_at).getTime()) / 60_000;
  const inicio = instanteNaEmpresa(validado.data.dia, validado.data.hora, empresa.timezone);
  const fim = addMinutes(inicio, duracao);

  const { error } = await supabase
    .from("appointments")
    .update({
      professional_id: validado.data.profissionalId,
      starts_at: new Date(inicio.getTime()).toISOString(),
      ends_at: new Date(fim.getTime()).toISOString(),
    })
    .eq("id", atendimento.id);

  if (error) {
    if (error.code === CODIGO_CONFLITO) return { erro: AVISO_CONFLITO };
    return { erro: error.message };
  }

  limparRevalidacao();
  return { aviso: "Atendimento remarcado." };
}

export async function alterarStatus(entrada: StatusInput): Promise<Resposta> {
  const validado = esquemaStatus.safeParse(entrada);
  if (!validado.success) return { erro: "Status inválido." };

  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const supabase = await createClient();
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("appointments")
    .update({
      status: validado.data.status,
      confirmed_at: validado.data.status === "confirmado" ? agora : undefined,
      cancel_reason: validado.data.status === "cancelado" ? (validado.data.motivo ?? null) : null,
    })
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", validado.data.atendimentoId);

  if (error) {
    if (error.code === CODIGO_CONFLITO) return { erro: AVISO_CONFLITO };
    return { erro: error.message };
  }

  limparRevalidacao();
  const avisos: Record<string, string> = {
    agendado: "Atendimento reaberto.",
    confirmado: "Atendimento confirmado.",
    concluido: "Atendimento concluído.",
    cancelado: "Atendimento cancelado.",
  };
  return { aviso: avisos[validado.data.status] };
}

/** "Faltou" muda o status e soma no contador de faltas do cliente, no banco. */
export async function marcarFalta(atendimentoId: string): Promise<Resposta> {
  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_falta", { p_appointment: atendimentoId });
  if (error) return { erro: error.message };

  limparRevalidacao();
  return { aviso: "Falta registrada." };
}

/** Guarda que o lembrete já saiu, para não mandar duas vezes. */
export async function registrarLembreteEnviado(atendimentoId: string): Promise<Resposta> {
  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", atendimentoId);

  if (error) return { erro: error.message };
  limparRevalidacao();
  return {};
}

export async function criarBloqueio(entrada: BloqueioInput): Promise<Resposta> {
  const validado = esquemaBloqueio.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira o bloqueio." };
  }

  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const empresa = vinculo.empresa;
  const supabase = await createClient();

  const inicio = instanteNaEmpresa(validado.data.dia, validado.data.inicio, empresa.timezone);
  const fim = instanteNaEmpresa(validado.data.dia, validado.data.fim, empresa.timezone);

  const { error } = await supabase.from("time_off").insert({
    organization_id: empresa.id,
    professional_id: validado.data.profissionalId,
    starts_at: new Date(inicio.getTime()).toISOString(),
    ends_at: new Date(fim.getTime()).toISOString(),
    reason: validado.data.motivo || null,
  });

  if (error) return { erro: error.message };
  limparRevalidacao();
  return { aviso: "Horário bloqueado." };
}

export async function removerBloqueio(bloqueioId: string): Promise<Resposta> {
  const vinculo = await empresaDoUsuario();
  if (!vinculo) return { erro: "Empresa não encontrada." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_off")
    .delete()
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", bloqueioId);

  if (error) return { erro: error.message };
  limparRevalidacao();
  return { aviso: "Bloqueio removido." };
}
