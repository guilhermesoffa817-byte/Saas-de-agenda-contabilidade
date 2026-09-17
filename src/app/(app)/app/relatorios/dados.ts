import "server-only";

import type { LancamentoParaRelatorio } from "@/lib/reports/tipos";
import { createClient } from "@/lib/supabase/server";

/**
 * Lançamentos com tudo que os relatórios precisam. O nome e o CPF do pagador vêm
 * da visão de contabilidade, que entrega só esses campos — assim o mesmo código
 * serve para o dono e para o contador, e o contador nunca chega perto de telefone
 * ou anotação de cliente.
 */
export async function carregarLancamentosParaRelatorio(params: {
  empresaId: string;
  de: string;
  ate: string;
  /** Por padrão filtra pela competência; o Livro-Caixa filtra pelo pagamento. */
  por?: "competencia" | "pagamento";
}): Promise<LancamentoParaRelatorio[]> {
  const supabase = await createClient();
  const campo = params.por === "pagamento" ? "paid_at" : "competence_date";

  const { data } = await supabase
    .from("transactions")
    .select(
      `id, kind, status, description, amount_cents, competence_date, due_date, paid_at,
       payment_method, payer_type, revenue_type, nota_fiscal_emitida, receita_saude_emitido,
       attachment_path, client_id,
       categories ( name, report_group, deductible_hint, accounting_code ),
       accounts ( name, accounting_code )`,
    )
    .eq("organization_id", params.empresaId)
    .gte(campo, params.de)
    .lte(campo, params.ate)
    .order(campo);

  const linhas = data ?? [];
  const idsDeClientes = [...new Set(linhas.map((linha) => linha.client_id).filter(Boolean))] as string[];

  const pagadores = new Map<string, { nome: string; documento: string | null; tipo: string }>();
  if (idsDeClientes.length) {
    const { data: clientes } = await supabase
      .from("clientes_para_contabilidade")
      .select("id, name, document, payer_type")
      .in("id", idsDeClientes);

    for (const cliente of clientes ?? []) {
      pagadores.set(cliente.id, {
        nome: cliente.name,
        documento: cliente.document,
        tipo: cliente.payer_type,
      });
    }
  }

  return linhas.map((linha) => {
    const categoria = linha.categories as unknown as {
      name: string;
      report_group: string;
      deductible_hint: boolean;
      accounting_code: string | null;
    } | null;
    const conta = linha.accounts as unknown as {
      name: string;
      accounting_code: string | null;
    } | null;
    const pagador = linha.client_id ? pagadores.get(linha.client_id) : undefined;

    return {
      id: linha.id,
      tipo: linha.kind,
      situacao: linha.status,
      descricao: linha.description,
      valorCents: linha.amount_cents,
      competencia: linha.competence_date,
      pagoEm: linha.paid_at,
      vencimento: linha.due_date,
      categoria: categoria?.name ?? null,
      grupo: (categoria?.report_group ?? null) as LancamentoParaRelatorio["grupo"],
      dedutivelSugerido: categoria?.deductible_hint ?? false,
      codigoDaCategoria: categoria?.accounting_code ?? null,
      conta: conta?.name ?? null,
      codigoDaConta: conta?.accounting_code ?? null,
      formaDePagamento: linha.payment_method,
      pagador: (linha.payer_type ?? pagador?.tipo ?? null) as "pf" | "pj" | null,
      cliente: pagador?.nome ?? null,
      documentoDoCliente: pagador?.documento ?? null,
      tipoDeReceita: linha.revenue_type as LancamentoParaRelatorio["tipoDeReceita"],
      notaFiscalEmitida: linha.nota_fiscal_emitida,
      reciboSaudeEmitido: linha.receita_saude_emitido,
      comprovante: linha.attachment_path,
    };
  });
}

/** Modelo de exportação contábil da empresa (ou o padrão). */
export async function carregarModeloDeExportacao(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("export_templates")
    .select("id, name, columns, separator, date_format, decimal_comma")
    .eq("organization_id", empresaId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function carregarFechamentos(empresaId: string, limite = 12) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_closings")
    .select("month, closed_at, reopened_at, totals, package_path")
    .eq("organization_id", empresaId)
    .order("month", { ascending: false })
    .limit(limite);
  return data ?? [];
}
