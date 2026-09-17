import "server-only";

import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { LIMITE_MEI_ANUAL_CENTS, LIMITE_MEI_POR_MES_CENTS } from "@/lib/fiscal/constantes";
import { createClient } from "@/lib/supabase/server";

export type ResumoDoMes = {
  entrouCents: number;
  saiuCents: number;
  sobrouCents: number;
};

export type MesDoGrafico = { mes: string; rotulo: string; entrouCents: number; saiuCents: number };

export type DespesaPorCategoria = { categoria: string; valorCents: number };

export type Pendencia = {
  id: string;
  descricao: string;
  valorCents: number;
  vencimento: string;
  tipo: "receita" | "despesa";
};

const dia = (data: Date) => format(data, "yyyy-MM-dd");

/** Primeiro dia do mês, no formato que o banco usa para competência. */
export function primeiroDiaDoMes(mes: string) {
  return `${mes}-01`;
}

/** Entrou, saiu e sobrou pelo regime de caixa: o que foi efetivamente pago no mês. */
export async function resumoDoMes(empresaId: string, mes: string): Promise<ResumoDoMes> {
  const supabase = await createClient();
  const inicio = primeiroDiaDoMes(mes);
  const fim = dia(endOfMonth(new Date(`${inicio}T12:00:00Z`)));

  const { data } = await supabase
    .from("transactions")
    .select("kind, amount_cents")
    .eq("organization_id", empresaId)
    .eq("status", "pago")
    .gte("paid_at", inicio)
    .lte("paid_at", fim);

  const entrouCents = (data ?? [])
    .filter((item) => item.kind === "receita")
    .reduce((soma, item) => soma + item.amount_cents, 0);
  const saiuCents = (data ?? [])
    .filter((item) => item.kind === "despesa")
    .reduce((soma, item) => soma + item.amount_cents, 0);

  return { entrouCents, saiuCents, sobrouCents: entrouCents - saiuCents };
}

/** Últimos seis meses fechados mais o mês atual, para o gráfico de barras. */
export async function seisMeses(empresaId: string, mesAtual: string): Promise<MesDoGrafico[]> {
  const supabase = await createClient();
  const referencia = new Date(`${primeiroDiaDoMes(mesAtual)}T12:00:00Z`);
  const primeiro = startOfMonth(subMonths(referencia, 5));
  const ultimo = endOfMonth(referencia);

  const { data } = await supabase
    .from("transactions")
    .select("kind, amount_cents, paid_at")
    .eq("organization_id", empresaId)
    .eq("status", "pago")
    .gte("paid_at", dia(primeiro))
    .lte("paid_at", dia(ultimo));

  const meses: MesDoGrafico[] = Array.from({ length: 6 }, (_, indice) => {
    const data = addMonths(primeiro, indice);
    return {
      mes: format(data, "yyyy-MM"),
      rotulo: format(data, "MMM").replace(".", ""),
      entrouCents: 0,
      saiuCents: 0,
    };
  });

  for (const item of data ?? []) {
    if (!item.paid_at) continue;
    const chave = item.paid_at.slice(0, 7);
    const mes = meses.find((candidato) => candidato.mes === chave);
    if (!mes) continue;
    if (item.kind === "receita") mes.entrouCents += item.amount_cents;
    else mes.saiuCents += item.amount_cents;
  }

  return meses;
}

/** Ranking das maiores despesas pagas no mês, por categoria. */
export async function maioresDespesas(
  empresaId: string,
  mes: string,
  limite = 5,
): Promise<DespesaPorCategoria[]> {
  const supabase = await createClient();
  const inicio = primeiroDiaDoMes(mes);
  const fim = dia(endOfMonth(new Date(`${inicio}T12:00:00Z`)));

  const { data } = await supabase
    .from("transactions")
    .select("amount_cents, categories ( name )")
    .eq("organization_id", empresaId)
    .eq("kind", "despesa")
    .eq("status", "pago")
    .gte("paid_at", inicio)
    .lte("paid_at", fim);

  const porCategoria = new Map<string, number>();
  for (const item of data ?? []) {
    const categoria = (item.categories as unknown as { name: string } | null)?.name ?? "Sem categoria";
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + item.amount_cents);
  }

  return [...porCategoria.entries()]
    .map(([categoria, valorCents]) => ({ categoria, valorCents }))
    .sort((a, b) => b.valorCents - a.valorCents)
    .slice(0, limite);
}

