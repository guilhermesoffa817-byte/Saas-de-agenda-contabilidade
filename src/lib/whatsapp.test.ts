import { describe, expect, it } from "vitest";

import { linkWhatsApp, mensagemLembrete } from "./whatsapp";

describe("linkWhatsApp", () => {
  it("monta o link com só os dígitos do telefone", () => {
    expect(linkWhatsApp("+55 (66) 99999-9999", "Oi")).toBe("https://wa.me/5566999999999?text=Oi");
  });

  it("escapa a mensagem", () => {
    const link = linkWhatsApp("+5566999999999", "Olá, João! Tudo bem? 10:00");
    expect(link).toContain("?text=Ol%C3%A1%2C%20Jo%C3%A3o!%20Tudo%20bem%3F%2010%3A00");
    expect(link).not.toContain(" ");
  });
});

describe("mensagemLembrete", () => {
  it("fala o essencial e pede confirmação", () => {
    const mensagem = mensagemLembrete({
      cliente: "Maria",
      servico: "Escova",
      data: "05/10/2026",
      hora: "14:30",
      empresa: "Studio Ana",
    });

    expect(mensagem).toContain("Maria");
    expect(mensagem).toContain("Escova");
    expect(mensagem).toContain("05/10/2026");
    expect(mensagem).toContain("14:30");
    expect(mensagem).toContain("Studio Ana");
    expect(mensagem).toMatch(/confirmar\?$/);
  });
});
