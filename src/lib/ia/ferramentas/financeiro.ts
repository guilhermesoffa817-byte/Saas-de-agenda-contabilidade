import "server-only";

import { sanitizarParaIA } from "@/lib/ia/sanitizar";
import { ROTULO_DO_GRUPO } from "@/lib/reports/tipos";

import {
  AVISO_CORTADO,
  brl,
  buscarTodas,
  diasDoPeriodo,
  esquemaPeriodo,
  ferramenta,
  ocultarNomes,
  percentual,
  periodoAnterior,
  variacao,
  type Periodo,
} from "./base";

/** Um lançamento pago, só com o que o resumo precisa. */
export type LancamentoDoResumo = {
  tipo: "receita" | "despesa";
  valorCents: number;
  pagoEm: string;
  descricao: string;
  temCliente: boolean;
  categoria: string | null;
  grupo: string | null;
};

/**
 * Categorias cujo lançamento descreve uma pessoa ("Salário — Juliana P."). A
 * descrição delas nunca vai para a IA; o total vai, agregado na categoria.
 */
const CATEGORIAS_DE_PESSOAL = new Set(["Salários e encargos", "Comissões e repasses a profissionais"]);

function somar(lista: LancamentoDoResumo[]) {
  return lista.reduce((total, item) => total + item.valorCents, 0);
}

function porCategoria(lista: LancamentoDoResumo[], total: number, limite: number) {
  const mapa = new Map<string, number>();
  for (const item of lista) {
    const nome = item.categoria ?? "Sem categoria";
    mapa.set(nome, (mapa.get(nome) ?? 0) + item.valorCents);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([categoria, cents]) => ({
      categoria,
      ...brl(cents),
      participacao: percentual(cents, total),
    }));
}

function totais(lista: LancamentoDoResumo[]) {
  const receitas = somar(lista.filter((l) => l.tipo === "receita"));
  const despesas = lista.filter((l) => l.tipo === "despesa");
  const retiradas = somar(despesas.filter((l) => l.grupo === "retirada"));
  const custos = somar(despesas.filter((l) => l.grupo !== "retirada"));
  return { receitas, custos, retiradas, resultado: receitas - custos };
}

/**
 * Regime de caixa (o mesmo do painel do Financeiro): só o que foi pago, pela
 * data do pagamento. A retirada do dono não é custo — fica numa linha à parte,
 * como no resumo do contador.
 */
export function resumirFinanceiro(
  lancamentos: LancamentoDoResumo[],
  periodo: Periodo,
  historico?: { primeiroPagamento: string | null; hoje: string },
  /** Nomes de profissionais e da equipe, tirados das descrições livres. */
  nomesDePessoas: string[] = [],
) {
  const anterior = periodoAnterior(periodo);
  const doPeriodo = lancamentos.filter((l) => l.pagoEm >= periodo.inicio && l.pagoEm <= periodo.fim);
  const doAnterior = lancamentos.filter((l) => l.pagoEm >= anterior.inicio && l.pagoEm <= anterior.fim);

  const atual = totais(doPeriodo);
  const antes = totais(doAnterior);
  const receitas = doPeriodo.filter((l) => l.tipo === "receita");
  const despesas = doPeriodo.filter((l) => l.tipo === "despesa" && l.grupo !== "retirada");

  const grupos = new Map<string, number>();
  for (const d of despesas) {
    const grupo = d.grupo ?? "operacional";
    grupos.set(grupo, (grupos.get(grupo) ?? 0) + d.valorCents);
  }

  // Descrição livre só de despesa comum: sem cliente, sem pessoa da equipe,
  // e limpa de CPF, telefone, e-mail e chave Pix antes de sair do servidor.
  const avulsas = despesas
    .filter((d) => !d.temCliente && !CATEGORIAS_DE_PESSOAL.has(d.categoria ?? ""))
    .sort((a, b) => b.valorCents - a.valorCents)
    .slice(0, 5)
    .map((d) => ({
      descricao: ocultarNomes(sanitizarParaIA(d.descricao), nomesDePessoas),
      categoria: d.categoria ?? "Sem categoria",
      pago_em: d.pagoEm,
      ...brl(d.valorCents),
    }));

  return {
    periodo: { ...periodo, dias: diasDoPeriodo(periodo) },
    ...(historico
      ? {
          historico_de_lancamentos: descreverHistorico(historico.primeiroPagamento, historico.hoje),
        }
      : {}),
    base: "Regime de caixa: lançamentos pagos, pela data do pagamento. Retirada do dono não entra como custo.",
    receitas: brl(atual.receitas),
    despesas: brl(atual.custos),
    resultado: brl(atual.resultado),
    retiradas_do_dono: brl(atual.retiradas),
    sobrou_depois_das_retiradas: brl(atual.resultado - atual.retiradas),
    margem: percentual(atual.resultado, atual.receitas),
    despesas_por_grupo: [...grupos.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([grupo, cents]) => ({
        grupo: ROTULO_DO_GRUPO[grupo] ?? grupo,
        ...brl(cents),
        participacao: percentual(cents, atual.custos),
      })),
    maiores_categorias_de_receita: porCategoria(receitas, atual.receitas, 5),
    maiores_categorias_de_despesa: porCategoria(despesas, atual.custos, 6),
    maiores_despesas_avulsas: avulsas,
    lancamentos_pagos_no_periodo: doPeriodo.length,
    periodo_anterior: {
      ...anterior,
      receitas: brl(antes.receitas),
      despesas: brl(antes.custos),
      resultado: brl(antes.resultado),
      lancamentos_pagos: doAnterior.length,
    },
    variacao_sobre_o_periodo_anterior: {
      receitas: variacao(atual.receitas, antes.receitas),
      despesas: variacao(atual.custos, antes.custos),
      resultado: variacao(atual.resultado, antes.resultado),
    },
  };
}

