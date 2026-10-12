import { afterEach, describe, expect, it } from "vitest";

import { dynamic, maxDuration, POST } from "@/app/api/assistente/route";

/**
 * O que dá para provar sem sessão e sem a API da Anthropic: as portas que vêm
 * antes de qualquer cookie ou banco — origem, configuração e corpo do pedido.
 */
const originais = { ...process.env };

afterEach(() => {
  process.env = { ...originais };
});

function pedido(corpo: unknown, cabecalhos: Record<string, string> = { origin: "https://bossa.app.br", host: "bossa.app.br" }) {
  return new Request("https://bossa.app.br/api/assistente", {
    method: "POST",
    headers: { "content-type": "application/json", ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

describe("POST /api/assistente", () => {
  it("roda dinâmica, com tempo para pesquisa e várias ferramentas", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
  });

  it("recusa pedido de outra origem (CSRF)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-teste";
    const r = await POST(pedido({ pergunta: "oi" }, { origin: "https://outro.site", host: "bossa.app.br" }));
    expect(r.status).toBe(403);
  });

  it("recusa pedido sem cabeçalho de origem", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-teste";
    const r = await POST(pedido({ pergunta: "oi" }, { host: "bossa.app.br" }));
    expect(r.status).toBe(403);
  });

  it("explica quando a chave da IA não está configurada", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await POST(pedido({ pergunta: "Como foi meu último mês?" }));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: "config", erro: expect.stringContaining("ANTHROPIC_API_KEY") });
  });

  it.each([
    ["JSON quebrado", "{pergunta:", "Pedido inválido."],
    ["sem pergunta", {}, "Escreva a sua pergunta."],
    ["pergunta vazia", { pergunta: "   " }, "Escreva a sua pergunta."],
    ["pergunta longa", { pergunta: "a".repeat(2001) }, "A pergunta pode ter até 2000 caracteres."],
    ["conversa inválida", { pergunta: "oi", conversaId: "../outra" }, "Conversa inválida."],
  ])("valida o corpo: %s", async (_caso, corpo, mensagem) => {
    process.env.ANTHROPIC_API_KEY = "sk-teste";
    const r = await POST(pedido(corpo));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ erro: mensagem });
  });
});
