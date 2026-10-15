import { describe, expect, it } from "vitest";

import { classificar, type DespesaParaCusto } from "./calculo";
import { PREFIXO_DA_REGRA } from "./regras";
import {
  motivoDoQueSobrou,
  planejarSugestao,
  precisaDeSugestao,
  resumoDaSugestao,
  textoDasPendentes,
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
  it("categoria de impostos: Carnê-Leão sai da operação, DAS e ISS são variáveis, o resto vai à IA", () => {
    const naCategoria = (descricao: string) =>
      despesa({ descricao, categoria: "Impostos (DAS, ISS, Carnê-Leão)", grupo: "imposto" });
    const carne = naCategoria("Carnê-Leão set/2026");
    const das = naCategoria("DAS setembro");
    const iss = naCategoria("ISS de outubro");
    const guia = naCategoria("Guia de setembro");

    const plano = planejarSugestao({ empresaId: "org", mes: "2026-10", despesas: [carne, das, iss, guia] });
    const porId = new Map(plano.porRegra.map((e) => [e.transaction_id, e]));
    expect(porId.get(carne.id)?.cost_behavior).toBe("nao_operacional");
    expect(porId.get(carne.id)?.reason).toMatch(/contador/);
    expect(porId.get(das.id)?.cost_behavior).toBe("variavel");
    expect(porId.get(iss.id)?.cost_behavior).toBe("variavel");
    expect(plano.paraIa.map((d) => d.id)).toEqual([guia.id]);
  });

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
        source: "regra",
        reason: "Aluguel se paga todo mês, com ou sem atendimento.",
      },
    ]);
    expect(plano.paraIa.map((d) => d.id)).toEqual([grande.id, pequena.id]);
  });

  it("a regra grava source 'regra' sem prefixo no motivo, e a tela mostra 'Regra'", () => {
    const aluguel = despesa({ descricao: "Aluguel da sala" });
    const [gravada] = planejarSugestao({ empresaId: "org", mes: "2026-10", despesas: [aluguel] }).porRegra;
    expect(gravada!.source).toBe("regra");
    expect(gravada!.reason.startsWith(PREFIXO_DA_REGRA)).toBe(false);

    // Como volta do banco na próxima leitura:
    const lida = classificar({
      ...aluguel,
      excecao: { natureza: gravada!.cost_behavior, fonte: gravada!.source, motivo: gravada!.reason },
    });
    expect(lida.origem).toBe("regra");
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
    const base = { erroDaIa: null, limitadoPelaFranquia: false };
    expect(motivoDoQueSobrou({ ...base, erroDaIa: "x", enviados: 10, total: 10 })).toBe("erro");
    expect(motivoDoQueSobrou({ ...base, enviados: 5, total: 10, limitadoPelaFranquia: true })).toBe("franquia");
    expect(motivoDoQueSobrou({ ...base, enviados: 180, total: 200 })).toBe("proxima_rodada");
    expect(motivoDoQueSobrou({ ...base, enviados: 10, total: 10 })).toBe("erro");
    expect(motivoDoQueSobrou({ ...base, enviados: 10, total: 10, interrompido: true })).toBe("proxima_rodada");
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

describe("despesa recusada pela IA", () => {
  it("vira um aviso para o dono classificar na tabela, sem esconder o resto", () => {
    expect(resumoDaSugestao({ porRegra: 0, porIa: 59, semIa: 0, motivoSemIa: null, recusadas: 1 })).toBe(
      "59 sugestões da IA. A IA não sugeriu classificação para 1 despesa: classifique na tabela.",
    );
    expect(resumoDaSugestao({ porRegra: 0, porIa: 0, semIa: 0, motivoSemIa: null, recusadas: 2 })).toBe(
      "A IA não sugeriu classificação para 2 despesas: classifique na tabela.",
    );
  });
});

describe("textoDasPendentes", () => {
  it("mês sem despesa não diz que está tudo classificado", () => {
    expect(textoDasPendentes({ total: 0, pendentes: 0 })).toBe("Nenhuma despesa paga neste mês para classificar.");
    expect(textoDasPendentes({ total: 3, pendentes: 0 })).toBe("Todas as despesas do mês já estão classificadas.");
    expect(textoDasPendentes({ total: 3, pendentes: 1 })).toBe("1 despesa sem classificação.");
    expect(textoDasPendentes({ total: 3, pendentes: 2 })).toBe("2 despesas sem classificação.");
  });
});
