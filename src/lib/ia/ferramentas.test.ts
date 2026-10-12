import { describe, expect, it, vi } from "vitest";

import { montarResumoDeCustos } from "@/lib/custos/calculo";
import { LIMITE_MEI_ANUAL_CENTS, LIMITE_MEI_POR_MES_CENTS } from "@/lib/fiscal/constantes";
import { formatarBRL } from "@/lib/money";

import { executarFerramenta, FERRAMENTAS, ferramentasDaApi, statusDaFerramenta } from "./ferramentas";
import { analisarAgenda } from "./ferramentas/agenda";
import {
  esquemaPeriodo,
  MESES_MAXIMOS,
  ocultarNomes,
  periodoAnterior,
  periodoDoMes,
  primeirosNomes,
} from "./ferramentas/base";
import { contarClientes } from "./ferramentas/clientes";
import { custosParaOModelo } from "./ferramentas/custos";
import { contarEquipe } from "./ferramentas/equipe";
import { descreverHistorico, resumirFinanceiro } from "./ferramentas/financeiro";
import { avaliarLimiteDoMei, limiteDoAno } from "./ferramentas/mei";
import { analisarServicos } from "./ferramentas/servicos";
import type { ContextoFerramenta } from "./ferramentas";

const resumoDeCustos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/custos/resumo", () => ({ resumoDeCustosDoMes: resumoDeCustos }));

/* ------------------------------------------------- Supabase falso */

type Linha = Record<string, unknown>;

/**
 * Imita o construtor de consultas do supabase-js: guarda os filtros e devolve as
 * linhas da tabela (paginadas por `range`). Não filtra de verdade — o que se
 * testa é o que a ferramenta faz com o que o banco devolve.
 */
function supabaseFalso(tabelas: Record<string, Linha[]>) {
  const filtros: { tabela: string; metodo: string; args: unknown[] }[] = [];
  const from = (tabela: string) => {
    let faixa: [number, number] | null = null;
    let unica = false;
    const consulta: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "is", "gte", "lte", "lt", "gt", "not", "order", "limit", "in", "overrideTypes"]) {
      consulta[metodo] = (...args: unknown[]) => {
        filtros.push({ tabela, metodo, args });
        return consulta;
      };
    }
    consulta.range = (de: number, ate: number) => {
      faixa = [de, ate];
      return consulta;
    };
    consulta.maybeSingle = () => {
      unica = true;
      return consulta;
    };
    consulta.then = (resolver: (v: unknown) => unknown, rejeitar: (e: unknown) => unknown) => {
      const linhas = tabelas[tabela] ?? [];
      const dados = unica ? (linhas[0] ?? null) : faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas;
      return Promise.resolve({ data: dados, error: null }).then(resolver, rejeitar);
    };
    return consulta;
  };
  return { cliente: { from } as unknown as ContextoFerramenta["supabase"], filtros };
}

const EMPRESA = "11111111-1111-4111-8111-111111111111";

function contexto(tabelas: Record<string, Linha[]>, regime: "mei" | "simples_nacional" = "simples_nacional") {
  const { cliente, filtros } = supabaseFalso(tabelas);
  const ctx: ContextoFerramenta = {
    supabase: cliente,
    empresa: { id: EMPRESA, timezone: "America/Sao_Paulo", tax_regime: regime, opened_on: "2021-03-10" },
    hoje: "2026-10-12",
  };
  return { ctx, filtros };
}

async function rodar(nome: string, entrada: unknown, ctx: ContextoFerramenta) {
  const r = await executarFerramenta({ id: "tu1", name: nome, input: entrada }, ctx);
  return { ...r, texto: String(r.content) };
}

/* Dados com tudo o que NUNCA pode sair para a IA. */
const PESSOAIS = [
  "Maria Souza",
  "Souza",
  "Juliana Prado",
  "Prado",
  "Rafael Lima",
  "Lima",
  "123.456.789-09",
  "12345678909",
  "(65) 99999-1234",
  "65999991234",
  "maria@exemplo.com.br",
  "cliente-maria",
  "Alergia a amônia",
  "chave-pix-juliana",
];

