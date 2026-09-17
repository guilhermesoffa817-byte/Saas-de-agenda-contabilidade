"use server";

import { addMonths, format } from "date-fns";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";
import {
  esquemaBaixa,
  esquemaCategoria,
  esquemaConclusaoComPagamento,
  esquemaConta,
  esquemaLancamento,
  type BaixaInput,
  type CategoriaInput,
  type ConclusaoComPagamentoInput,
  type ContaInput,
  type LancamentoInput,
} from "@/lib/validacao/financeiro";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

const MES_FECHADO = "Este mês já foi fechado. Reabra o fechamento para alterar lançamentos.";

function limpar() {
  revalidatePath("/app/financeiro");
  revalidatePath("/app/financeiro/lancamentos");
  revalidatePath("/app");
}

/** O gatilho do banco recusa mudança em mês fechado; aqui a mensagem fica amigável. */
function traduzirErro(mensagem: string) {
  if (mensagem.includes("Mês fechado")) return MES_FECHADO;
  return mensagem;
}

async function contexto() {
  const { vinculo } = await empresaAtual();
  return vinculo;
}

export async function salvarLancamento(entrada: LancamentoInput): Promise<Resposta> {
  const validado = esquemaLancamento.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados do lançamento." };
  }

  const vinculo = await contexto();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };
  if (vinculo.papel !== "dono" && !(vinculo.papel === "recepcao" && validado.data.tipo === "receita")) {
    return { erro: "Seu acesso não permite lançar isso." };
  }

  const dados = validado.data;
  const supabase = await createClient();

  const base = {
    organization_id: vinculo.empresa.id,
    kind: dados.tipo,
    status: dados.pago ? ("pago" as const) : ("pendente" as const),
    description: dados.descricao,
    amount_cents: dados.valor,
    paid_at: dados.pago ? dados.dataPagamento! : null,
    due_date: dados.dataVencimento || null,
    payment_method: dados.pago ? (dados.formaDePagamento ?? null) : null,
    category_id: dados.categoriaId || null,
    account_id: dados.contaId || null,
    client_id: dados.clienteId || null,
    attachment_path: dados.comprovante || null,
  };

  if (dados.lancamentoId) {
    const { error } = await supabase
      .from("transactions")
      .update({ ...base, competence_date: dados.competencia })
      .eq("organization_id", vinculo.empresa.id)
      .eq("id", dados.lancamentoId);
    if (error) return { erro: traduzirErro(error.message) };
    limpar();
    return { aviso: "Lançamento atualizado." };
  }

  // Lançamento recorrente: repete o mesmo valor nos meses seguintes (aluguel, internet).
  const repeticoes = Math.max(1, dados.repetirMeses);
  const linhas = Array.from({ length: repeticoes }, (_, indice) => {
    const deslocar = (data: string | null) =>
      data ? format(addMonths(new Date(`${data}T12:00:00Z`), indice), "yyyy-MM-dd") : null;

    return {
      ...base,
      competence_date: deslocar(dados.competencia)!,
      paid_at: indice === 0 ? base.paid_at : null,
      status: indice === 0 ? base.status : ("pendente" as const),
      payment_method: indice === 0 ? base.payment_method : null,
      due_date: deslocar(dados.dataVencimento || dados.dataPagamento || dados.competencia),
      attachment_path: indice === 0 ? base.attachment_path : null,
    };
  });

  const { error } = await supabase.from("transactions").insert(linhas);
  if (error) return { erro: traduzirErro(error.message) };

  limpar();
  return {
    aviso:
      repeticoes > 1
        ? `Lançamento criado e repetido por ${repeticoes} meses.`
        : "Lançamento criado.",
  };
}

export async function excluirLancamento(lancamentoId: string): Promise<Resposta> {
  const vinculo = await contexto();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono exclui lançamentos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", lancamentoId);

  if (error) return { erro: traduzirErro(error.message) };
  limpar();
  return { aviso: "Lançamento excluído." };
}

