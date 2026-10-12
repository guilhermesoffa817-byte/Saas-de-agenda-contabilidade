import { describe, expect, it } from "vitest";

import {
  calcularIndicadores,
  classificar,
  dividirArredondando,
  dividirParaCima,
  montarResumoDeCustos,
  receitaDoMes,
  somarCustos,
  tendenciaDeSeisMeses,
  type DespesaParaCusto,
  type TotaisDeCustos,
} from "./calculo";
import { motivoDaRegraParaGravar } from "./regras";

let sequencia = 0;
function despesa(dados: Partial<DespesaParaCusto> = {}): DespesaParaCusto {
  sequencia += 1;
  return {
    id: `d${sequencia}`,
    descricao: "Despesa",
    valorCents: 10_000,
    pagoEm: "2026-10-10",
    formaDePagamento: "pix",
    categoria: "Outras despesas",
    categoriaId: "cat",
    grupo: "operacional",
    naturezaDaCategoria: null,
    excecao: null,
    ...dados,
  };
}

function totais(dados: Partial<TotaisDeCustos>): TotaisDeCustos {
  return {
    receitaCents: 0,
    fixosCents: 0,
    variaveisCents: 0,
    foraDaOperacaoCents: 0,
    semClassificacaoCents: 0,
    retiradasCents: 0,
    quantidadeSemClassificacao: 0,
    atendimentosRecebidos: 0,
    ...dados,
  };
}

describe("classificar", () => {
  it("exceção do dono vence a categoria", () => {
    const item = classificar(
      despesa({
        naturezaDaCategoria: "fixo",
        excecao: { natureza: "variavel", fonte: "dono", motivo: null },
      }),
    );
    expect(item.natureza).toBe("variavel");
    expect(item.origem).toBe("dono");
  });

  it("sugestão da IA vence a categoria e guarda o motivo", () => {
    const item = classificar(
      despesa({
        naturezaDaCategoria: "fixo",
        excecao: { natureza: "nao_operacional", fonte: "ia", motivo: "Multa de trânsito." },
      }),
    );
    expect(item).toMatchObject({ natureza: "nao_operacional", origem: "ia", motivo: "Multa de trânsito." });
  });

  it("exceção gravada pela regra aparece como 'regra'", () => {
    const item = classificar(
      despesa({
        excecao: { natureza: "fixo", fonte: "ia", motivo: motivoDaRegraParaGravar("Aluguel.") },
      }),
    );
    expect(item.origem).toBe("regra");
  });

  it("sem exceção usa a categoria; sem as duas fica sem classificação", () => {
    expect(classificar(despesa({ naturezaDaCategoria: "fixo" }))).toMatchObject({
      natureza: "fixo",
      origem: "categoria",
    });
    expect(classificar(despesa())).toMatchObject({ natureza: null, origem: null });
  });
});

describe("somarCustos", () => {
  it("separa por natureza e deixa a retirada de fora", () => {
    const lista = [
      despesa({ valorCents: 250_000, naturezaDaCategoria: "fixo" }),
      despesa({ valorCents: 30_001, naturezaDaCategoria: "variavel" }),
      despesa({ valorCents: 4_999, naturezaDaCategoria: "nao_operacional" }),
      despesa({ valorCents: 1_234 }),
      despesa({ valorCents: 777 }),
      despesa({ valorCents: 500_000, grupo: "retirada", naturezaDaCategoria: "fixo" }),
    ].map(classificar);
    const resultado = somarCustos({ despesas: lista, receitaCents: 900_000, atendimentosRecebidos: 3 });
    expect(resultado).toEqual({
      receitaCents: 900_000,
      fixosCents: 250_000,
      variaveisCents: 30_001,
      foraDaOperacaoCents: 4_999,
      semClassificacaoCents: 2_011,
      retiradasCents: 500_000,
      quantidadeSemClassificacao: 2,
      atendimentosRecebidos: 3,
    });
  });
});

