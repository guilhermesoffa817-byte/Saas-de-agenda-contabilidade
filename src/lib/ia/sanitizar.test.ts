import { describe, expect, it } from "vitest";

import { LIMITE_PARA_IA, sanitizarParaIA } from "./sanitizar";

describe("sanitizarParaIA — o que não vai para o provedor de IA", () => {
  it("tira CPF com e sem pontuação", () => {
    expect(sanitizarParaIA("Reembolso 123.456.789-09")).toBe("Reembolso [cpf]");
    expect(sanitizarParaIA("Reembolso 12345678909 ok")).toBe("Reembolso [cpf] ok");
  });

  it("tira CNPJ com e sem pontuação", () => {
    expect(sanitizarParaIA("Fornecedor 12.345.678/0001-95")).toBe("Fornecedor [cnpj]");
    expect(sanitizarParaIA("Fornecedor 12345678000195")).toBe("Fornecedor [cnpj]");
  });

  it("tira e-mail", () => {
    expect(sanitizarParaIA("Nota enviada para juliana.prado+nf@exemplo.com.br")).toBe(
      "Nota enviada para [e-mail]",
    );
  });

  it("tira telefone nos formatos comuns", () => {
    expect(sanitizarParaIA("Ligar (65) 99999-0000")).toBe("Ligar [telefone]");
    expect(sanitizarParaIA("Ligar +55 65 99999-0000")).toBe("Ligar [telefone]");
    expect(sanitizarParaIA("Ligar 65 3322-1100")).toBe("Ligar [telefone]");
    expect(sanitizarParaIA("Ligar 6533221100")).toBe("Ligar [telefone]");
  });

  it("tira chave Pix aleatória", () => {
    expect(sanitizarParaIA("Pix 123e4567-e89b-42d3-a456-426614174000 pago")).toBe("Pix [chave] pago");
  });

  it("deixa valores, datas e horas em paz", () => {
    const textos = [
      "Aluguel de outubro R$ 1.234,56",
      "Compra de R$ 12.345.678,90 em equipamentos",
      "Pago em 12/10/2026 às 10:30",
      "Competência 2026-10-01, vencimento 2026-10-12",
      "Parcela 3/12 de 450,00",
      "Nota fiscal 000123",
    ];
    for (const texto of textos) expect(sanitizarParaIA(texto)).toBe(texto);
  });

  it("corta em 200 caracteres", () => {
    const longo = "Materiais de limpeza ".repeat(20);
    const limpo = sanitizarParaIA(longo);
    expect(LIMITE_PARA_IA).toBe(200);
    expect(limpo).toHaveLength(200);
    expect(longo.startsWith(limpo)).toBe(true);
  });

  it("corta depois de limpar: o dado pessoal não volta pela metade", () => {
    const texto = `${"x".repeat(195)} 123.456.789-09`;
    const limpo = sanitizarParaIA(texto);
    expect(limpo).not.toMatch(/\d/);
    expect(limpo.length).toBeLessThanOrEqual(200);
  });
});