const TRANSACOES: Linha[] = [
  {
    kind: "receita",
    amount_cents: 18_000,
    paid_at: "2026-09-05",
    description: "Atendimento — Maria Souza",
    client_id: "cliente-maria",
    categories: { name: "Atendimentos", report_group: "operacional" },
  },
  {
    kind: "receita",
    amount_cents: 1_232_000,
    paid_at: "2026-09-20",
    description: "Atendimentos do mês",
    client_id: null,
    categories: { name: "Atendimentos", report_group: "operacional" },
  },
  {
    kind: "despesa",
    amount_cents: 250_000,
    paid_at: "2026-09-10",
    description: "Aluguel — pago a Rafael Lima, CPF 123.456.789-09, tel (65) 99999-1234",
    client_id: null,
    categories: { name: "Aluguel do espaço", report_group: "operacional" },
  },
  {
    kind: "despesa",
    amount_cents: 190_000,
    paid_at: "2026-09-30",
    description: "Salário — Juliana Prado",
    client_id: null,
    categories: { name: "Salários e encargos", report_group: "operacional" },
  },
  {
    kind: "despesa",
    amount_cents: 300_000,
    paid_at: "2026-09-30",
    description: "Retirada",
    client_id: null,
    categories: { name: "Retirada do dono", report_group: "retirada" },
  },
  {
    kind: "despesa",
    amount_cents: 4_990,
    paid_at: "2026-09-15",
    description: "Reembolso maria@exemplo.com.br",
    client_id: "cliente-maria",
    categories: { name: "Outras despesas", report_group: "operacional" },
  },
  {
    kind: "receita",
    amount_cents: 1_000_000,
    paid_at: "2026-08-20",
    description: "Agosto",
    client_id: null,
    categories: { name: "Atendimentos", report_group: "operacional" },
  },
];

const PROFISSIONAIS: Linha[] = [
  { id: "p1", name: "Juliana Prado", active: true },
  { id: "p2", name: "Rafael Lima", active: true },
];

const ATENDIMENTOS: Linha[] = [
  // Domingo 04/10 22:30 em Brasília (segunda 01:30 UTC).
  { id: "a1", professional_id: "p1", client_id: "cliente-maria", service_id: "s1", status: "concluido", starts_at: "2026-10-05T01:30:00Z", ends_at: "2026-10-05T02:30:00Z", transactions: [{ amount_cents: 9_000, kind: "receita", status: "pago" }] },
  { id: "a2", professional_id: "p2", client_id: "cliente-maria", service_id: "s1", status: "faltou", starts_at: "2026-10-06T13:00:00Z", ends_at: "2026-10-06T14:00:00Z", transactions: [] },
  { id: "a3", professional_id: "p1", client_id: "cliente-joao", service_id: "s2", status: "concluido", starts_at: "2026-10-07T15:00:00Z", ends_at: "2026-10-07T15:45:00Z", transactions: { amount_cents: 6_000, kind: "receita", status: "pago" } },
  { id: "a4", professional_id: "p2", client_id: "cliente-joao", service_id: "s2", status: "cancelado", starts_at: "2026-10-08T21:30:00Z", ends_at: "2026-10-08T22:00:00Z", transactions: null },
];

