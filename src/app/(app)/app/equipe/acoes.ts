"use server";

import { revalidatePath } from "next/cache";

import type { DadosPessoaisDaTela } from "@/components/app/equipe/tipos";
import { contratosDoSegmento, remuneracaoDoVinculo } from "@/lib/equipe";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";
import { formatarTelefone } from "@/lib/telefone";
import {
  esquemaAusencia,
  esquemaColaborador,
  esquemaDesligamento,
  esquemaPagamentoEquipe,
  type AusenciaInput,
  type ColaboradorInput,
  type DesligamentoInput,
  type PagamentoEquipeInput,
} from "@/lib/validacao/equipe";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

const MES_FECHADO = "Este mês já foi fechado. Reabra o fechamento para alterar lançamentos.";

/** O banco já fala português; aqui só ficam amigáveis as mensagens técnicas. */
function traduzirErro(erro: { code?: string; message: string }) {
  if (erro.message.includes("Mês fechado")) return MES_FECHADO;
  if (erro.code === "23505") return "Esse profissional da agenda já está ligado a outro colaborador.";
  if (erro.code === "23514") return "Confira as datas e os valores: algum deles não é aceito.";
  return erro.message;
}

async function exigirDono() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." as const, vinculo: null };
  if (vinculo.papel !== "dono") {
    return { erro: "Só o dono altera os dados da equipe." as const, vinculo: null };
  }
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio) return { erro: bloqueio, vinculo: null };
  return { erro: undefined, vinculo };
}

function limpar({ financeiro = false, agenda = false } = {}) {
  revalidatePath("/app/equipe");
  if (financeiro) {
    revalidatePath("/app/financeiro");
    revalidatePath("/app/financeiro/lancamentos");
    revalidatePath("/app");
  }
  if (agenda) revalidatePath("/app/agenda");
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export async function salvarColaborador(
  entrada: ColaboradorInput,
): Promise<Resposta<{ colaboradorId: string }>> {
  const validado = esquemaColaborador.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados do colaborador." };
  }

  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const dados = validado.data;
  const empresaId = vinculo.empresa.id;
  const supabase = await createClient();

  let contratoAtual: ColaboradorInput["contrato"] | undefined;
  if (dados.colaboradorId) {
    const { data: atual } = await supabase
      .from("staff_members")
      .select("contract, anonymized_at")
      .eq("organization_id", empresaId)
      .eq("id", dados.colaboradorId)
      .maybeSingle();
    if (!atual) return { erro: "Colaborador não encontrado." };
    if (atual.anonymized_at) return { erro: "Este colaborador foi removido e não pode ser editado." };
    contratoAtual = atual.contract;
  }

  if (!contratosDoSegmento(vinculo.empresa.segment, contratoAtual).includes(dados.contrato)) {
    return {
      erro: "A parceria da Lei do Salão-Parceiro vale só para salões, barbearias e outros negócios de beleza. Escolha outro vínculo.",
    };
  }

  const remuneracao = remuneracaoDoVinculo(dados.contrato, {
    fixoCents: dados.fixoCents,
    percentualBps: dados.percentual,
    porAtendimentoCents: dados.porAtendimentoCents,
  });

  const registro = {
    name: dados.nome,
    job_title: dados.cargo || null,
    contract: dados.contrato,
    started_on: dados.inicio,
    ended_on: dados.fim || null,
    professional_id: dados.profissionalId || null,
    base_pay_cents: remuneracao.fixoCents,
    commission_bps: remuneracao.percentualBps,
    per_service_cents: remuneracao.porAtendimentoCents,
  };

  let colaboradorId = dados.colaboradorId;
  if (colaboradorId) {
    const { error } = await supabase
      .from("staff_members")
      .update(registro)
      .eq("organization_id", empresaId)
      .eq("id", colaboradorId);
    if (error) return { erro: traduzirErro(error) };
  } else {
    const { data, error } = await supabase
      .from("staff_members")
      .insert({ ...registro, organization_id: empresaId })
      .select("id")
      .single();
    if (error) return { erro: traduzirErro(error) };
    colaboradorId = data.id;
  }

  // Dados pessoais: só o que foi informado. Tudo em branco apaga a linha.
  const pessoais = dados.dadosPessoais;
  const temAlgum = Object.values(pessoais).some((valor) => valor !== "");
  const { error: erroPessoal } = temAlgum
    ? await supabase.from("staff_private").upsert({
        staff_id: colaboradorId,
        organization_id: empresaId,
        document: pessoais.documento || null,
        pix_key: pessoais.pix || null,
        phone_e164: pessoais.telefone || null,
        email: pessoais.email || null,
        notes: pessoais.observacoes || null,
      })
    : await supabase
        .from("staff_private")
        .delete()
        .eq("organization_id", empresaId)
        .eq("staff_id", colaboradorId);

  limpar();
  if (erroPessoal) {
    return {
      dados: { colaboradorId },
      erro: `O cadastro foi salvo, mas os dados pessoais não: ${traduzirErro(erroPessoal)}`,
    };
  }
  return {
    dados: { colaboradorId },
    aviso: dados.colaboradorId ? "Colaborador atualizado." : "Colaborador cadastrado.",
  };
}

