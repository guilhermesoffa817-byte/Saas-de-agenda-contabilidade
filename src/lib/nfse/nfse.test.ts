import { describe, expect, it } from "vitest";

import { centavosParaReais, pendenciasParaEmitir } from "./tipos";
import { traduzir } from "./index";

const PRESTADOR_OK = {
  razaoSocial: "Studio Ana Ribeiro",
  documento: "12345678000190",
  cidade: "Cuiabá",
  estado: "MT",
};

const CODIGOS_OK = {
  lc116: "06.01",
  codigoMunicipal: "0601",
  cnae: "9602501",
  descricao: "Serviços de cabeleireiro",
};

describe("valor em reais", () => {
  it("centavos viram reais com duas casas, sem estourar o float", () => {
    expect(centavosParaReais(12000)).toBe(120);
    expect(centavosParaReais(5550)).toBe(55.5);
    expect(centavosParaReais(1)).toBe(0.01);
  });
});

describe("o que falta para emitir", () => {
  it("com tudo configurado, não falta nada", () => {
    expect(
      pendenciasParaEmitir({ prestador: PRESTADOR_OK, codigos: CODIGOS_OK, valorCents: 12000 }),
    ).toEqual([]);
  });

  it("sem código de tributação, o contador é quem precisa agir", () => {
    const faltando = pendenciasParaEmitir({
      prestador: PRESTADOR_OK,
      codigos: { lc116: null, codigoMunicipal: null, cnae: null, descricao: null },
      valorCents: 12000,
    });
    expect(faltando).toHaveLength(1);
    expect(faltando[0]).toMatch(/contador configura/);
  });

  it("sem CNPJ e sem cidade, aponta os dois", () => {
    const faltando = pendenciasParaEmitir({
      prestador: { ...PRESTADOR_OK, documento: "", cidade: null },
      codigos: CODIGOS_OK,
      valorCents: 12000,
    });
    expect(faltando).toContain("CPF ou CNPJ do negócio");
    expect(faltando).toContain("cidade do negócio");
  });

  it("valor zerado ou quebrado não vira nota", () => {
    expect(
      pendenciasParaEmitir({ prestador: PRESTADOR_OK, codigos: CODIGOS_OK, valorCents: 0 }),
    ).toContain("valor do recebimento");
    expect(
      pendenciasParaEmitir({ prestador: PRESTADOR_OK, codigos: CODIGOS_OK, valorCents: 120.5 }),
    ).toContain("valor do recebimento");
  });
});

describe("tradução da resposta do provedor", () => {
  it("autorizado vira emitida, com número, código e arquivos", () => {
    const nota = traduzir("lanc-1", {
      status: "autorizado",
      numero: "2026/000123",
      codigo_verificacao: "ABC123",
      caminho_xml_nota_fiscal: "/arquivos/nota.xml",
      caminho_danfse: "/arquivos/nota.pdf",
    });

    expect(nota).toEqual({
      idNoProvedor: "lanc-1",
      status: "emitida",
      numero: "2026/000123",
      codigoVerificacao: "ABC123",
      urlXml: "/arquivos/nota.xml",
      urlPdf: "/arquivos/nota.pdf",
      erro: null,
    });
  });

  it("processando continua processando, sem inventar número", () => {
    const nota = traduzir("lanc-2", { status: "processando_autorizacao" });
    expect(nota.status).toBe("processando");
    expect(nota.numero).toBeNull();
  });

  it("erro de autorização traz a mensagem da prefeitura", () => {
    const nota = traduzir("lanc-3", {
      status: "erro_autorizacao",
      erros: [{ mensagem: "Código de serviço não habilitado para o prestador" }],
    });
    expect(nota.status).toBe("erro");
    expect(nota.erro).toMatch(/não habilitado/);
  });
});