const TABELAS: Record<string, Linha[]> = {
  transactions: TRANSACOES,
  professionals: PROFISSIONAIS,
  appointments: ATENDIMENTOS,
  working_hours: [
    { professional_id: "p1", weekday: 1, start_time: "09:00:00", end_time: "18:00:00" },
    { professional_id: "p2", weekday: 2, start_time: "09:00", end_time: "13:00" },
  ],
  services: [
    { id: "s1", name: "Corte feminino", duration_min: 60, price_cents: 9_000, active: true },
    { id: "s2", name: "Escova", duration_min: 45, price_cents: 6_000, active: true },
    { id: "s3", name: "Coloração", duration_min: 120, price_cents: 22_000, active: true },
  ],
  staff_members: [
    { name: "Juliana Prado", contract: "parceria", started_on: "2025-01-10", ended_on: null, pix_key: "chave-pix-juliana" },
    { name: "Rafael Lima", contract: "clt", started_on: "2026-11-01", ended_on: null },
  ],
  staff_payments: [
    { kind: "cota_parte", amount_cents: 190_000, staff_id: "st1" },
    { kind: "salario", amount_cents: 150_000, staff_id: "st2" },
  ],
  clients: [{ id: "cliente-maria", name: "Maria Souza", phone_e164: "+5565999991234", notes: "Alergia a amônia" }],
};

const despesaDeCusto = (id: string, categoria: string, natureza: "fixo" | "variavel", valorCents: number, descricao: string) => ({
  id,
  descricao,
  valorCents,
  pagoEm: "2026-09-10",
  formaDePagamento: "pix",
  categoria,
  categoriaId: `cat-${id}`,
  grupo: "operacional",
  naturezaDaCategoria: natureza,
  excecao: null,
});

const RESUMO_DE_CUSTOS = montarResumoDeCustos({
  mes: "2026-09",
  despesas: [
    despesaDeCusto("d1", "Aluguel do espaço", "fixo", 250_000, "Aluguel pago a (65) 99999-1234"),
    despesaDeCusto("d2", "Salários e encargos", "fixo", 190_000, "Salário — Juliana Prado"),
    despesaDeCusto("d3", "Materiais e insumos", "variavel", 50_000, "Shampoo"),
    despesaDeCusto("d4", "Materiais e insumos", "variavel", 30_000, "Tintas"),
  ],
  receitas: [{ valorCents: 1_000_000, pagoEm: "2026-09-20", atendimentoId: null }],
});

/* ------------------------------------------------- testes */

describe("nenhum dado pessoal sai para a IA", () => {
  const entradas: Record<string, unknown> = {
    resumo_financeiro: { inicio: "2026-09-01", fim: "2026-09-30" },
    desempenho_dos_servicos: { inicio: "2026-10-01", fim: "2026-10-31" },
    agenda_e_ocupacao: { inicio: "2026-10-01", fim: "2026-10-31" },
    clientes_em_numeros: { inicio: "2026-10-01", fim: "2026-10-31" },
    custos_operacionais: { mes: "2026-09" },
    equipe_em_numeros: { mes: "2026-09" },
    limite_do_mei: {},
  };

  it("cada ferramenta tem uma entrada de teste", () => {
    expect(Object.keys(entradas).sort()).toEqual(FERRAMENTAS.map((f) => f.nome).sort());
  });

  for (const [nome, entrada] of Object.entries(entradas)) {
    it(`${nome}: sem nome, contato, documento, anotação nem id de cliente`, async () => {
      resumoDeCustos.mockResolvedValue(RESUMO_DE_CUSTOS);
      const { ctx } = contexto(TABELAS, "mei");
      const r = await rodar(nome, entrada, ctx);
      expect(r.is_error, r.texto).toBeFalsy();
      for (const proibido of PESSOAIS) expect(r.texto, `${nome} vazou "${proibido}"`).not.toContain(proibido);
    });
  }

  it("profissional aparece só pelo primeiro nome", async () => {
    const { ctx } = contexto(TABELAS);
    const r = await rodar("agenda_e_ocupacao", { inicio: "2026-10-01", fim: "2026-10-31" }, ctx);
    expect(r.texto).toContain('"profissional":"Juliana"');
    expect(r.texto).toContain('"profissional":"Rafael"');
  });
});