describe("divisões inteiras", () => {
  it("arredonda para cima só quando sobra resto", () => {
    expect(dividirParaCima(BigInt(10), BigInt(5))).toBe(BigInt(2));
    expect(dividirParaCima(BigInt(11), BigInt(5))).toBe(BigInt(3));
    expect(dividirParaCima(BigInt(0), BigInt(5))).toBe(BigInt(0));
  });

  it("arredonda o meio para longe do zero, dos dois lados", () => {
    expect(dividirArredondando(BigInt(5), BigInt(2))).toBe(BigInt(3));
    expect(dividirArredondando(BigInt(4), BigInt(3))).toBe(BigInt(1));
    expect(dividirArredondando(BigInt(-5), BigInt(2))).toBe(BigInt(-3));
    expect(dividirArredondando(BigInt(-4), BigInt(3))).toBe(BigInt(-1));
  });

  it("recusa divisor zero", () => {
    expect(() => dividirParaCima(BigInt(1), BigInt(0))).toThrow();
    expect(() => dividirArredondando(BigInt(1), BigInt(0))).toThrow();
  });
});

describe("calcularIndicadores", () => {
  it("caso típico: margem, índice, ponto de equilíbrio e peso dos fixos", () => {
    // Entrou R$ 20.000, variáveis R$ 5.000, fixos R$ 9.000.
    const r = calcularIndicadores(
      totais({ receitaCents: 2_000_000, variaveisCents: 500_000, fixosCents: 900_000 }),
    );
    expect(r.margemDeContribuicaoCents).toBe(1_500_000);
    expect(r.indiceDeMargemBps).toBe(7_500);
    expect(r.sobraACadaCemReaisCents).toBe(7_500); // R$ 75,00 de cada R$ 100
    expect(r.situacaoDoPontoDeEquilibrio).toBe("calculado");
    expect(r.pontoDeEquilibrioCents).toBe(1_200_000); // 9.000 ÷ 0,75
    expect(r.pesoDosFixosBps).toBe(4_500);
    expect(r.pontoDeEquilibrioAtendimentos).toBeNull();
  });

  it("centavos ímpares: o ponto de equilíbrio arredonda para cima", () => {
    // 1001 × 3 ÷ 2 = 1501,5 → 1502
    const r = calcularIndicadores(totais({ receitaCents: 3, variaveisCents: 1, fixosCents: 1_001 }));
    expect(r.margemDeContribuicaoCents).toBe(2);
    expect(r.pontoDeEquilibrioCents).toBe(1_502);
    expect(r.indiceDeMargemBps).toBe(6_667); // 66,67%
    expect(r.pesoDosFixosBps).toBe(3_336_667);
  });

  it("valores grandes não perdem precisão (BigInt)", () => {
    // R$ 90 milhões de receita × R$ 40 milhões de fixos passa de 2^53.
    const r = calcularIndicadores(
      totais({ receitaCents: 9_000_000_000, variaveisCents: 3_000_000_001, fixosCents: 4_000_000_000 }),
    );
    // 4e9 × 9e9 ÷ 5.999.999.999 = 6.000.000.001,0000000017 → para cima
    expect(r.pontoDeEquilibrioCents).toBe(6_000_000_002);
  });

  it("ponto de equilíbrio em atendimentos usa a margem média por atendimento", () => {
    // margem R$ 15.000 em 120 atendimentos = R$ 125 cada; fixos R$ 9.000 → 72
    const r = calcularIndicadores(
      totais({
        receitaCents: 2_000_000,
        variaveisCents: 500_000,
        fixosCents: 900_000,
        atendimentosRecebidos: 120,
      }),
    );
    expect(r.pontoDeEquilibrioAtendimentos).toBe(72);
  });

  it("atendimentos arredondam para cima", () => {
    // margem 1.000 em 3 atendimentos; fixos 1.001 → 1001 × 3 ÷ 1000 = 3,003 → 4
    const r = calcularIndicadores(
      totais({ receitaCents: 1_000, fixosCents: 1_001, atendimentosRecebidos: 3 }),
    );
    expect(r.pontoDeEquilibrioAtendimentos).toBe(4);
  });

  it("receita zero: sem índice, sem ponto de equilíbrio", () => {
    const r = calcularIndicadores(totais({ fixosCents: 100_000, variaveisCents: 10_000 }));
    expect(r.situacaoDoPontoDeEquilibrio).toBe("sem_receita");
    expect(r.pontoDeEquilibrioCents).toBeNull();
    expect(r.indiceDeMargemBps).toBeNull();
    expect(r.sobraACadaCemReaisCents).toBeNull();
    expect(r.pesoDosFixosBps).toBeNull();
    expect(r.margemDeContribuicaoCents).toBe(-10_000);
  });

  it("margem negativa: os variáveis já consomem tudo", () => {
    const r = calcularIndicadores(
      totais({ receitaCents: 100_000, variaveisCents: 120_000, fixosCents: 50_000, atendimentosRecebidos: 4 }),
    );
    expect(r.situacaoDoPontoDeEquilibrio).toBe("margem_insuficiente");
    expect(r.pontoDeEquilibrioCents).toBeNull();
    expect(r.pontoDeEquilibrioAtendimentos).toBeNull();
    expect(r.margemDeContribuicaoCents).toBe(-20_000);
    expect(r.indiceDeMargemBps).toBe(-2_000);
  });

  it("margem exatamente zero também não tem ponto de equilíbrio", () => {
    const r = calcularIndicadores(
      totais({ receitaCents: 100_000, variaveisCents: 100_000, fixosCents: 50_000 }),
    );
    expect(r.situacaoDoPontoDeEquilibrio).toBe("margem_insuficiente");
    expect(r.indiceDeMargemBps).toBe(0);
  });

  it("sem custo fixo classificado pede a classificação", () => {
    const r = calcularIndicadores(totais({ receitaCents: 100_000, variaveisCents: 10_000 }));
    expect(r.situacaoDoPontoDeEquilibrio).toBe("sem_custos_fixos");
    expect(r.pontoDeEquilibrioCents).toBeNull();
    expect(r.indiceDeMargemBps).toBe(9_000);
    expect(r.pesoDosFixosBps).toBe(0);
  });

  it("todo número devolvido é inteiro", () => {
    const r = calcularIndicadores(
      totais({ receitaCents: 777_777, variaveisCents: 123_457, fixosCents: 333_333, atendimentosRecebidos: 7 }),
    );
    for (const valor of Object.values(r)) {
      if (typeof valor === "number") expect(Number.isInteger(valor)).toBe(true);
    }
  });
});

