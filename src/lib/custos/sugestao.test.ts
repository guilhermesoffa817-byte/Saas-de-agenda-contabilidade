import { describe, expect, it } from "vitest";

import type { DespesaParaCusto } from "./calculo";
import { PREFIXO_DA_REGRA } from "./regras";
import {
  linhasDeUso,
  motivoDoQueSobrou,
  planejarSugestao,
  precisaDeSugestao,
  resumoDaSugestao,
} from "./sugestao";

let sequencia = 0;
function despesa(dados: Partial<DespesaParaCusto> = {}): DespesaParaCusto {
  sequencia += 1;
  return {
    id: `d${sequencia}`,
    descricao: "Pagamento avulso",
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

describe("precisaDeSugestao", () => {
  it("só despesa sem exceção, sem comportamento na categoria e fora da retirada", () => {
    expect(precisaDeSugestao(despesa())).toBe(true);
    expect(precisaDeSugestao(despesa({ naturezaDaCategoria: "fixo" }))).toBe(false);
    expect(
      precisaDeSugestao(despesa({ excecao: { natureza: "fixo", fonte: "dono", motivo: null } })),
    ).toBe(false);
    expect(precisaDeSugestao(despesa({ excecao: { natureza: "fixo", fonte: "ia", motivo: "x" } }))).toBe(
      false,
    );
    expect(precisaDeSugestao(despesa({ grupo: "retirada" }))).toBe(false);
  });
});

describe("planejarSugestao", () => {
  it("regra primeiro; o resto vai para a IA, maiores primeiro; só o mês pedido", () => {
    const aluguel = despesa({ descricao: "Aluguel da sala", valorCents: 300_000 });
    const pequena = despesa({ descricao: "Lavanderia", valorCents: 4_000 });
    const grande = despesa({ descricao: "Reforma da fachada", valorCents: 90_000 });
    const doDono = despesa({
      descricao: "Juros",
      excecao: { natureza: "fixo", fonte: "dono", motivo: null },
    });
    const outroMes = despesa({ descricao: "Lavanderia", pagoEm: "2026-09-30" });
    const retirada = despesa({ descricao: "Retirada", grupo: "retirada" });

    const plano = planejarSugestao({
      empresaId: "org",
      mes: "2026-10",
      despesas: [aluguel, pequena, grande, doDono, outroMes, retirada],
    });

    expect(plano.porRegra).toEqual([
      {
        transaction_id: aluguel.id,
        organization_id: "org",
        cost_behavior: "fixo",
        source: "ia",
        reason: expect.stringMatching(new RegExp(`^${PREFIXO_DA_REGRA}`)),
      },
    ]);
    expect(plano.paraIa.map((d) => d.id)).toEqual([grande.id, pequena.id]);
  });
});

describe("linhasDeUso", () => {
  it("uma linha por lançamento enviado, tokens só na primeira", () => {
    const linhas = linhasDeUso({
      empresaId: "org",
      userId: "u",
      enviados: 3,
      tokens: { input_tokens: 900, output_tokens: 300, cache_read_tokens: 0, web_searches: 0 },
    });
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ feature: "classificacao", input_tokens: 900, output_tokens: 300 });
    expect(linhas[1]).toMatchObject({ input_tokens: 0, output_tokens: 0, user_id: "u" });
    expect(linhasDeUso({ empresaId: "o", userId: null, enviados: 0, tokens: linhas[0]! })).toEqual([]);
  });
});

describe("resumoDaSugestao", () => {
  it("conta o que foi feito, no singular e no plural", () => {
    expect(resumoDaSugestao({ porRegra: 1, porIa: 2, semIa: 0, motivoSemIa: null })).toBe(
      "1 despesa classificada por regra e 2 sugestões da IA.",
    );
    expect(resumoDaSugestao({ porRegra: 0, porIa: 0, semIa: 0, motivoSemIa: null })).toBe(
      "Nenhuma despesa nova para classificar.",
    );
  });

  it("explica por que sobrou despesa sem classificação", () => {
    expect(resumoDaSugestao({ porRegra: 2, porIa: 0, semIa: 3, motivoSemIa: "nao_configurada" })).toMatch(
      /IA não está configurada, então só as regras foram aplicadas/,
    );
    expect(resumoDaSugestao({ porRegra: 0, porIa: 5, semIa: 1, motivoSemIa: "franquia" })).toMatch(
      /1 despesa ficou sem classificação: a franquia de IA do mês acabou/,
    );
  });
});

describe("motivoDoQueSobrou", () => {
  it("erro da IA vence; franquia quando o envio parou nela; próxima rodada quando parou no limite por clique", () => {
    expect(motivoDoQueSobrou({ erroDaIa: "x", enviados: 10, total: 10, restantes: 50 })).toBe("erro");
    expect(motivoDoQueSobrou({ erroDaIa: null, enviados: 5, total: 10, restantes: 5 })).toBe("franquia");
    expect(motivoDoQueSobrou({ erroDaIa: null, enviados: 180, total: 200, restantes: 900 })).toBe(
      "proxima_rodada",
    );
    expect(motivoDoQueSobrou({ erroDaIa: null, enviados: 10, total: 10, restantes: 50 })).toBe("erro");
  });

  it("a frase da próxima rodada pede outro clique", () => {
    expect(resumoDaSugestao({ porRegra: 0, porIa: 180, semIa: 20, motivoSemIa: "proxima_rodada" })).toMatch(
      /20 despesas ficaram para a próxima rodada/,
    );
  });
});

describe("resumoDaSugestao sem nada feito", () => {
  it("não diz 'nenhuma despesa' quando sobrou despesa", () => {
    expect(resumoDaSugestao({ porRegra: 0, porIa: 0, semIa: 2, motivoSemIa: "nao_configurada" })).toBe(
      "2 despesas ficaram sem classificação: a IA não está configurada, então só as regras foram aplicadas.",
    );
  });
});