describe("a empresa vem do servidor, nunca do modelo", () => {
  it("ignora organization_id na entrada e filtra pela empresa da sessão", async () => {
    const { ctx, filtros } = contexto(TABELAS);
    const outra = "22222222-2222-4222-8222-222222222222";
    for (const nome of ["resumo_financeiro", "desempenho_dos_servicos", "agenda_e_ocupacao", "clientes_em_numeros"]) {
      await rodar(nome, { inicio: "2026-09-01", fim: "2026-09-30", organization_id: outra }, ctx);
    }
    await rodar("equipe_em_numeros", { mes: "2026-09", organization_id: outra }, ctx);
    const daEmpresa = filtros.filter((f) => f.metodo === "eq" && f.args[0] === "organization_id");
    expect(daEmpresa.length).toBeGreaterThan(5);
    expect(daEmpresa.every((f) => f.args[1] === EMPRESA)).toBe(true);
    expect(JSON.stringify(filtros)).not.toContain(outra);
  });

  it("custos recebem a empresa da sessão", async () => {
    resumoDeCustos.mockResolvedValue(RESUMO_DE_CUSTOS);
    const { ctx } = contexto(TABELAS);
    await rodar("custos_operacionais", { mes: "2026-09", empresaId: "outra" }, ctx);
    expect(resumoDeCustos).toHaveBeenLastCalledWith(ctx.supabase, EMPRESA, "2026-09");
  });
});

describe("validação da entrada do modelo", () => {
  const { ctx } = contexto(TABELAS);

  it.each([
    [{ inicio: "2026-09-30", fim: "2026-09-01" }, /antes da inicial/],
    [{ inicio: "2026-02-30", fim: "2026-03-10" }, /inicial inválida/],
    [{ inicio: "01/09/2026", fim: "2026-09-30" }, /AAAA-MM-DD/],
    [{ inicio: "2024-01-01", fim: "2026-01-01" }, new RegExp(`${MESES_MAXIMOS} meses`)],
    [{ inicio: "2026-09-01" }, /Entrada inválida/],
  ])("recusa período %j", async (entrada, motivo) => {
    const r = await rodar("resumo_financeiro", entrada, ctx);
    expect(r.is_error).toBe(true);
    expect(r.texto).toMatch(motivo);
  });

  it("aceita exatamente 24 meses menos um dia", () => {
    expect(esquemaPeriodo.safeParse({ inicio: "2024-10-13", fim: "2026-10-12" }).success).toBe(true);
  });

  it("recusa mês fora do formato", async () => {
    const r = await rodar("equipe_em_numeros", { mes: "2026-13" }, ctx);
    expect(r.is_error).toBe(true);
  });

  it("ferramenta desconhecida vira erro, não exceção", async () => {
    const r = await rodar("apagar_tudo", {}, ctx);
    expect(r.is_error).toBe(true);
  });

  it("falha do banco vira erro para o modelo, sem detalhe técnico", async () => {
    const quebrado = {
      ...ctx,
      supabase: {
        from: () => {
          throw new Error("connection refused 10.0.0.1");
        },
      } as unknown as ContextoFerramenta["supabase"],
    };
    const r = await rodar("resumo_financeiro", { inicio: "2026-09-01", fim: "2026-09-30" }, quebrado);
    expect(r.is_error).toBe(true);
    expect(r.texto).not.toContain("10.0.0.1");
  });
});

