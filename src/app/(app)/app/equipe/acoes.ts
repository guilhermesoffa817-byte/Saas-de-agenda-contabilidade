"use server";

import { revalidatePath } from "next/cache";

import { basesDoMes, carregarColaboradores } from "./dados";
import type { DadosPessoaisDaTela } from "@/components/app/equipe/tipos";
import { hojeNaEmpresa } from "@/lib/dates";
import {
  ativoNoMes,
  contratosDoSegmento,
  formatarDia,
  remuneracaoDoVinculo,
  sugestoesDoMes,
  type ValorSugerido,
} from "@/lib/equipe";
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
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Recusa da 0015: trocar para parceria, MEI, PJ ou autônomo quem já tem histórico de emprego. */
const TROCA_DE_VINCULO_RECUSADA =
  "Esta pessoa já tem férias, faltas, salário ou outros registros de emprego, então o vínculo não pode virar parceria, MEI, PJ ou autônomo. Registre o desligamento deste cadastro e cadastre a pessoa de novo, com o vínculo novo.";

/** O banco já fala português; aqui só ficam amigáveis as mensagens técnicas. */
function traduzirErro(erro: { code?: string; message: string }) {
  if (erro.message.includes("Mês fechado")) return MES_FECHADO;
  if (erro.message.includes("registros de emprego")) return TROCA_DE_VINCULO_RECUSADA;
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
  let fimAtual: string | null = null;
  if (dados.colaboradorId) {
    const { data: atual } = await supabase
      .from("staff_members")
      .select("contract, anonymized_at, ended_on")
      .eq("organization_id", empresaId)
      .eq("id", dados.colaboradorId)
      .maybeSingle();
    if (!atual) return { erro: "Colaborador não encontrado." };
    if (atual.anonymized_at) return { erro: "Este colaborador foi removido e não pode ser editado." };
    contratoAtual = atual.contract;
    fimAtual = atual.ended_on;
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

  // Último dia preenchido (ou mudado) pela edição vale como desligamento.
  const agenda =
    registro.ended_on && registro.ended_on !== fimAtual && registro.professional_id
      ? await agendaDeQuemSai(supabase, vinculo.empresa, registro.professional_id, registro.ended_on)
      : "";

  limpar({ agenda: Boolean(agenda) });
  if (erroPessoal) {
    return {
      dados: { colaboradorId },
      erro: `O cadastro foi salvo, mas os dados pessoais não: ${traduzirErro(erroPessoal)}`,
    };
  }
  return {
    dados: { colaboradorId },
    aviso: (dados.colaboradorId ? "Colaborador atualizado." : "Colaborador cadastrado.") + agenda,
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

type ClienteDoBanco = Awaited<ReturnType<typeof createClient>>;

/**
 * Quem saiu não pode continuar recebendo agendamento online: desativa o
 * profissional ligado (o mesmo que o dono faria em Serviços e equipe). Os
 * atendimentos já marcados ficam na agenda. Devolve a frase para o aviso.
 */
async function desativarNaAgenda(
  supabase: ClienteDoBanco,
  empresaId: string,
  profissionalId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("professionals")
    .update({ active: false })
    .eq("organization_id", empresaId)
    .eq("id", profissionalId)
    .eq("active", true)
    .select("name");
  if (error) {
    return " Não conseguimos desativar o profissional ligado na agenda: desative em Serviços e equipe para parar os agendamentos online.";
  }
  const nome = data?.[0]?.name;
  if (!nome) return ""; // já estava inativo
  return ` O perfil de ${nome} na agenda foi desativado e não recebe mais agendamentos online. Os atendimentos já marcados continuam lá: remarque ou cancele se precisar.`;
}

/** Último dia no futuro: a agenda segue aberta até lá, e o dono precisa saber. */
async function lembrarDeDesativar(
  supabase: ClienteDoBanco,
  empresaId: string,
  profissionalId: string,
  fim: string,
): Promise<string> {
  const { data } = await supabase
    .from("professionals")
    .select("name, active")
    .eq("organization_id", empresaId)
    .eq("id", profissionalId)
    .maybeSingle();
  if (!data?.active) return "";
  return ` ${data.name} continua recebendo agendamentos online: depois de ${formatarDia(fim)}, desative o profissional em Serviços e equipe.`;
}

/** Desligamento com último dia até hoje desativa na agenda; com último dia no futuro, avisa. */
async function agendaDeQuemSai(
  supabase: ClienteDoBanco,
  empresa: { id: string; timezone: string },
  profissionalId: string,
  fim: string,
) {
  return fim <= hojeNaEmpresa(empresa.timezone)
    ? desativarNaAgenda(supabase, empresa.id, profissionalId)
    : lembrarDeDesativar(supabase, empresa.id, profissionalId, fim);
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
    .select("started_on, anonymized_at, professional_id")
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

  const agenda = atual.professional_id
    ? await agendaDeQuemSai(supabase, vinculo.empresa, atual.professional_id, validado.data.fim)
    : "";

  limpar({ agenda: Boolean(atual.professional_id) });
  return { aviso: `Desligamento registrado.${agenda}` };
}

export async function removerColaborador(colaboradorId: string): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  // Lido antes: a remoção apaga a ligação com a agenda.
  const { data: atual } = await supabase
    .from("staff_members")
    .select("professional_id")
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", colaboradorId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("remover_colaborador", { p_staff: colaboradorId });
  if (error) return { erro: traduzirErro(error) };

  const agenda = atual?.professional_id
    ? await desativarNaAgenda(supabase, vinculo.empresa.id, atual.professional_id)
    : "";

  limpar({ agenda: true, financeiro: data !== "removido" });
  return {
    aviso:
      (data === "removido"
        ? "Colaborador removido, com as ausências e os bloqueios que elas criaram na agenda."
        : "Colaborador removido. CPF, Pix, contato, observações, ausências e a ligação com a agenda foram apagados; os pagamentos ficam no Financeiro como “Ex-colaborador”, sem o nome.") +
      agenda,
  };
}

/**
 * Sugestões do diálogo de pagamento para outro mês de referência: a base da
 * comissão e os atendimentos DESSE mês, não do mês aberto na página.
 */
export async function sugestoesDePagamento(
  mes: string,
): Promise<Resposta<Record<string, ValorSugerido>>> {
  if (!MES.test(mes)) return { erro: "Escolha o mês de referência." };
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono vê os pagamentos da equipe." };

  const colaboradores = await carregarColaboradores(vinculo.empresa.id);
  const doMes = colaboradores.filter((c) => !c.removido && ativoNoMes(c, mes));
  const bases = await basesDoMes(vinculo.empresa.id, doMes, mes);
  return { dados: sugestoesDoMes(colaboradores, bases, mes) };
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