/** A receber e a pagar dos próximos dias. */
export async function pendencias(empresaId: string, dias = 7): Promise<Pendencia[]> {
  const supabase = await createClient();
  const hoje = new Date();
  const limite = new Date(hoje.getTime() + dias * 86_400_000);

  const { data } = await supabase
    .from("transactions")
    .select("id, kind, description, amount_cents, due_date")
    .eq("organization_id", empresaId)
    .eq("status", "pendente")
    .not("due_date", "is", null)
    .lte("due_date", dia(limite))
    .order("due_date");

  return (data ?? []).map((item) => ({
    id: item.id,
    descricao: item.description,
    valorCents: item.amount_cents,
    vencimento: item.due_date!,
    tipo: item.kind,
  }));
}

/**
 * Termômetro do MEI: receita bruta recebida no ano contra o limite.
 * No ano de abertura, o limite é proporcional aos meses de atividade.
 */
export async function termometroMEI(params: {
  empresaId: string;
  ano: number;
  aberturaEm: string | null;
}) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("transactions")
    .select("amount_cents")
    .eq("organization_id", params.empresaId)
    .eq("kind", "receita")
    .eq("status", "pago")
    .gte("paid_at", `${params.ano}-01-01`)
    .lte("paid_at", `${params.ano}-12-31`);

  const recebidoCents = (data ?? []).reduce((soma, item) => soma + item.amount_cents, 0);

  let limiteCents = LIMITE_MEI_ANUAL_CENTS;
  let proporcional = false;

  if (params.aberturaEm) {
    const abertura = new Date(`${params.aberturaEm}T12:00:00Z`);
    if (abertura.getUTCFullYear() === params.ano) {
      const mesesDeAtividade = 12 - abertura.getUTCMonth();
      limiteCents = LIMITE_MEI_POR_MES_CENTS * mesesDeAtividade;
      proporcional = true;
    }
  }

  return {
    recebidoCents,
    limiteCents,
    proporcional,
    percentual: limiteCents > 0 ? recebidoCents / limiteCents : 0,
  };
}

export async function carregarCategorias(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, report_group, deductible_hint, accounting_code")
    .eq("organization_id", empresaId)
    .order("kind")
    .order("name");
  return data ?? [];
}

export async function carregarContas(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, name, type, accounting_code, active")
    .eq("organization_id", empresaId)
    .order("name");
  return data ?? [];
}

export type LancamentoDaLista = {
  id: string;
  tipo: "receita" | "despesa";
  situacao: "pendente" | "pago" | "cancelado";
  descricao: string;
  valorCents: number;
  competencia: string;
  vencimento: string | null;
  pagoEm: string | null;
  formaDePagamento: string | null;
  categoria: string | null;
  categoriaId: string | null;
  conta: string | null;
  contaId: string | null;
  comprovante: string | null;
  doAtendimento: boolean;
};

export async function carregarLancamentos(params: {
  empresaId: string;
  de: string;
  ate: string;
  tipo?: "receita" | "despesa";
  categoriaId?: string;
  situacao?: "pendente" | "pago" | "cancelado";
  limite?: number;
}): Promise<LancamentoDaLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("transactions")
    .select(
      `id, kind, status, description, amount_cents, competence_date, due_date, paid_at,
       payment_method, attachment_path, appointment_id, category_id, account_id,
       categories ( name ), accounts ( name )`,
    )
    .eq("organization_id", params.empresaId)
    .gte("competence_date", params.de)
    .lte("competence_date", params.ate)
    .order("competence_date", { ascending: false })
    .limit(params.limite ?? 200);

  if (params.tipo) consulta = consulta.eq("kind", params.tipo);
  if (params.categoriaId) consulta = consulta.eq("category_id", params.categoriaId);
  if (params.situacao) consulta = consulta.eq("status", params.situacao);

  const { data } = await consulta;

  return (data ?? []).map((item) => ({
    id: item.id,
    tipo: item.kind,
    situacao: item.status,
    descricao: item.description,
    valorCents: item.amount_cents,
    competencia: item.competence_date,
    vencimento: item.due_date,
    pagoEm: item.paid_at,
    formaDePagamento: item.payment_method,
    categoria: (item.categories as unknown as { name: string } | null)?.name ?? null,
    categoriaId: item.category_id,
    conta: (item.accounts as unknown as { name: string } | null)?.name ?? null,
    contaId: item.account_id,
    comprovante: item.attachment_path,
    doAtendimento: Boolean(item.appointment_id),
  }));
}

/** Mês fechado não aceita mudança: a tela precisa saber para esconder os botões. */
export async function mesesFechados(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_closings")
    .select("month, closed_at, reopened_at")
    .eq("organization_id", empresaId)
    .is("reopened_at", null);
  return (data ?? []).map((item) => item.month.slice(0, 7));
}