describe("resumo financeiro", () => {
  const lancamentos = TRANSACOES.map((t) => ({
    tipo: t.kind as "receita" | "despesa",
    valorCents: t.amount_cents as number,
    pagoEm: t.paid_at as string,
    descricao: t.description as string,
    temCliente: Boolean(t.client_id),
    categoria: (t.categories as { name: string }).name,
    grupo: (t.categories as { report_group: string }).report_group,
  }));
  const resumo = resumirFinanceiro(lancamentos, { inicio: "2026-09-01", fim: "2026-09-30" });

  it("soma em centavos inteiros e manda o texto já em R$", () => {
    expect(resumo.receitas).toEqual({ cents: 1_250_000, texto: formatarBRL(1_250_000) });
    expect(resumo.despesas.cents).toBe(250_000 + 190_000 + 4_990);
    expect(resumo.resultado.cents).toBe(1_250_000 - 444_990);
    expect(Number.isInteger(resumo.resultado.cents)).toBe(true);
  });

  it("retirada do dono não é custo", () => {
    expect(resumo.retiradas_do_dono.cents).toBe(300_000);
    expect(resumo.sobrou_depois_das_retiradas.cents).toBe(1_250_000 - 444_990 - 300_000);
  });

  it("compara com o período anterior de mesma duração", () => {
    expect(resumo.periodo_anterior).toMatchObject({ inicio: "2026-08-02", fim: "2026-08-31" });
    expect(resumo.periodo_anterior.receitas.cents).toBe(1_000_000);
    expect(resumo.variacao_sobre_o_periodo_anterior.receitas).toBe("+25%");
  });

  it("descrição avulsa passa pela limpeza e não traz salário nem lançamento de cliente", () => {
    expect(resumo.maiores_despesas_avulsas).toHaveLength(1);
    expect(resumo.maiores_despesas_avulsas[0].descricao).toBe("Aluguel — pago a Rafael Lima, CPF [cpf], tel [telefone]");
  });

  it("nomes conhecidos de profissionais e da equipe saem da descrição", () => {
    const r = resumirFinanceiro(lancamentos, { inicio: "2026-09-01", fim: "2026-09-30" }, undefined, ["Rafael Lima"]);
    expect(r.maiores_despesas_avulsas[0].descricao).toBe("Aluguel — pago a [nome], CPF [cpf], tel [telefone]");
    expect(ocultarNomes("Limão e LIMA, de Ana", ["Rafael Lima", "Ana"])).toBe("Limão e [nome], de [nome]");
    expect(ocultarNomes("Comissão Júlia Andrade", ["Júlia Andrade"])).toBe("Comissão [nome]");
  });

  it("avisa quando há menos de 30 dias de lançamentos", () => {
    expect(descreverHistorico("2026-09-20", "2026-10-12")).toMatchObject({ dias_de_historico: 23, poucos_dados: true });
    expect(descreverHistorico("2026-01-02", "2026-10-12").poucos_dados).toBe(false);
    expect(descreverHistorico(null, "2026-10-12").poucos_dados).toBe(true);
  });
});