describe("receitaDoMes", () => {
  it("soma só o mês e conta atendimentos distintos", () => {
    const r = receitaDoMes(
      [
        { valorCents: 15_000, pagoEm: "2026-10-01", atendimentoId: "a1" },
        { valorCents: 5_000, pagoEm: "2026-10-31", atendimentoId: "a1" }, // segunda parcela
        { valorCents: 20_000, pagoEm: "2026-10-15", atendimentoId: "a2" },
        { valorCents: 3_000, pagoEm: "2026-10-15", atendimentoId: null }, // venda de produto
        { valorCents: 99_999, pagoEm: "2026-09-30", atendimentoId: "a3" },
      ],
      "2026-10",
    );
    expect(r).toEqual({ receitaCents: 43_000, atendimentosRecebidos: 2 });
  });
});

describe("tendenciaDeSeisMeses", () => {
  it("seis meses terminando no mês pedido, com rótulo em português", () => {
    const meses = tendenciaDeSeisMeses(
      [
        despesa({ pagoEm: "2026-10-05", valorCents: 100, naturezaDaCategoria: "fixo" }),
        despesa({ pagoEm: "2026-10-06", valorCents: 50, naturezaDaCategoria: "variavel" }),
        despesa({ pagoEm: "2026-05-06", valorCents: 70, naturezaDaCategoria: "fixo" }),
        despesa({ pagoEm: "2026-04-30", valorCents: 999, naturezaDaCategoria: "fixo" }), // fora da janela
        despesa({ pagoEm: "2026-10-07", valorCents: 999, naturezaDaCategoria: "nao_operacional" }),
        despesa({ pagoEm: "2026-10-07", valorCents: 999, grupo: "retirada", naturezaDaCategoria: "fixo" }),
      ].map(classificar),
      "2026-10",
    );
    expect(meses.map((m) => m.mes)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(meses[5]).toMatchObject({ rotulo: "out", fixosCents: 100, variaveisCents: 50 });
    expect(meses[0]).toMatchObject({ rotulo: "mai", fixosCents: 70, variaveisCents: 0 });
  });

  it("atravessa a virada do ano", () => {
    const meses = tendenciaDeSeisMeses([], "2026-02");
    expect(meses[0]!.mes).toBe("2025-09");
    expect(meses[5]!.mes).toBe("2026-02");
  });
});

describe("montarResumoDeCustos", () => {
  it("junta o mês, o anterior, a tendência e a lista sem retiradas", () => {
    const resumo = montarResumoDeCustos({
      mes: "2026-10",
      despesas: [
        despesa({ pagoEm: "2026-10-05", valorCents: 300_000, naturezaDaCategoria: "fixo" }),
        despesa({ pagoEm: "2026-10-08", valorCents: 50_000, naturezaDaCategoria: "variavel" }),
        despesa({ pagoEm: "2026-10-09", valorCents: 12_345 }),
        despesa({ pagoEm: "2026-10-09", valorCents: 800_000, grupo: "retirada" }),
        despesa({ pagoEm: "2026-09-05", valorCents: 280_000, naturezaDaCategoria: "fixo" }),
        despesa({ pagoEm: "2026-09-10", valorCents: 40_000, naturezaDaCategoria: "variavel" }),
      ],
      receitas: [
        { valorCents: 1_000_000, pagoEm: "2026-10-12", atendimentoId: "a1" },
        { valorCents: 900_000, pagoEm: "2026-09-12", atendimentoId: "a2" },
      ],
    });

    expect(resumo.mes).toBe("2026-10");
    expect(resumo.receitaCents).toBe(1_000_000);
    expect(resumo.fixosCents).toBe(300_000);
    expect(resumo.variaveisCents).toBe(50_000);
    expect(resumo.semClassificacaoCents).toBe(12_345);
    expect(resumo.retiradasCents).toBe(800_000);
    expect(resumo.margemDeContribuicaoCents).toBe(950_000);
    expect(resumo.pontoDeEquilibrioCents).toBe(315_790); // 300.000 × 1.000.000 ÷ 950.000 = 315.789,47
    expect(resumo.pontoDeEquilibrioAtendimentos).toBe(1);
    expect(resumo.despesas.map((d) => d.valorCents)).toEqual([300_000, 50_000, 12_345]);
    expect(resumo.mesAnterior).toMatchObject({
      mes: "2026-09",
      receitaCents: 900_000,
      fixosCents: 280_000,
      variaveisCents: 40_000,
      margemDeContribuicaoCents: 860_000,
      diferencaReceitaCents: 100_000,
      diferencaFixosCents: 20_000,
      diferencaVariaveisCents: 10_000,
      diferencaMargemCents: 90_000,
    });
    expect(resumo.tendencia).toHaveLength(6);
    expect(resumo.tendencia[4]).toMatchObject({ mes: "2026-09", fixosCents: 280_000 });
  });

  it("mês sem nada não quebra", () => {
    const resumo = montarResumoDeCustos({ mes: "2026-01", despesas: [], receitas: [] });
    expect(resumo.receitaCents).toBe(0);
    expect(resumo.situacaoDoPontoDeEquilibrio).toBe("sem_custos_fixos");
    expect(resumo.despesas).toEqual([]);
    expect(resumo.mesAnterior.mes).toBe("2025-12");
  });
});
