import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AUSENCIAS_POR_VINCULO,
  CONTRATOS,
  PAGAMENTOS_POR_VINCULO,
  ROTULO_AUSENCIA,
  ROTULO_PAGAMENTO,
  TERMOS_POR_VINCULO,
  TIPOS_DE_AUSENCIA,
  TIPOS_DE_PAGAMENTO,
  VINCULOS,
  alertasDaEquipe,
  aplicarPercentual,
  ativoNoMes,
  ausenciaPermitida,
  bpsParaTexto,
  categoriaDoPagamento,
  contratosDoSegmento,
  diasNoPeriodo,
  estaAtivo,
  formatarDia,
  formatarPercentual,
  limitesDoMes,
  pagamentoPermitido,
  profissionaisLivres,
  remuneracaoDoVinculo,
  resumirRemuneracao,
  somarMeses,
  textoParaBps,
  tipoDePagamentoSugerido,
  valorDoTipoDePagamento,
  valorSugeridoDoMes,
  type ColaboradorParaAlerta,
} from "./equipe";
import { ESTAGIO_DURACAO_MAX_MESES, MEI_MAX_EMPREGADOS } from "./fiscal/constantes";

// ---------------------------------------------------------------------------
// As tabelas de vocabulário são cópia das funções do banco: o teste lê o SQL.
// ---------------------------------------------------------------------------

const PASTA = join(process.cwd(), "supabase", "migrations");
const migracoes = readdirSync(PASTA)
  .filter((nome) => /^\d+_.*\.sql$/.test(nome))
  .sort()
  .map((nome) => readFileSync(join(PASTA, nome), "utf8"));

/** Corpo da última definição da função (uma migração posterior pode redefinir). */
function corpoDaFuncao(nome: string) {
  const padrao = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${nome.replace(".", "\\.")}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );
  let corpo: string | null = null;
  for (const sql of migracoes) {
    for (const achado of sql.matchAll(padrao)) corpo = achado[1];
  }
  if (!corpo) throw new Error(`Função ${nome} não encontrada nas migrações.`);
  return corpo;
}

