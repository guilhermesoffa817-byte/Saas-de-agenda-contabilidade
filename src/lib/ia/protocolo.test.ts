import { describe, expect, it } from "vitest";

import { interpretarMarkdown, interpretarTrechos, linkSeguro } from "@/components/app/assistente/markdown";
import {
  codificarEvento,
  esquemaPedidoAoAssistente,
  lerEventos,
  separarEventos,
  type EventoAssistente,
} from "@/components/app/assistente/protocolo";

describe("corpo do pedido ao assistente", () => {
  it("aceita pergunta com ou sem conversa", () => {
    expect(esquemaPedidoAoAssistente.safeParse({ pergunta: "Como foi meu último mês?" }).success).toBe(true);
    expect(
      esquemaPedidoAoAssistente.safeParse({
        conversaId: "3f0e6f2c-6a8e-4c43-9a43-4c1c1f0b9f10",
        pergunta: "E em agosto?",
      }).success,
    ).toBe(true);
  });

  it.each([
    [{}, "Escreva a sua pergunta."],
    [{ pergunta: "   " }, "Escreva a sua pergunta."],
    [{ pergunta: "x".repeat(2001) }, "A pergunta pode ter até 2000 caracteres."],
    [{ pergunta: "oi", conversaId: "123" }, "Conversa inválida."],
    [{ pergunta: 42 }, "Escreva a sua pergunta."],
  ])("recusa %j", (corpo, mensagem) => {
    const r = esquemaPedidoAoAssistente.safeParse(corpo);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(mensagem);
  });

  it("apara espaços da pergunta", () => {
    expect(esquemaPedidoAoAssistente.parse({ pergunta: "  oi  " }).pergunta).toBe("oi");
  });
});

describe("NDJSON", () => {
  const eventos: EventoAssistente[] = [
    { tipo: "inicio", conversaId: "c1", titulo: "Como foi?", nova: true },
    { tipo: "texto", delta: "Linha 1\nLinha 2 — R$ 1.234,56" },
    { tipo: "fim", salvo: true, cota: { usados: 3, limite: 20 } },
  ];

  it("uma linha por evento, mesmo com quebra de linha no texto", () => {
    const texto = eventos.map(codificarEvento).join("");
    expect(texto.split("\n").filter(Boolean)).toHaveLength(3);
    expect(separarEventos(texto)).toEqual({ eventos, resto: "" });
  });

  it("pedaço quebrado no meio da linha fica para depois; lixo é ignorado", () => {
    const texto = codificarEvento(eventos[0]) + "não é json\n" + '{"tipo":"desconhecido"}\n' + codificarEvento(eventos[1]).slice(0, 10);
    const r = separarEventos(texto);
    expect(r.eventos).toEqual([eventos[0]]);
    expect(r.resto).toBe(codificarEvento(eventos[1]).slice(0, 10));
  });

  it("lê o corpo em pedaços arbitrários, inclusive no meio de um caractere", async () => {
    const bytes = new TextEncoder().encode(eventos.map(codificarEvento).join(""));
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    const recebidos: EventoAssistente[] = [];
    await lerEventos(corpo, (e) => recebidos.push(e));
    expect(recebidos).toEqual(eventos);
  });
});

describe("markdown da resposta", () => {
  it("parágrafos, títulos e listas", () => {
    expect(
      interpretarMarkdown("## Resumo\nEntrou **R$ 12.500,00**\nem setembro.\n\n- Aluguel\n- Insumos\n  e produtos\n\n1. Revise\n2. Ajuste"),
    ).toEqual([
      { tipo: "titulo", trechos: [{ tipo: "texto", texto: "Resumo" }] },
      {
        tipo: "paragrafo",
        trechos: [
          { tipo: "texto", texto: "Entrou " },
          { tipo: "negrito", texto: "R$ 12.500,00" },
          { tipo: "texto", texto: " em setembro." },
        ],
      },
      {
        tipo: "lista",
        ordenada: false,
        itens: [[{ tipo: "texto", texto: "Aluguel" }], [{ tipo: "texto", texto: "Insumos e produtos" }]],
      },
      { tipo: "lista", ordenada: true, itens: [[{ tipo: "texto", texto: "Revise" }], [{ tipo: "texto", texto: "Ajuste" }]] },
    ]);
  });

  it("só links https viram link; o resto vira texto", () => {
    expect(interpretarTrechos("[fonte](https://sebrae.com.br/x) e [mal](javascript:alert(1)) e [http](http://a.com)")).toEqual([
      { tipo: "link", texto: "fonte", url: "https://sebrae.com.br/x" },
      { tipo: "texto", texto: " e mal) e http" },
    ]);
    expect(interpretarTrechos("Veja https://exemplo.com.br/a.")).toEqual([
      { tipo: "texto", texto: "Veja " },
      { tipo: "link", texto: "https://exemplo.com.br/a", url: "https://exemplo.com.br/a" },
      { tipo: "texto", texto: "." },
    ]);
    expect(linkSeguro("data:text/html,<script>")).toBeNull();
  });

  it("HTML no texto continua texto (o React escapa)", () => {
    expect(interpretarMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      { tipo: "paragrafo", trechos: [{ tipo: "texto", texto: "<img src=x onerror=alert(1)>" }] },
    ]);
  });
});