/** Só leitura: os dados pessoais vêm sob demanda, quando o dono abre a edição. */
export async function carregarDadosPessoais(
  colaboradorId: string,
): Promise<Resposta<DadosPessoaisDaTela>> {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono vê os dados pessoais da equipe." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_private")
    .select("document, pix_key, phone_e164, email, notes")
    .eq("organization_id", vinculo.empresa.id)
    .eq("staff_id", colaboradorId)
    .maybeSingle();
  if (error) return { erro: error.message };

  return {
    dados: {
      documento: data?.document ?? "",
      pix: data?.pix_key ?? "",
      telefone: formatarTelefone(data?.phone_e164),
      email: data?.email ?? "",
      observacoes: data?.notes ?? "",
    },
  };
}

export async function desligarColaborador(entrada: DesligamentoInput): Promise<Resposta> {
  const validado = esquemaDesligamento.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira a data." };
  }

  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("staff_members")
    .select("started_on, anonymized_at")
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", validado.data.colaboradorId)
    .maybeSingle();
  if (!atual || atual.anonymized_at) return { erro: "Colaborador não encontrado." };
  if (validado.data.fim < atual.started_on) {
    return { erro: "O último dia não pode ser antes do início do trabalho." };
  }

  const { error } = await supabase
    .from("staff_members")
    .update({ ended_on: validado.data.fim })
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", validado.data.colaboradorId);
  if (error) return { erro: traduzirErro(error) };

  limpar();
  return { aviso: "Desligamento registrado." };
}

export async function removerColaborador(colaboradorId: string): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remover_colaborador", { p_staff: colaboradorId });
  if (error) return { erro: traduzirErro(error) };

  limpar({ agenda: true });
  return {
    aviso:
      data === "removido"
        ? "Colaborador removido."
        : "Dados pessoais apagados. Os pagamentos ficam no histórico como Ex-colaborador.",
  };
}

// ---------------------------------------------------------------------------
// Ausências
// ---------------------------------------------------------------------------

export async function registrarAusencia(entrada: AusenciaInput): Promise<Resposta> {
  const validado = esquemaAusencia.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira a ausência." };
  }

  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_ausencia", {
    p_staff: validado.data.colaboradorId,
    p_kind: validado.data.tipo,
    p_inicio: validado.data.inicio,
    p_fim: validado.data.fim,
  });
  if (error) return { erro: traduzirErro(error) };

  limpar({ agenda: true });
  return { aviso: "Ausência registrada." };
}

export async function excluirAusencia(ausenciaId: string): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_ausencia", { p_absence: ausenciaId });
  if (error) return { erro: traduzirErro(error) };

  limpar({ agenda: true });
  return { aviso: "Ausência excluída." };
}

// ---------------------------------------------------------------------------
// Pagamentos: viram despesa paga no financeiro, numa operação só.
// ---------------------------------------------------------------------------

export async function registrarPagamento(entrada: PagamentoEquipeInput): Promise<Resposta> {
  const validado = esquemaPagamentoEquipe.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira o pagamento." };
  }

  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const dados = validado.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pagamento_equipe", {
    p_staff: dados.colaboradorId,
    p_kind: dados.tipo,
    p_mes: `${dados.mes}-01`,
    p_valor_cents: dados.valorCents,
    p_pago_em: dados.pagoEm,
    p_conta: dados.contaId || null,
    p_forma: dados.forma ?? null,
  });
  if (error) return { erro: traduzirErro(error) };

  limpar({ financeiro: true });
  return { aviso: "Pagamento registrado e lançado no Financeiro." };
}

export async function excluirPagamento(pagamentoId: string): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_pagamento_equipe", { p_payment: pagamentoId });
  if (error) return { erro: traduzirErro(error) };

  limpar({ financeiro: true });
  return { aviso: "Pagamento excluído, junto com a despesa no Financeiro." };
}
