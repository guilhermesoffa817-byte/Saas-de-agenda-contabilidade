import { describe, expect, it } from "vitest";

import {
  classificarPorRegra,
  motivoDaRegraParaGravar,
  motivoParaTela,
  normalizar,
  origemDaExcecao,
  PREFIXO_DA_REGRA,
} from "./regras";

const natureza = (descricao: string, categoria?: string | null) =>
  classificarPorRegra({ descricao, categoria })?.natureza ?? null;

describe("classificarPorRegra", () => {
  it.each([
    "Aluguel da sala 204 — outubro",
    "Condomínio do edifício",
    "Internet fibra 500 MB",
    "Conta de luz — Enel",
    "Energia elétrica",
    "Conta de água Sabesp",
    "Telefone fixo",
    "Honorários do contador",
    "Mensalidade do sistema de agenda",
    "Software de prontuário",
    "Assinatura do Canva",
    "Seguro do consultório",
    "Salário da recepcionista",
    "Anuidade do CRO",
    "Tarifa bancária de manutenção",
  ])("fixo: %s", (descricao) => {
    expect(natureza(descricao)).toBe("fixo");
  });

  it.each([
    "Compra de produtos para coloração",
    "Insumos de esterilização",
    "Material descartável (luvas e máscaras)",
    "Comissão da Juliana — outubro",
    "Repasse ao profissional parceiro",
    "Cota-parte do salão-parceiro",
    "Taxa da maquininha",
    "Taxa de cartão de crédito",
    "Frete da distribuidora",
    "Embalagens para kits",
    "DAS de outubro",
    "ISS do mês",
  ])("variável: %s", (descricao) => {
    expect(natureza(descricao)).toBe("variavel");
  });

  it.each([
    "Juros do cheque especial",
    "Multa por atraso no boleto",
    "IOF",
    "Parcela do empréstimo",
    "Financiamento da autoclave",
    "Compra de equipamento — cadeira odontológica",
    "Investimento em CDB",
    "Carnê-Leão de setembro",
  ])("fora da operação: %s", (descricao) => {
    expect(natureza(descricao)).toBe("nao_operacional");
  });

  it("juros do cartão são financeiros, não taxa de cartão", () => {
    expect(natureza("Juros do cartão de crédito")).toBe("nao_operacional");
  });

  it("'das' minúsculo é contração, não o imposto", () => {
    expect(natureza("Limpeza das janelas")).toBeNull();
    expect(natureza("Conta das luzes do salão")).toBeNull();
  });

  it("pró-labore é fixo e o motivo diz que é remuneração do sócio", () => {
    const resultado = classificarPorRegra({ descricao: "Pró-labore de outubro" });
    expect(resultado?.natureza).toBe("fixo");
    expect(resultado?.motivo).toMatch(/remuneração do sócio/);
    expect(natureza("Pro labore")).toBe("fixo");
  });

  it("Carnê-Leão pede confirmação do contador", () => {
    expect(classificarPorRegra({ descricao: "Carne Leao" })?.motivo).toMatch(/contador/);
  });

  it("usa a categoria quando a descrição não diz nada", () => {
    expect(natureza("Pagamento avulso", "Aluguel extra")).toBe("fixo");
    expect(natureza("Pagamento avulso", "Outras despesas")).toBeNull();
    expect(natureza("Pagamento avulso", null)).toBeNull();
  });

  it("a descrição vence a categoria", () => {
    expect(natureza("Juros do atraso", "Aluguel do espaço")).toBe("nao_operacional");
  });

  it("não casa pedaço de palavra", () => {
    expect(natureza("Lavagem de toalhas")).toBeNull();
    expect(natureza("Material", "")).toBe("variavel");
    expect(natureza("Materialidade")).toBeNull();
  });

  it("devolve null para texto vazio", () => {
    expect(classificarPorRegra({ descricao: "" })).toBeNull();
    expect(classificarPorRegra({ descricao: "   ", categoria: "  " })).toBeNull();
  });

  it("todo motivo é curto e cabe na coluna", () => {
    for (const descricao of ["Aluguel", "Comissão", "Juros", "Pró-labore", "Carnê-Leão"]) {
      const motivo = classificarPorRegra({ descricao })!.motivo;
      expect(motivoDaRegraParaGravar(motivo).length).toBeLessThanOrEqual(200);
    }
  });
});

describe("origem e motivo da exceção", () => {
  it("o prefixo da regra vira a origem 'regra'", () => {
    const gravado = motivoDaRegraParaGravar("Aluguel se paga todo mês.");
    expect(gravado.startsWith(PREFIXO_DA_REGRA)).toBe(true);
    expect(origemDaExcecao("ia", gravado)).toBe("regra");
    expect(origemDaExcecao("ia", "Parece assinatura mensal.")).toBe("ia");
    expect(origemDaExcecao("ia", null)).toBe("ia");
    expect(origemDaExcecao("dono", gravado)).toBe("dono");
  });

  it("a tela não mostra o prefixo técnico", () => {
    expect(motivoParaTela(motivoDaRegraParaGravar("Aluguel se paga todo mês."))).toBe(
      "Aluguel se paga todo mês.",
    );
    expect(motivoParaTela("Assinatura mensal.")).toBe("Assinatura mensal.");
    expect(motivoParaTela(null)).toBeNull();
  });

  it("corta em 200 caracteres", () => {
    expect(motivoDaRegraParaGravar("x".repeat(300))).toHaveLength(200);
  });
});

describe("normalizar", () => {
  it("tira acento, pontuação e caixa", () => {
    expect(normalizar("  Pró-Labore, Condomínio!  ")).toBe("pro labore condominio");
  });
});