/** Menos de 30 dias de lançamentos pagos: o assistente avisa que a análise é frágil. */
export const DIAS_MINIMOS_DE_HISTORICO = 30;

export function descreverHistorico(primeiroPagamento: string | null, hoje: string) {
  if (!primeiroPagamento) {
    return {
      primeiro_lancamento_pago_em: null,
      dias_de_historico: 0,
      poucos_dados: true,
    };
  }
  const dias = Math.max(0, diasDoPeriodo({ inicio: primeiroPagamento, fim: hoje }));
  return {
    primeiro_lancamento_pago_em: primeiroPagamento,
    dias_de_historico: dias,
    poucos_dados: dias < DIAS_MINIMOS_DE_HISTORICO,
  };
}

type LinhaDoBanco = {
  kind: "receita" | "despesa";
  amount_cents: number;
  paid_at: string | null;
  description: string;
  client_id: string | null;
  categories: { name: string; report_group: string } | null;
};

export const resumoFinanceiro = ferramenta({
  nome: "resumo_financeiro",
  descricao:
    "Entradas e saídas pagas no período (regime de caixa): receitas, despesas por grupo e maiores categorias, resultado, retiradas do dono à parte e comparação com o período anterior de mesma duração. Valores em centavos e já formatados em R$. Use antes de afirmar qualquer número de faturamento, lucro ou despesa.",
  status: "Lendo o financeiro…",
  esquema: esquemaPeriodo,
  async executar(periodo, ctx) {
    const anterior = periodoAnterior(periodo);
    const primeiro = ctx.supabase
      .from("transactions")
      .select("paid_at")
      .eq("organization_id", ctx.empresa.id)
      .eq("status", "pago")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const consulta = buscarTodas<LinhaDoBanco>((de, ate) =>
      ctx.supabase
        .from("transactions")
        .select("kind, amount_cents, paid_at, description, client_id, categories ( name, report_group )")
        .eq("organization_id", ctx.empresa.id)
        .eq("status", "pago")
        .gte("paid_at", anterior.inicio)
        .lte("paid_at", periodo.fim)
        .order("id")
        .range(de, ate)
        .overrideTypes<LinhaDoBanco[], { merge: false }>(),
    );
    const [{ linhas, cortado }, { data: maisAntigo }, profissionais, equipe] = await Promise.all([
      consulta,
      primeiro,
      ctx.supabase.from("professionals").select("name").eq("organization_id", ctx.empresa.id),
      ctx.supabase.from("staff_members").select("name").eq("organization_id", ctx.empresa.id),
    ]);
    const nomesDePessoas = [...(profissionais.data ?? []), ...(equipe.data ?? [])].map((p) => p.name);

    const lancamentos: LancamentoDoResumo[] = linhas
      .filter((l) => l.paid_at)
      .map((l) => ({
        tipo: l.kind,
        valorCents: l.amount_cents,
        pagoEm: l.paid_at!,
        descricao: l.description,
        temCliente: Boolean(l.client_id),
        categoria: l.categories?.name ?? null,
        grupo: l.categories?.report_group ?? null,
      }));

    const resumo = resumirFinanceiro(
      lancamentos,
      periodo,
      {
        primeiroPagamento: maisAntigo?.paid_at ?? null,
        hoje: ctx.hoje,
      },
      nomesDePessoas,
    );
    return cortado ? { ...resumo, aviso: AVISO_CORTADO } : resumo;
  },
});