function valoresDoEnum(nome: string) {
  for (const sql of migracoes) {
    const achado = new RegExp(`create type public\\.${nome} as enum\\s*\\(([^)]*)\\)`, "i").exec(sql);
    if (achado) return [...achado[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }
  throw new Error(`Enum ${nome} não encontrado.`);
}

function lista(trecho: string) {
  const em = /p_tipo\s+in\s*\(([^)]*)\)/i.exec(trecho);
  if (em) return [...em[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const igual = /p_tipo\s*=\s*'([a-z_]+)'/i.exec(trecho);
  if (igual) return [igual[1]];
  throw new Error(`Trecho sem lista de tipos: ${trecho}`);
}

/** Lê o "case p_contrato when ... then ... else ... end" e devolve o mapa por vínculo. */
function mapaDoCase(corpo: string, contratos: string[]) {
  const ramos = new Map<string, string[]>();
  for (const achado of corpo.matchAll(/when\s+'([a-z_]+)'\s+then\s+([\s\S]*?)(?=\bwhen\b|\belse\b)/gi)) {
    ramos.set(achado[1], lista(achado[2]));
  }
  const senao = /\belse\b([\s\S]*?)\bend\b/i.exec(corpo);
  if (!senao) throw new Error("case sem else");
  const padrao = lista(senao[1]);
  return Object.fromEntries(contratos.map((c) => [c, [...(ramos.get(c) ?? padrao)].sort()]));
}

function ordenado<T extends string>(mapa: Record<string, T[]>) {
  return Object.fromEntries(Object.entries(mapa).map(([chave, tipos]) => [chave, [...tipos].sort()]));
}

describe("vocabulário igual ao do banco", () => {
  const contratos = valoresDoEnum("staff_contract");

  it("os enums do banco são os mesmos da tela", () => {
    expect([...CONTRATOS].sort()).toEqual([...contratos].sort());
    expect([...TIPOS_DE_AUSENCIA].sort()).toEqual(valoresDoEnum("staff_absence_kind").sort());
    expect([...TIPOS_DE_PAGAMENTO].sort()).toEqual(valoresDoEnum("staff_payment_kind").sort());
  });

  it("AUSENCIAS_POR_VINCULO bate com private.ausencia_permitida", () => {
    const banco = mapaDoCase(corpoDaFuncao("private.ausencia_permitida"), contratos);
    expect(ordenado(AUSENCIAS_POR_VINCULO)).toEqual(banco);
  });

  it("PAGAMENTOS_POR_VINCULO bate com private.pagamento_permitido", () => {
    const banco = mapaDoCase(corpoDaFuncao("private.pagamento_permitido"), contratos);
    expect(ordenado(PAGAMENTOS_POR_VINCULO)).toEqual(banco);
  });

  it("a categoria do pagamento é a mesma que registrar_pagamento_equipe escolhe", () => {
    const corpo = corpoDaFuncao("public.registrar_pagamento_equipe");
    const achado = /case\s+when\s+p_kind\s+in\s*\(([^)]*)\)\s*then\s*'([^']+)'\s*else\s*'([^']+)'/i.exec(corpo);
    expect(achado).not.toBeNull();
    const [, lista, comissoes, salarios] = achado!;
    const deComissao = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    for (const tipo of TIPOS_DE_PAGAMENTO) {
      expect(categoriaDoPagamento(tipo), tipo).toBe(deComissao.includes(tipo) ? comissoes : salarios);
    }
  });

  it("todo tipo tem rótulo e todo vínculo tem descrição", () => {
    for (const tipo of TIPOS_DE_AUSENCIA) expect(ROTULO_AUSENCIA[tipo]).toBeTruthy();
    for (const tipo of TIPOS_DE_PAGAMENTO) expect(ROTULO_PAGAMENTO[tipo]).toBeTruthy();
    for (const contrato of CONTRATOS) {
      expect(VINCULOS[contrato].rotulo).toBeTruthy();
      expect(VINCULOS[contrato].descricao).toBeTruthy();
    }
  });
});

describe("as palavras certas para cada vínculo", () => {
  it("estágio tem recesso, nunca férias", () => {
    expect(ausenciaPermitida("estagio", "recesso")).toBe(true);
    expect(ausenciaPermitida("estagio", "ferias")).toBe(false);
    expect(ROTULO_AUSENCIA.recesso).toBe("Recesso");
  });

  it("quem não é empregado só fica indisponível na agenda", () => {
    for (const contrato of ["parceria", "mei", "pj", "autonomo"] as const) {
      expect(AUSENCIAS_POR_VINCULO[contrato]).toEqual(["indisponivel"]);
      expect(ausenciaPermitida(contrato, "falta")).toBe(false);
      expect(ausenciaPermitida(contrato, "ferias")).toBe(false);
    }
    expect(ROTULO_AUSENCIA.indisponivel).toBe("Indisponível na agenda");
  });

  it("parceria recebe cota-parte, nunca salário nem comissão", () => {
    expect(pagamentoPermitido("parceria", "cota_parte")).toBe(true);
    expect(pagamentoPermitido("parceria", "salario")).toBe(false);
    expect(pagamentoPermitido("parceria", "comissao")).toBe(false);
    expect(TERMOS_POR_VINCULO.parceria.percentual?.rotulo).toMatch(/cota-parte/i);
    expect(TERMOS_POR_VINCULO.parceria.fixo).toBeNull();
  });

  it("CLT fala em salário e comissão; estágio em bolsa-auxílio", () => {
    expect(TERMOS_POR_VINCULO.clt.fixo?.rotulo).toBe("Salário");
    expect(TERMOS_POR_VINCULO.clt.percentual?.rotulo).toBe("Comissão");
    expect(TERMOS_POR_VINCULO.estagio.fixo?.rotulo).toBe("Bolsa-auxílio");
    expect(TERMOS_POR_VINCULO.estagio.percentual).toBeNull();
  });

  it("MEI, PJ e autônomo: percentual combinado e valor por atendimento, sem salário", () => {
    for (const contrato of ["mei", "pj", "autonomo"] as const) {
      expect(TERMOS_POR_VINCULO[contrato].fixo).toBeNull();
      expect(TERMOS_POR_VINCULO[contrato].percentual?.rotulo).toBe("Percentual combinado");
      expect(TERMOS_POR_VINCULO[contrato].porAtendimento?.rotulo).toBe("Valor por atendimento");
    }
  });

  it("nenhum texto promete folha, holerite, eSocial ou ponto", () => {
    const textos = JSON.stringify([VINCULOS, TERMOS_POR_VINCULO, ROTULO_AUSENCIA, ROTULO_PAGAMENTO]);
    expect(textos).not.toMatch(/folha de pagamento|holerite|e-?social|\bponto\b/i);
  });

  it("o tipo sugerido é sempre um tipo permitido", () => {
    const zerado = { fixoCents: 0, percentualBps: 0, porAtendimentoCents: 0 };
    for (const contrato of CONTRATOS) {
      expect(pagamentoPermitido(contrato, tipoDePagamentoSugerido(contrato, zerado))).toBe(true);
    }
    expect(tipoDePagamentoSugerido("clt", { ...zerado, percentualBps: 1000 })).toBe("comissao");
    expect(tipoDePagamentoSugerido("clt", { ...zerado, fixoCents: 190000, percentualBps: 1000 })).toBe(
      "salario",
    );
    expect(tipoDePagamentoSugerido("parceria", zerado)).toBe("cota_parte");
    expect(tipoDePagamentoSugerido("mei", zerado)).toBe("repasse");
    expect(tipoDePagamentoSugerido("estagio", zerado)).toBe("bolsa");
  });

  it("parceria só aparece nos segmentos de beleza, salvo para quem já é parceiro", () => {
    expect(contratosDoSegmento("salao")).toContain("parceria");
    expect(contratosDoSegmento("barbearia")).toContain("parceria");
    expect(contratosDoSegmento("clinica")).not.toContain("parceria");
    expect(contratosDoSegmento("clinica", "parceria")).toContain("parceria");
    expect(contratosDoSegmento("clinica")).toEqual(["clt", "mei", "pj", "autonomo", "estagio"]);
  });
});

describe("remuneração combinada", () => {
  it("zera o que não existe no vínculo", () => {
    const valores = { fixoCents: 190000, percentualBps: 1000, porAtendimentoCents: 2500 };
    expect(remuneracaoDoVinculo("clt", valores)).toEqual({
      fixoCents: 190000,
      percentualBps: 1000,
      porAtendimentoCents: 0,
    });
    expect(remuneracaoDoVinculo("parceria", valores)).toEqual({
      fixoCents: 0,
      percentualBps: 1000,
      porAtendimentoCents: 0,
    });
    expect(remuneracaoDoVinculo("mei", valores)).toEqual({
      fixoCents: 0,
      percentualBps: 1000,
      porAtendimentoCents: 2500,
    });
    expect(remuneracaoDoVinculo("estagio", valores)).toEqual({
      fixoCents: 190000,
      percentualBps: 0,
      porAtendimentoCents: 0,
    });
  });

  it("resume em uma linha", () => {
    const nbsp = (texto: string) => texto.replace(/ /g, " ");
    expect(
      nbsp(resumirRemuneracao("clt", { fixoCents: 190000, percentualBps: 1000, porAtendimentoCents: 0 })),
    ).toBe("Salário R$ 1.900,00 + comissão 10%");
    expect(
      nbsp(resumirRemuneracao("parceria", { fixoCents: 0, percentualBps: 6000, porAtendimentoCents: 0 })),
    ).toBe("Cota-parte do profissional 60%");
    expect(
      nbsp(resumirRemuneracao("mei", { fixoCents: 0, percentualBps: 0, porAtendimentoCents: 2500 })),
    ).toBe("R$ 25,00 por atendimento");
    expect(
      nbsp(resumirRemuneracao("pj", { fixoCents: 0, percentualBps: 3050, porAtendimentoCents: 1000 })),
    ).toBe("Percentual combinado 30,5% + R$ 10,00 por atendimento");
    expect(
      nbsp(resumirRemuneracao("estagio", { fixoCents: 90000, percentualBps: 0, porAtendimentoCents: 0 })),
    ).toBe("Bolsa-auxílio R$ 900,00");
    expect(resumirRemuneracao("clt", { fixoCents: 0, percentualBps: 0, porAtendimentoCents: 0 })).toBe(
      "Não informado",
    );
  });
});

describe("percentual em pontos-base, sem float", () => {
  it("aplica o percentual arredondando ao centavo", () => {
    expect(aplicarPercentual(10000, 4000)).toBe(4000);
    expect(aplicarPercentual(12345, 4050)).toBe(5000); // 4999,7… → 5000
    expect(aplicarPercentual(333, 3333)).toBe(111); // 110,98… → 111
    expect(aplicarPercentual(0, 6000)).toBe(0);
    expect(aplicarPercentual(19990, 10000)).toBe(19990);
    expect(Number.isInteger(aplicarPercentual(99999, 1234))).toBe(true);
  });

  it("lê o que a pessoa digita", () => {
    expect(textoParaBps("40")).toBe(4000);
    expect(textoParaBps("40,5")).toBe(4050);
    expect(textoParaBps("40.5")).toBe(4050);
    expect(textoParaBps("12,25%")).toBe(1225);
    expect(textoParaBps(" 12,25 % ")).toBe(1225);
    expect(textoParaBps("0,05")).toBe(5);
    expect(textoParaBps("100")).toBe(10000);
    expect(textoParaBps("40,")).toBe(4000);
    expect(textoParaBps("")).toBe(0);
    expect(textoParaBps("0")).toBe(0);
    // casos em que float erraria: 0,29 × 100 = 28,999…
    expect(textoParaBps("0,29")).toBe(29);
    expect(textoParaBps("4,35")).toBe(435);
  });

  it("recusa o que não é percentual válido", () => {
    expect(textoParaBps("100,01")).toBeNull();
    expect(textoParaBps("150")).toBeNull();
    expect(textoParaBps("12,345")).toBeNull();
    expect(textoParaBps("-5")).toBeNull();
    expect(textoParaBps("abc")).toBeNull();
    expect(textoParaBps("1.000")).toBeNull();
    expect(textoParaBps(",5")).toBeNull();
  });

  it("escreve de volta para a tela", () => {
    expect(bpsParaTexto(4000)).toBe("40");
    expect(bpsParaTexto(4050)).toBe("40,5");
    expect(bpsParaTexto(1225)).toBe("12,25");
    expect(bpsParaTexto(5)).toBe("0,05");
    expect(bpsParaTexto(0)).toBe("0");
    expect(bpsParaTexto(10000)).toBe("100");
    expect(formatarPercentual(6000)).toBe("60%");
  });

  it("ida e volta não perde nada", () => {
    for (let bps = 0; bps <= 10000; bps += 7) {
      expect(textoParaBps(bpsParaTexto(bps))).toBe(bps);
    }
  });
});

describe("valor sugerido do mês", () => {
  it("soma fixo, percentual sobre a base e valor por atendimento", () => {
    expect(
      valorSugeridoDoMes({
        fixoCents: 190000,
        percentualBps: 1000,
        porAtendimentoCents: 0,
        baseCents: 845000,
        atendimentos: 0,
      }),
    ).toEqual({ fixoCents: 190000, percentualCents: 84500, porAtendimentoCents: 0, totalCents: 274500 });

    expect(
      valorSugeridoDoMes({
        fixoCents: 0,
        percentualBps: 0,
        porAtendimentoCents: 2500,
        baseCents: 0,
        atendimentos: 37,
      }).totalCents,
    ).toBe(92500);

    expect(
      valorSugeridoDoMes({
        fixoCents: 0,
        percentualBps: 6000,
        porAtendimentoCents: 0,
        baseCents: 1234567,
        atendimentos: 80,
      }).totalCents,
    ).toBe(740740);
  });

  it("sem base nem atendimentos, sobra só o fixo", () => {
    expect(
      valorSugeridoDoMes({
        fixoCents: 90000,
        percentualBps: 0,
        porAtendimentoCents: 0,
        baseCents: 0,
        atendimentos: 0,
      }).totalCents,
    ).toBe(90000);
  });
});

describe("valor que já vem no diálogo de pagamento", () => {
  const sugerido = valorSugeridoDoMes({
    fixoCents: 190000,
    percentualBps: 1000,
    porAtendimentoCents: 2500,
    baseCents: 845000,
    atendimentos: 4,
  });

  it("cada tipo puxa a parte certa do combinado", () => {
    expect(valorDoTipoDePagamento("salario", sugerido)).toBe(190000);
    expect(valorDoTipoDePagamento("bolsa", sugerido)).toBe(190000);
    expect(valorDoTipoDePagamento("comissao", sugerido)).toBe(84500);
    expect(valorDoTipoDePagamento("cota_parte", sugerido)).toBe(94500);
    expect(valorDoTipoDePagamento("repasse", sugerido)).toBe(94500);
  });

  it("o que não tem conta combinada vem vazio, para o dono digitar", () => {
    for (const tipo of ["adiantamento", "bonus", "beneficio", "encargo", "rescisao", "outro"] as const) {
      expect(valorDoTipoDePagamento(tipo, sugerido)).toBe(0);
    }
  });
});

describe("profissionais da agenda livres para ligar", () => {
  const profissionais = [
    { id: "p1", nome: "Juliana Prado" },
    { id: "p2", nome: "Bianca Rocha" },
    { id: "p3", nome: "Marcos Teixeira" },
  ];
  const colaboradores = [
    { id: "c1", profissionalId: "p1" },
    { id: "c2", profissionalId: null },
    { id: "c3", profissionalId: "p2" },
  ];

  it("esconde quem já está ligado a outro colaborador", () => {
    expect(profissionaisLivres(profissionais, colaboradores).map((p) => p.id)).toEqual(["p3"]);
  });

  it("mantém o profissional do próprio colaborador em edição", () => {
    expect(profissionaisLivres(profissionais, colaboradores, "c1").map((p) => p.id)).toEqual([
      "p1",
      "p3",
    ]);
  });
});

describe("datas de calendário", () => {
  it("formata o dia sem passar por fuso", () => {
    expect(formatarDia("2026-10-05")).toBe("05/10/2026");
    expect(formatarDia("2026-01-01")).toBe("01/01/2026");
  });

  it("conta os dias do período, inclusive o primeiro e o último", () => {
    expect(diasNoPeriodo("2026-11-03", "2026-11-03")).toBe(1);
    expect(diasNoPeriodo("2026-11-03", "2026-11-17")).toBe(15);
    expect(diasNoPeriodo("2026-02-27", "2026-03-02")).toBe(4);
    expect(diasNoPeriodo("2026-10-01", "2026-10-31")).toBe(31);
  });

  it("soma meses encostando no fim do mês", () => {
    expect(somarMeses("2024-01-31", 1)).toBe("2024-02-29");
    expect(somarMeses("2025-01-31", 1)).toBe("2025-02-28");
    expect(somarMeses("2024-10-15", 24)).toBe("2026-10-15");
    expect(somarMeses("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("limites do mês", () => {
    expect(limitesDoMes("2026-02")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(limitesDoMes("2024-02")).toEqual({ de: "2024-02-01", ate: "2024-02-29" });
    expect(limitesDoMes("2026-10")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
  });

  it("ativo hoje e ativo no mês", () => {
    expect(estaAtivo({ inicio: "2026-01-05", fim: null }, "2026-10-12")).toBe(true);
    expect(estaAtivo({ inicio: "2026-01-05", fim: "2026-10-12" }, "2026-10-12")).toBe(true);
    expect(estaAtivo({ inicio: "2026-01-05", fim: "2026-10-11" }, "2026-10-12")).toBe(false);
    expect(estaAtivo({ inicio: "2026-11-01", fim: null }, "2026-10-12")).toBe(false);

    expect(ativoNoMes({ inicio: "2026-10-31", fim: null }, "2026-10")).toBe(true);
    expect(ativoNoMes({ inicio: "2026-01-05", fim: "2026-10-01" }, "2026-10")).toBe(true);
    expect(ativoNoMes({ inicio: "2026-01-05", fim: "2026-09-30" }, "2026-10")).toBe(false);
    expect(ativoNoMes({ inicio: "2026-11-01", fim: null }, "2026-10")).toBe(false);
  });
});

describe("alertas", () => {
  const hoje = "2026-10-12";
  const pessoa = (dados: Partial<ColaboradorParaAlerta>): ColaboradorParaAlerta => ({
    id: dados.id ?? "1",
    nome: dados.nome ?? "Rafael Lima",
    contrato: dados.contrato ?? "clt",
    inicio: dados.inicio ?? "2026-01-05",
    fim: dados.fim ?? null,
    removido: dados.removido,
  });

  it("MEI com mais empregados CLT ativos do que o permitido", () => {
    const dois = [pessoa({ id: "1" }), pessoa({ id: "2", nome: "Carla Mendes" })].slice(
      0,
      MEI_MAX_EMPREGADOS + 1,
    );
    const alertas = alertasDaEquipe({ regime: "mei", hoje, colaboradores: dois });
    expect(alertas.map((a) => a.chave)).toContain("mei-empregados");
    expect(alertas[0].texto).toContain("art. 18-C");

    // dentro do limite, outro regime, desligado ou outro vínculo: sem alerta
    expect(
      alertasDaEquipe({ regime: "mei", hoje, colaboradores: dois.slice(0, MEI_MAX_EMPREGADOS) }),
    ).toEqual([]);
    expect(alertasDaEquipe({ regime: "simples_nacional", hoje, colaboradores: dois })).toEqual([]);
    expect(
      alertasDaEquipe({
        regime: "mei",
        hoje,
        colaboradores: [pessoa({ id: "1" }), pessoa({ id: "2", fim: "2026-09-30" })],
      }),
    ).toEqual([]);
    expect(
      alertasDaEquipe({
        regime: "mei",
        hoje,
        colaboradores: [pessoa({ id: "1" }), pessoa({ id: "2", contrato: "mei" })],
      }),
    ).toEqual([]);
  });

  it("estagiário além do prazo máximo", () => {
    const inicioNoLimite = somarMeses(hoje, -ESTAGIO_DURACAO_MAX_MESES);
    const noLimite = pessoa({ contrato: "estagio", nome: "Lívia Souza", inicio: inicioNoLimite });
    expect(alertasDaEquipe({ regime: "mei", hoje, colaboradores: [noLimite] })).toEqual([]);

    const passou = pessoa({
      contrato: "estagio",
      nome: "Lívia Souza",
      inicio: somarMeses(inicioNoLimite, -1),
    });
    const alertas = alertasDaEquipe({ regime: "mei", hoje, colaboradores: [passou] });
    expect(alertas).toHaveLength(1);
    expect(alertas[0].titulo).toContain("Lívia Souza");
    expect(alertas[0].texto).toContain("Lei 11.788/2008");

    // estágio já encerrado não alerta
    expect(
      alertasDaEquipe({ regime: "mei", hoje, colaboradores: [{ ...passou, fim: "2026-09-01" }] }),
    ).toEqual([]);
  });

  it("parceria lembra do contrato homologado e da cota-parte na receita bruta", () => {
    const alertas = alertasDaEquipe({
      regime: "mei",
      hoje,
      colaboradores: [pessoa({ contrato: "parceria", nome: "Juliana Prado" })],
    });
    expect(alertas.map((a) => a.chave)).toEqual(["parceria-contrato", "parceria-receita"]);
    expect(alertas[0].texto).toMatch(/homologado/);
    expect(alertas[1].texto).toMatch(/contador/);
    expect(alertas[1].texto).toMatch(/receita bruta/);
  });

  it("ex-colaborador removido não conta", () => {
    expect(
      alertasDaEquipe({
        regime: "mei",
        hoje,
        colaboradores: [pessoa({ contrato: "parceria", removido: true })],
      }),
    ).toEqual([]);
  });
});
