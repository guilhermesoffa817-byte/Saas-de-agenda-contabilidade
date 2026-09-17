import { describe, expect, it } from "vitest";

import { formatarTelefone, normalizarTelefone } from "./telefone";

describe("normalizarTelefone", () => {
  it("aceita os jeitos que as pessoas digitam", () => {
    expect(normalizarTelefone("(66) 99999-9999")).toBe("+5566999999999");
    expect(normalizarTelefone("66999999999")).toBe("+5566999999999");
    expect(normalizarTelefone("+55 66 99999-9999")).toBe("+5566999999999");
    expect(normalizarTelefone("5566999999999")).toBe("+5566999999999");
  });

  it("aceita telefone fixo com 10 dígitos", () => {
    expect(normalizarTelefone("(11) 3456-7890")).toBe("+551134567890");
  });

  it("recusa número incompleto ou DDD impossível", () => {
    expect(normalizarTelefone("99999-9999")).toBe(null);
    expect(normalizarTelefone("(01) 99999-9999")).toBe(null);
    expect(normalizarTelefone("abc")).toBe(null);
    expect(normalizarTelefone("")).toBe(null);
  });
});

describe("formatarTelefone", () => {
  it("mostra do jeito que o brasileiro lê", () => {
    expect(formatarTelefone("+5566999999999")).toBe("(66) 99999-9999");
    expect(formatarTelefone("+551134567890")).toBe("(11) 3456-7890");
    expect(formatarTelefone(null)).toBe("");
  });
});