describe("serviços, agenda e clientes", () => {
  it("serviço: ticket médio, receita por hora e serviço sem venda", () => {
    const r = analisarServicos(
      [
        { id: "s1", nome: "Corte feminino", duracaoMin: 60, precoCents: 9_000, ativo: true },
        { id: "s3", nome: "Coloração", duracaoMin: 120, precoCents: 22_000, ativo: true },
      ],
      [
        { servicoId: "s1", status: "concluido", minutos: 60, recebidoCents: 9_000 },
        { servicoId: "s1", status: "concluido", minutos: 30, recebidoCents: 8_000 },
        { servicoId: "s1", status: "faltou", minutos: 60, recebidoCents: 0 },
      ],
      { inicio: "2026-10-01", fim: "2026-10-31" },
    );
    const corte = r.por_servico[0];
    expect(corte.atendimentos_concluidos).toBe(2);
    expect(corte.ticket_medio.cents).toBe(8_500);
    expect(corte.receita_por_hora_de_agenda?.cents).toBe(11_333); // 17.000 em 90 min
    expect(corte.faltas).toBe(1);
    expect(r.servicos_ativos_sem_atendimento_concluido.map((s) => s.servico)).toEqual(["Coloração"]);
  });

  it("agenda: dia da semana e faixa de horário no fuso da empresa", () => {
    const r = analisarAgenda({
      atendimentos: [
        { profissionalId: "p1", status: "concluido", inicio: "2026-10-05T01:30:00Z", fim: "2026-10-05T02:30:00Z" },
        { profissionalId: "p1", status: "faltou", inicio: "2026-10-06T13:00:00Z", fim: "2026-10-06T14:00:00Z" },
        { profissionalId: "p2", status: "cancelado", inicio: "2026-10-06T15:00:00Z", fim: "2026-10-06T16:00:00Z" },
      ],
      jornadas: [{ profissionalId: "p1", diaDaSemana: 2, inicio: "09:00", fim: "13:00" }],
      profissionais: [
        { id: "p1", name: "Juliana Prado", active: true },
        { id: "p2", name: "Rafael Lima", active: true },
      ],
      periodo: { inicio: "2026-10-04", fim: "2026-10-10" },
      fuso: "America/Sao_Paulo",
    });
    const domingo = r.por_dia_da_semana.find((d) => d.dia === "Domingo");
    expect(domingo?.atendimentos).toBe(1); // 22:30 de domingo em Brasília, segunda em UTC
    expect(r.por_faixa_de_horario.find((f) => f.faixa.startsWith("Noite"))?.atendimentos).toBe(1);
    const terca = r.por_dia_da_semana.find((d) => d.dia === "Terça-feira");
    expect(terca).toMatchObject({ atendimentos: 1, faltas: 1, cancelados: 1, horas_de_atendimento_cadastradas: 4 });
    expect(terca?.ocupacao).toBe("25%");
    expect(r.taxa_de_faltas).toBe("50%");
  });

  it("primeiro nome, com desempate estável para nomes iguais", () => {
    const nomes = primeirosNomes([
      { id: "b", name: "Ana Paula Costa" },
      { id: "a", name: "Ana Ribeiro" },
    ]);
    expect(nomes.get("a")).toBe("Ana");
    expect(nomes.get("b")).toBe("Ana (2)");
  });

  it("clientes: só contagens", () => {
    const r = contarClientes(
      [
        { clienteId: "c1", dia: "2026-05-01", recebidoCents: 9_000 },
        { clienteId: "c1", dia: "2026-10-03", recebidoCents: 9_000 },
        { clienteId: "c2", dia: "2026-10-04", recebidoCents: 6_000 },
        { clienteId: "c2", dia: "2026-10-09", recebidoCents: 6_000 },
        { clienteId: "c3", dia: "2026-06-01", recebidoCents: 5_000 },
      ],
      { inicio: "2026-10-01", fim: "2026-10-31" },
      "2026-10-12",
    );
    expect(r).toMatchObject({
      clientes_atendidos_no_periodo: 2,
      clientes_novos: 1,
      clientes_que_voltaram: 1,
      novos_que_voltaram_dentro_do_periodo: 1,
      atendimentos_concluidos_no_periodo: 3,
      frequencia_media_por_cliente: 1.5,
      ticket_medio_por_cliente: { cents: 10_500 },
    });
    expect(r.inativos.quantidade).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/"c[123]"/);
  });
});

