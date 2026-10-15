import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { endOfMonth, format } from "date-fns";

import type { Database } from "@/lib/supabase/database.types";

import {
  deslocarMes,
  eNatureza,
  montarResumoDeCustos,
  type DespesaParaCusto,
  type ReceitaParaCusto,
  type ResumoDeCustos,
} from "./calculo";
import { lerTodasAsPaginas } from "./paginar";

export type { ResumoDeCustos } from "./calculo";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

type LinhaDoBanco = {
  id: string;
  kind: "receita" | "despesa";
  description: string;
  amount_cents: number;
  paid_at: string | null;
  payment_method: string | null;
  appointment_id: string | null;
  client_id: string | null;
  category_id: string | null;
  categories: { name: string; report_group: string; cost_behavior: string | null } | null;
  transaction_cost_overrides: { cost_behavior: string; source: string; reason: string | null } | null;
};

const FONTES = ["ia", "regra", "dono"] as const;
type Fonte = (typeof FONTES)[number];
const eFonte = (valor: string): valor is Fonte => (FONTES as readonly string[]).includes(valor);

export type MovimentoDoPeriodo = { despesas: DespesaParaCusto[]; receitas: ReceitaParaCusto[] };

function paraDespesa(linha: LinhaDoBanco): DespesaParaCusto {
  const categoria = linha.categories;
  // Um-para-um (transaction_id é a chave): o PostgREST devolve objeto; a lista
  // fica coberta por garantia, caso a relação seja lida como um-para-muitos.
  const bruta = linha.transaction_cost_overrides as LinhaDoBanco["transaction_cost_overrides"] | unknown[];
  const excecao = (Array.isArray(bruta) ? (bruta[0] ?? null) : bruta) as LinhaDoBanco["transaction_cost_overrides"];
  return {
    id: linha.id,
    descricao: linha.description,
    valorCents: linha.amount_cents,
    pagoEm: linha.paid_at!,
    formaDePagamento: linha.payment_method,
    categoria: categoria?.name ?? null,
    categoriaId: linha.category_id,
    clienteId: linha.client_id,
    grupo: categoria?.report_group ?? null,
    naturezaDaCategoria: eNatureza(categoria?.cost_behavior) ? categoria.cost_behavior : null,
    excecao:
      excecao && eNatureza(excecao.cost_behavior) && eFonte(excecao.source)
        ? { natureza: excecao.cost_behavior, fonte: excecao.source, motivo: excecao.reason }
        : null,
  };
}

/**
 * Tudo o que foi pago entre `de` e `ate` (`yyyy-MM-dd`, inclusive) — regime de
 * caixa, o mesmo critério do painel do financeiro e do fechamento.
 */
export async function carregarMovimentoDoPeriodo(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  de: string,
  ate: string,
): Promise<MovimentoDoPeriodo> {
  const despesas: DespesaParaCusto[] = [];
  const receitas: ReceitaParaCusto[] = [];

  const brutas = await lerTodasAsPaginas((inicio, fim) =>
    supabase
      .from("transactions")
      .select(
        `id, kind, description, amount_cents, paid_at, payment_method, appointment_id, client_id, category_id,
         categories ( name, report_group, cost_behavior ),
         transaction_cost_overrides ( cost_behavior, source, reason )`,
      )
      .eq("organization_id", empresaId)
      .eq("status", "pago")
      .gte("paid_at", de)
      .lte("paid_at", ate)
      .order("id")
      .range(inicio, fim),
  );
  const linhas = brutas as unknown as LinhaDoBanco[];

  for (const linha of linhas) {
    if (!linha.paid_at) continue;
    if (linha.kind === "receita") {
      receitas.push({
        valorCents: linha.amount_cents,
        pagoEm: linha.paid_at,
        atendimentoId: linha.appointment_id,
      });
    } else {
      despesas.push(paraDespesa(linha));
    }
  }

  return { despesas, receitas };
}

/** Primeiro e último dia da janela de seis meses que termina em `mes`. */
export function janelaDeSeisMeses(mes: string) {
  const de = `${deslocarMes(mes, -5)}-01`;
  const ate = format(endOfMonth(new Date(`${mes}-01T12:00:00Z`)), "yyyy-MM-dd");
  return { de, ate };
}

/**
 * Custos operacionais do mês (`AAAA-MM`): fixos, variáveis, fora da operação,
 * margem de contribuição, ponto de equilíbrio, comparação com o mês anterior e
 * tendência de seis meses. Visão gerencial — não substitui o resumo do contador.
 *
 * Usa o cliente que receber: com o cliente do usuário, a RLS decide (só dono e
 * contador leem lançamentos).
 */
export async function resumoDeCustosDoMes(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  mes: string,
): Promise<ResumoDeCustos> {
  if (!MES.test(mes)) throw new Error("Mês inválido: use AAAA-MM.");
  const { de, ate } = janelaDeSeisMeses(mes);
  const movimento = await carregarMovimentoDoPeriodo(supabase, empresaId, de, ate);
  return montarResumoDeCustos({ mes, ...movimento });
}