/** Dar baixa: o que estava a receber ou a pagar virou pago. */
export async function darBaixa(entrada: BaixaInput): Promise<Resposta> {
  const validado = esquemaBaixa.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados da baixa." };
  }

  const vinculo = await contexto();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({
      status: "pago",
      paid_at: validado.data.dataPagamento,
      payment_method: validado.data.formaDePagamento,
      account_id: validado.data.contaId || null,
    })
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", validado.data.lancamentoId);

  if (error) return { erro: traduzirErro(error.message) };
  limpar();
  return { aviso: "Pagamento registrado." };
}

/**
 * O momento em que a agenda encontra o financeiro: concluir o atendimento e
 * lançar o recebimento numa só operação, feita pelo banco.
 */
export async function concluirComPagamento(
  entrada: ConclusaoComPagamentoInput,
): Promise<Resposta<{ lancamentoId: string }>> {
  const validado = esquemaConclusaoComPagamento.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados do pagamento." };
  }

  const vinculo = await contexto();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("concluir_atendimento", {
    p_appointment: validado.data.atendimentoId,
    p_metodo: validado.data.formaDePagamento,
    p_valor_cents: validado.data.valor,
    p_conta: validado.data.contaId || null,
  });

  if (error) return { erro: traduzirErro(error.message) };

  revalidatePath("/app/agenda");
  limpar();
  return { dados: { lancamentoId: data }, aviso: "Atendimento concluído e recebimento lançado." };
}

export async function salvarCategoria(entrada: CategoriaInput): Promise<Resposta> {
  const validado = esquemaCategoria.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira a categoria." };
  }

  const vinculo = await contexto();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono altera categorias." };

  const supabase = await createClient();
  const registro = {
    organization_id: vinculo.empresa.id,
    name: validado.data.nome,
    kind: validado.data.tipo,
    report_group: validado.data.grupo,
    deductible_hint: validado.data.sugestaoDedutivel,
    accounting_code: validado.data.codigoContabil || null,
  };

  const { error } = validado.data.categoriaId
    ? await supabase
        .from("categories")
        .update(registro)
        .eq("organization_id", vinculo.empresa.id)
        .eq("id", validado.data.categoriaId)
    : await supabase.from("categories").insert(registro);

  if (error) {
    if (error.code === "23505") return { erro: "Já existe uma categoria com esse nome." };
    return { erro: error.message };
  }

  revalidatePath("/app/financeiro/categorias");
  limpar();
  return { aviso: "Categoria salva." };
}

export async function salvarConta(entrada: ContaInput): Promise<Resposta> {
  const validado = esquemaConta.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira a conta." };
  }

  const vinculo = await contexto();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono altera contas." };

  const supabase = await createClient();
  const registro = {
    organization_id: vinculo.empresa.id,
    name: validado.data.nome,
    type: validado.data.tipo,
    accounting_code: validado.data.codigoContabil || null,
    active: validado.data.ativa,
  };

  const { error } = validado.data.contaId
    ? await supabase
        .from("accounts")
        .update(registro)
        .eq("organization_id", vinculo.empresa.id)
        .eq("id", validado.data.contaId)
    : await supabase.from("accounts").insert(registro);

  if (error) return { erro: error.message };

  revalidatePath("/app/financeiro/categorias");
  limpar();
  return { aviso: "Conta salva." };
}

/** Link temporário do comprovante (o bucket é privado). */
export async function linkDoComprovante(caminho: string): Promise<Resposta<{ url: string }>> {
  // Leitura: liberada mesmo em modo somente leitura.
  const vinculo = await contexto();
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (!caminho.startsWith(`${vinculo.empresa.id}/`)) {
    return { erro: "Comprovante de outra empresa." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(caminho, 60 * 10);

  if (error || !data) return { erro: "Não conseguimos abrir o comprovante." };
  return { dados: { url: data.signedUrl } };
}
