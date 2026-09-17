import "server-only";

import { endOfMonth, format } from "date-fns";

import { createClient } from "@/lib/supabase/server";

export type Pendencia = {
  chave: string;
  titulo: string;
  explicacao: string;
  quantidade: number;
  /** Impede o fechamento? Nenhuma impede: são avisos para o dono decidir. */
  grave: boolean;
  link?: string;
};

/**
 * Checklist antes de fechar o mês. Nada aqui bloqueia o fechamento — a ideia é o
 * dono ver o que está faltando antes de mandar para o contador.
 */
export async function pendenciasDoMes(params: {
  empresaId: string;
  mes: string;
  regime: string;
}): Promise<Pendencia[]> {
  const supabase = await createClient();
  const de = `${params.mes}-01`;
  const ate = format(endOfMonth(new Date(`${de}T12:00:00Z`)), "yyyy-MM-dd");

  const [semCategoria, semForma, semComprovante, emAberto, saudePendente] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.empresaId)
      .gte("competence_date", de)
      .lte("competence_date", ate)
      .is("category_id", null),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.empresaId)
      .eq("status", "pago")
      .gte("paid_at", de)
      .lte("paid_at", ate)
      .is("payment_method", null),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.empresaId)
      .eq("kind", "despesa")
      .eq("status", "pago")
      .gte("paid_at", de)
      .lte("paid_at", ate)
      .is("attachment_path", null),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.empresaId)
      .eq("status", "pendente")
      .gte("competence_date", de)
      .lte("competence_date", ate),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.empresaId)
      .eq("kind", "receita")
      .eq("status", "pago")
      .neq("payer_type", "pj")
      .eq("receita_saude_emitido", false)
      .gte("paid_at", de)
      .lte("paid_at", ate),
  ]);

  const lista: Pendencia[] = [
    {
      chave: "sem-categoria",
      titulo: "Lançamentos sem categoria",
      explicacao: "Sem categoria eles não entram nos grupos do relatório do contador.",
      quantidade: semCategoria.count ?? 0,
      grave: true,
      link: `/app/financeiro/lancamentos?mes=${params.mes}`,
    },
    {
      chave: "sem-forma",
      titulo: "Recebimentos sem forma de pagamento",
      explicacao: "Pix, dinheiro, cartão: o contador usa isso para conferir o extrato.",
      quantidade: semForma.count ?? 0,
      grave: false,
      link: `/app/financeiro/lancamentos?mes=${params.mes}&situacao=pago`,
    },
    {
      chave: "sem-comprovante",
      titulo: "Despesas sem comprovante anexado",
      explicacao: "A foto do recibo evita o escritório pedir comprovante toda semana.",
      quantidade: semComprovante.count ?? 0,
      grave: false,
      link: `/app/financeiro/lancamentos?mes=${params.mes}&tipo=despesa`,
    },
    {
      chave: "em-aberto",
      titulo: "Lançamentos ainda em aberto",
      explicacao: "Eles não entram no fechamento, que conta só o que foi pago.",
      quantidade: emAberto.count ?? 0,
      grave: false,
      link: `/app/financeiro/lancamentos?mes=${params.mes}&situacao=pendente`,
    },
  ];

  if (params.regime === "pf_autonomo") {
    lista.push({
      chave: "receita-saude",
      titulo: "Recibos do Receita Saúde pendentes",
      explicacao: "Emita no app Receita Saúde e marque aqui como emitido.",
      quantidade: saudePendente.count ?? 0,
      grave: false,
      link: `/app/relatorios?tipo=receita-saude&de=${de}&ate=${ate}`,
    });
  }

  return lista;
}