describe("equipe, custos e MEI", () => {
  it("equipe: totais por vínculo e por tipo, nunca por pessoa", () => {
    const r = contarEquipe(
      [
        { vinculo: "parceria", inicio: "2025-01-10", fim: null },
        { vinculo: "clt", inicio: "2026-10-01", fim: null }, // começou depois do mês
        { vinculo: "clt", inicio: "2024-01-01", fim: "2026-08-31" }, // saiu antes do mês
      ],
      [
        { tipo: "cota_parte", valorCents: 190_000 },
        { tipo: "cota_parte", valorCents: 10_000 },
        { tipo: "salario", valorCents: 150_000 },
      ],
      "2026-09",
    );
    expect(r.colaboradores_ativos_no_mes).toBe(1);
    expect(r.total_pago_a_equipe.cents).toBe(350_000);
    expect(r.por_tipo_de_pagamento[0]).toMatchObject({ tipo: "Cota-parte", cents: 200_000 });
  });

  it("custos: totais e indicadores com texto em R$, somados por categoria, sem descrição", () => {
    const r = custosParaOModelo(RESUMO_DE_CUSTOS);
    expect(r.custos_fixos).toEqual({ cents: 440_000, texto: formatarBRL(440_000) });
    expect(r.custos_variaveis.cents).toBe(80_000);
    expect(r.receita.cents).toBe(1_000_000);
    expect(r.margem_de_contribuicao.cents).toBe(920_000);
    expect(r.indice_de_margem).toBe("92%");
    expect(r.ponto_de_equilibrio.faturamento_mensal_necessario?.cents).toBe(478_261); // ceil(440.000 × 1.000.000 ÷ 920.000)
    expect(r.por_categoria.map((c) => [c.categoria, c.natureza, c.cents])).toEqual([
      ["Aluguel do espaço", "Fixo", 250_000],
      ["Salários e encargos", "Fixo", 190_000],
      ["Materiais e insumos", "Variável", 80_000],
    ]);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("Juliana");
    expect(texto).not.toContain("99999");
  });

  it("MEI: limite do ano vem das constantes, proporcional no ano de abertura", () => {
    expect(limiteDoAno(2026, "2021-03-10")).toEqual({ limiteCents: LIMITE_MEI_ANUAL_CENTS, proporcional: false });
    expect(limiteDoAno(2026, "2026-04-15")).toEqual({ limiteCents: LIMITE_MEI_POR_MES_CENTS * 9, proporcional: true });
    const r = avaliarLimiteDoMei({ recebidoCents: Math.round(LIMITE_MEI_ANUAL_CENTS * 0.75), hoje: "2026-10-12", aberturaEm: null });
    expect(r.usado_do_limite).toBe("75%");
    expect(r.alerta).toMatch(/70%/);
    expect(r.passou_do_limite).toBe(false);
  });

  it("MEI: empresa de outro regime não recebe o cálculo", async () => {
    const { ctx } = contexto(TABELAS, "simples_nacional");
    const r = await rodar("limite_do_mei", {}, ctx);
    expect(JSON.parse(r.texto)).toMatchObject({ aplica: false });
  });
});

describe("definição das ferramentas para a API", () => {
  const empresa = { city: "Cuiabá", state: "mt", timezone: "America/Cuiaba" };

  it("é idêntica entre pedidos (cache e raciocínio preservado)", () => {
    expect(JSON.stringify(ferramentasDaApi(empresa))).toBe(JSON.stringify(ferramentasDaApi({ ...empresa })));
  });

  it("pesquisa na web só com localização aproximada, sem nome da empresa", () => {
    const busca = ferramentasDaApi(empresa).at(-1);
    expect(busca).toEqual({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 5,
      user_location: { type: "approximate", country: "BR", timezone: "America/Cuiaba", city: "Cuiabá", region: "MT" },
    });
  });

  it("sem cidade, a pesquisa fica só com país e fuso", () => {
    const busca = ferramentasDaApi({ city: null, state: null, timezone: "America/Sao_Paulo" }).at(-1);
    expect(busca).toMatchObject({ user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" } });
    expect(JSON.stringify(busca)).not.toContain("city");
  });

  it("toda ferramenta própria tem esquema de objeto e status para a tela", () => {
    for (const t of ferramentasDaApi(empresa).slice(0, -1)) {
      expect(t).toHaveProperty("input_schema.type", "object");
      expect(statusDaFerramenta((t as { name: string }).name)).toBeTruthy();
    }
    expect(statusDaFerramenta("web_search")).toBe("Pesquisando tendências…");
    expect(statusDaFerramenta("resumo_financeiro")).toBe("Lendo o financeiro…");
  });
});

describe("datas do período", () => {
  it("período anterior e mês", () => {
    expect(periodoAnterior({ inicio: "2026-09-01", fim: "2026-09-30" })).toEqual({ inicio: "2026-08-02", fim: "2026-08-31" });
    expect(periodoDoMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(periodoDoMes("2028-02")).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
  });
});
