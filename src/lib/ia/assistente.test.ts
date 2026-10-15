import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import type { EventoAssistente } from "@/components/app/assistente/protocolo";

import {
  AVISO_DE_CORTE,
  AVISO_DE_PRAZO,
  AVISO_DE_VOLTAS,
  deveGravar,
  fecharTurno,
  fontesDoConteudo,
  MAX_VOLTAS,
  mensagensParaTela,
  MENSAGEM_DE_RECUSA,
  prepararParaReenvio,
  rodarAssistente,
  textoVisivel,
  tituloDaConversa,
  type OpcoesDoLaco,
} from "./assistente";

/* ------------------------------------------------------------ API falsa */

type Evento = Record<string, unknown> & { type: string };

const usage = {
  input_tokens: 100,
  output_tokens: 20,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: 50,
  server_tool_use: null,
  service_tier: "standard",
  iterations: null,
};

const inicio = (id: string): Evento => ({
  type: "message_start",
  message: {
    id,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [],
    stop_reason: null,
    stop_details: null,
    stop_sequence: null,
    usage,
  },
});

const fim = (stop: string, stopDetails: unknown = null): Evento[] => [
  { type: "message_delta", delta: { stop_reason: stop, stop_details: stopDetails, stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: "message_stop" },
];

const blocoDeTexto = (indice: number, ...partes: string[]): Evento[] => [
  { type: "content_block_start", index: indice, content_block: { type: "text", text: "" } },
  ...partes.map((text) => ({ type: "content_block_delta", index: indice, delta: { type: "text_delta", text } })),
  { type: "content_block_stop", index: indice },
];

const sse = (eventos: Evento[]) => () =>
  new Response(eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

function apiFalsa(respostas: (() => Response)[]) {
  const corpos: Record<string, unknown>[] = [];
  const cabecalhos: Headers[] = [];
  const fila = [...respostas];
  const cliente = new Anthropic({
    apiKey: "sk-teste",
    maxRetries: 0,
    fetch: async (_url, init) => {
      corpos.push(JSON.parse(String(init?.body)));
      cabecalhos.push(new Headers(init?.headers));
      const proxima = fila.shift();
      if (!proxima) throw new Error("pedido inesperado à API");
      return proxima();
    },
  });
  return { cliente, corpos, cabecalhos };
}

function opcoes(cliente: Anthropic, extra: Partial<OpcoesDoLaco> = {}) {
  const eventos: EventoAssistente[] = [];
  const executadas: { nome: string; entrada: unknown }[] = [];
  const base: OpcoesDoLaco = {
    sistema: "sistema fixo",
    ferramentas: [{ name: "resumo_financeiro", description: "d", input_schema: { type: "object" } }],
    historico: [{ role: "user", content: [{ type: "text", text: "Como foi setembro?" }] }],
    executar: async (bloco) => {
      executadas.push({ nome: bloco.name, entrada: bloco.input });
      return { type: "tool_result", tool_use_id: bloco.id, content: '{"receitas":{"cents":1250000}}' };
    },
    statusDe: (nome) => (nome === "web_search" ? "Pesquisando tendências…" : nome === "resumo_financeiro" ? "Lendo o financeiro…" : null),
    emitir: (e) => eventos.push(e),
    cliente,
    ...extra,
  };
  return { base, eventos, executadas };
}

/* ------------------------------------------------------------ o laço */

describe("laço do assistente", () => {
  it("tool_use → pause_turn → end_turn: roda a ferramenta, retoma sem mensagem extra e conclui", async () => {
    const { cliente, corpos, cabecalhos } = apiFalsa([
      sse([
        inicio("a"),
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "assinatura-1" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu1", name: "resumo_financeiro", input: {} } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"inicio":"2026-09-01","fim":"2026-09-30"}' } },
        { type: "content_block_stop", index: 1 },
        ...fim("tool_use"),
      ]),
      sse([
        inicio("b"),
        ...blocoDeTexto(0, "Setembro fechou no azul."),
        { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srv1", name: "web_search", input: {} } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"salão de beleza Cuiabá tendências"}' } },
        { type: "content_block_stop", index: 1 },
        ...fim("pause_turn"),
      ]),
      sse([inicio("c"), ...blocoDeTexto(0, "Sugestão: ", "abrir aos sábados."), ...fim("end_turn")]),
    ]);
    const { base, eventos, executadas } = opcoes(cliente);

    const resultado = await rodarAssistente(base);

    expect(resultado.desfecho).toBe("concluido");
    expect(deveGravar(resultado.desfecho)).toBe(true);
    expect(resultado.chamadas).toBe(3);
    expect(resultado.usos).toHaveLength(3);
    expect(executadas).toEqual([{ nome: "resumo_financeiro", entrada: { inicio: "2026-09-01", fim: "2026-09-30" } }]);

    // Eventos para a tela: status de cada ferramenta e o texto, com parágrafo entre as voltas.
    expect(eventos).toEqual([
      { tipo: "status", mensagem: "Lendo o financeiro…" },
      { tipo: "texto", delta: "Setembro fechou no azul." },
      { tipo: "status", mensagem: "Pesquisando tendências…" },
      { tipo: "texto", delta: "\n\n" },
      { tipo: "texto", delta: "Sugestão: " },
      { tipo: "texto", delta: "abrir aos sábados." },
    ]);

    // 2º pedido: o thinking assinado volta intacto, seguido do tool_result.
    const msgs2 = corpos[1].messages as { role: string; content: { type: string; signature?: string }[] }[];
    expect(msgs2.at(-2)?.content[0]).toMatchObject({ type: "thinking", signature: "assinatura-1" });
    expect(msgs2.at(-1)).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "tu1" }] });

    // 3º pedido (retomada do pause_turn): termina na mensagem do assistente, sem "continue" do usuário.
    const msgs3 = corpos[2].messages as { role: string }[];
    expect(msgs3.at(-1)?.role).toBe("assistant");

    // System, ferramentas e configuração idênticos em todas as voltas.
    for (const corpo of corpos) {
      expect(corpo).toMatchObject({
        model: "claude-opus-5-5",
        system: "sistema fixo",
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
      });
      expect(corpo.tools).toEqual(corpos[0].tools);
      expect(corpo).not.toHaveProperty("thinking");
      expect(corpo).not.toHaveProperty("tool_choice");
    }
    expect(cabecalhos[0].get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");

    // Mensagens novas: assistente(tool_use), user(tool_result), assistente(pausa), assistente(final).
    expect(resultado.novas.map((m) => m.role)).toEqual(["assistant", "user", "assistant", "assistant"]);
  });

  it("recusa: avisa a tela e não grava nada", async () => {
    const { cliente } = apiFalsa([
      sse([inicio("a"), ...blocoDeTexto(0, "Começo de resposta"), ...fim("refusal", { type: "refusal", category: null, explanation: null })]),
    ]);
    const { base, eventos } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("recusa");
    expect(deveGravar(resultado.desfecho)).toBe(false);
    expect(eventos.at(-1)).toEqual({ tipo: "recusa", mensagem: MENSAGEM_DE_RECUSA });
    expect(resultado.usos).toHaveLength(1); // a pergunta gastou tokens e conta na franquia
  });

  it("max_tokens com tool_use cortado: não executa a ferramenta, guarda o texto já lido e tira o tool_use", async () => {
    const { cliente } = apiFalsa([
      sse([
        inicio("a"),
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "assinatura-1" } },
        { type: "content_block_stop", index: 0 },
        ...blocoDeTexto(1, "Setembro fechou com R$ 12.500,00 de receita. Vou consultar as despesas."),
        { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "tu1", name: "resumo_financeiro", input: {} } },
        { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"inicio":"2026-' } },
        { type: "content_block_stop", index: 2 },
        ...fim("max_tokens"),
      ]),
    ]);
    const { base, eventos, executadas } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("cortado");
    expect(deveGravar(resultado.desfecho)).toBe(true);
    expect(executadas).toEqual([]);
    // O texto que a tela já mostrou fica gravado; o tool_use sem resultado sai.
    expect(resultado.novas).toHaveLength(1);
    const blocos = resultado.novas[0].content as { type: string }[];
    expect(blocos.map((b) => b.type)).toEqual(["thinking", "text"]);
    expect(textoVisivel(resultado.novas[0].content)).toContain("Setembro fechou");
    expect(eventos.at(-1)).toEqual({ tipo: "aviso", mensagem: AVISO_DE_CORTE });
  });

  it("pause_turn com pesquisa pendente e continuação cortada: o histórico não termina em server_tool_use sem par", async () => {
    const { cliente } = apiFalsa([
      sse([
        inicio("a"),
        ...blocoDeTexto(0, "Vou pesquisar o mercado."),
        { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srv1", name: "web_search", input: {} } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"salão Cuiabá"}' } },
        { type: "content_block_stop", index: 1 },
        ...fim("pause_turn"),
      ]),
      sse([
        inicio("b"),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "resumo_financeiro", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"inicio"' } },
        { type: "content_block_stop", index: 0 },
        ...fim("max_tokens"),
      ]),
    ]);
    const { base } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("cortado");
    const tipos = resultado.novas.flatMap((m) => (typeof m.content === "string" ? ["string"] : m.content.map((b) => b.type)));
    expect(tipos).toEqual(["text"]);
    expect(tipos).not.toContain("server_tool_use");
    expect(tipos).not.toContain("tool_use");
  });

  it("model_context_window_exceeded é tratado como corte: nada de tool_use sem resultado", async () => {
    const { cliente, corpos } = apiFalsa([
      sse([
        inicio("a"),
        ...blocoDeTexto(0, "Parcial"),
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu1", name: "resumo_financeiro", input: {} } },
        { type: "content_block_stop", index: 1 },
        ...fim("model_context_window_exceeded"),
      ]),
    ]);
    const { base, executadas } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(corpos).toHaveLength(1);
    expect(resultado.desfecho).toBe("cortado");
    expect(executadas).toEqual([]);
    expect(resultado.novas.map((m) => (m.content as { type: string }[]).map((b) => b.type))).toEqual([["text"]]);
  });

  it("grava os tokens a cada volta concluída, com o total acumulado da pergunta", async () => {
    const { cliente } = apiFalsa([
      sse([
        inicio("a"),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "resumo_financeiro", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "content_block_stop", index: 0 },
        ...fim("tool_use"),
      ]),
      sse([inicio("b"), ...blocoDeTexto(0, "Pronto."), ...fim("end_turn")]),
    ]);
    const registros: number[] = [];
    const { base } = opcoes(cliente, { aoConcluirVolta: (usos) => void registros.push(usos.length) });
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("concluido");
    expect(registros).toEqual([1, 2]);
  });

  it("prazo total vencido no meio da resposta: para, avisa e devolve as voltas completas para gravar", async () => {
    const prazo = new AbortController();
    let respondidas = 0;
    const cliente = new Anthropic({
      apiKey: "sk-teste",
      maxRetries: 0,
      fetch: async (_url, init) => {
        if (!respondidas++) {
          return sse([
            inicio("a"),
            { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "resumo_financeiro", input: {} } },
            { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
            { type: "content_block_stop", index: 0 },
            ...fim("tool_use"),
          ])();
        }
        // 2ª volta: fica pendurada até o prazo vencer.
        setTimeout(() => prazo.abort(new DOMException("prazo", "TimeoutError")), 10);
        return new Promise<Response>((_, rejeitar) =>
          init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("abortado", "AbortError"))),
        );
      },
    });
    const navegador = new AbortController();
    const { base, eventos } = opcoes(cliente, { signal: navegador.signal, prazo: prazo.signal });
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("prazo");
    expect(deveGravar(resultado.desfecho)).toBe(true);
    expect(resultado.chamadas).toBe(2);
    expect(resultado.usos).toHaveLength(1);
    expect(eventos.at(-1)).toEqual({ tipo: "aviso", mensagem: AVISO_DE_PRAZO });
    // A volta completa (tool_use + tool_result) fica; a volta cortada não entra.
    expect(resultado.novas.map((m) => m.role)).toEqual(["assistant", "user"]);
  });

  it("prazo já vencido antes de chamar: nenhuma chamada à API", async () => {
    const { cliente, corpos } = apiFalsa([]);
    const { base } = opcoes(cliente, { prazo: AbortSignal.abort() });
    const resultado = await rodarAssistente(base);
    expect(corpos).toHaveLength(0);
    expect(resultado).toMatchObject({ desfecho: "prazo", chamadas: 0, novas: [] });
  });

  it("cancelamento pelo navegador não vira prazo", async () => {
    const navegador = new AbortController();
    navegador.abort();
    const { cliente } = apiFalsa([]);
    const { base, eventos } = opcoes(cliente, { signal: navegador.signal, prazo: AbortSignal.timeout(60_000) });
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("cancelado");
    expect(eventos).toEqual([]);
  });

  it("max_tokens só com texto: guarda o texto cortado e avisa", async () => {
    const { cliente } = apiFalsa([sse([inicio("a"), ...blocoDeTexto(0, "Resposta longa"), ...fim("max_tokens")])]);
    const { base } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("cortado");
    expect(deveGravar("cortado")).toBe(true);
    expect(resultado.novas).toHaveLength(1);
    expect(textoVisivel(resultado.novas[0].content)).toBe("Resposta longa");
  });

  it("erro tipado da API vira evento de erro em pt-BR", async () => {
    const { cliente } = apiFalsa([
      () =>
        new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), {
          status: 529,
          headers: { "content-type": "application/json" },
        }),
    ]);
    const { base, eventos } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("erro");
    expect(resultado.erro?.codigo).toBe("sobrecarga");
    expect(eventos).toEqual([
      { tipo: "erro", codigo: "sobrecarga", mensagem: "O serviço de IA está instável. Tente de novo em instantes." },
    ]);
  });

  it("erro no meio do stream (evento SSE de erro) também vira evento", async () => {
    const { cliente } = apiFalsa([
      sse([inicio("a"), { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]),
    ]);
    const { base, eventos } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(resultado.desfecho).toBe("erro");
    expect(eventos.at(-1)).toMatchObject({ tipo: "erro", codigo: "overloaded_error" });
  });

  it("400 numa conversa com histórico pede para começar outra conversa", async () => {
    const { cliente } = apiFalsa([
      () =>
        new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "x" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    ]);
    const { base, eventos } = opcoes(cliente, {
      historico: [
        { role: "user", content: [{ type: "text", text: "primeira" }] },
        { role: "assistant", content: [{ type: "text", text: "resposta" }] },
        { role: "user", content: [{ type: "text", text: "segunda" }] },
      ],
    });
    await rodarAssistente(base);
    expect(eventos.at(-1)).toMatchObject({ tipo: "erro", codigo: "pedido" });
    expect((eventos.at(-1) as { mensagem: string }).mensagem).toMatch(/nova conversa/);
  });

  it("para depois de MAX_VOLTAS chamadas e não grava", async () => {
    const pausa = () =>
      sse([
        inicio("p"),
        { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "s", name: "web_search", input: {} } },
        { type: "content_block_stop", index: 0 },
        ...fim("pause_turn"),
      ])();
    const { cliente, corpos } = apiFalsa(Array.from({ length: MAX_VOLTAS }, () => pausa));
    const { base, eventos } = opcoes(cliente);
    const resultado = await rodarAssistente(base);
    expect(corpos).toHaveLength(MAX_VOLTAS);
    expect(resultado.desfecho).toBe("voltas");
    expect(deveGravar(resultado.desfecho)).toBe(false);
    expect(eventos.at(-1)).toEqual({ tipo: "aviso", mensagem: AVISO_DE_VOLTAS });
  });

  it("cancelado pelo navegador: aborta o pedido sem evento de erro", async () => {
    let sinal: AbortSignal | undefined;
    const controlador = new AbortController();
    const cliente = new Anthropic({
      apiKey: "sk-teste",
      maxRetries: 0,
      fetch: (_url, init) => {
        sinal = init?.signal ?? undefined;
        return new Promise<Response>((_, rejeitar) =>
          init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("abortado", "AbortError"))),
        );
      },
    });
    const { base, eventos } = opcoes(cliente, { signal: controlador.signal });
    const promessa = rodarAssistente(base);
    await new Promise((r) => setTimeout(r, 20));
    controlador.abort();
    const resultado = await promessa;
    expect(sinal?.aborted).toBe(true);
    expect(resultado.desfecho).toBe("cancelado");
    expect(resultado.chamadas).toBe(1);
    expect(eventos).toEqual([]);
  });

  it("fontes da pesquisa: só https e sem repetir", async () => {
    const citacao = (url: string) => ({
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "citations_delta",
        citation: { type: "web_search_result_location", url, title: "Tendências 2026", cited_text: "x", encrypted_index: "e" },
      },
    });
    const { cliente } = apiFalsa([
      sse([
        inicio("a"),
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: [] } },
        citacao("https://exemplo.com.br/a"),
        citacao("https://exemplo.com.br/a"),
        citacao("javascript:alert(1)"),
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Texto citado." } },
        { type: "content_block_stop", index: 0 },
        ...fim("end_turn"),
      ]),
    ]);
    const { base, eventos } = opcoes(cliente);
    await rodarAssistente(base);
    expect(eventos.filter((e) => e.tipo === "fonte")).toEqual([
      { tipo: "fonte", url: "https://exemplo.com.br/a", titulo: "Tendências 2026" },
    ]);
  });
});

/* ------------------------------------------------------------ apoio */

describe("título da conversa", () => {
  it("é a primeira pergunta sem dado pessoal, em uma linha", () => {
    expect(tituloDaConversa("  Quanto a cliente   do 66 99999-1234\nme deve?  ")).toBe(
      "Quanto a cliente do [telefone] me deve?",
    );
    expect(tituloDaConversa("Meu CPF 123.456.789-09 e e-mail ana@exemplo.com.br")).toBe(
      "Meu CPF [cpf] e e-mail [e-mail]",
    );
  });

  it("tem no máximo 80 caracteres", () => {
    const titulo = tituloDaConversa("Quais serviços ".repeat(20));
    expect(titulo.length).toBeLessThanOrEqual(80);
    expect(titulo.endsWith("…")).toBe(true);
  });

  it("nunca fica vazio", () => {
    expect(tituloDaConversa("   ")).toBe("Nova conversa");
  });
});

describe("reenvio depois de fallback", () => {
  it("tira raciocínio e chamadas sem resultado de antes do bloco fallback", () => {
    const conteudo = [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "text", text: "Olá", citations: null },
      { type: "server_tool_use", id: "x", name: "web_search", input: {} },
      { type: "tool_use", id: "t", name: "resumo_financeiro", input: {} },
      { type: "fallback", from: { model: "a" }, to: { model: "b" }, trigger: { type: "refusal" } },
      { type: "text", text: "continua", citations: null },
    ] as unknown as Anthropic.Beta.BetaContentBlock[];
    expect(prepararParaReenvio(conteudo).map((b) => b.type)).toEqual(["text", "fallback", "text"]);
  });

  it("mantém o par de execução de código da filtragem dinâmica antes do fallback", () => {
    const conteudo = [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "server_tool_use", id: "srv_busca", name: "web_search", input: { query: "salão Cuiabá" } },
      { type: "web_search_tool_result", tool_use_id: "srv_busca", content: [] },
      { type: "server_tool_use", id: "srv_bash", name: "bash_code_execution", input: { command: "python filtra.py" } },
      { type: "bash_code_execution_tool_result", tool_use_id: "srv_bash", content: { type: "bash_code_execution_result", stdout: "ok", stderr: "", return_code: 0, content: [] } },
      { type: "server_tool_use", id: "srv_code", name: "code_execution", input: { code: "print(1)" } },
      { type: "code_execution_tool_result", tool_use_id: "srv_code", content: { type: "code_execution_result", stdout: "1", stderr: "", return_code: 0, content: [] } },
      { type: "server_tool_use", id: "srv_sem_par", name: "web_search", input: { query: "x" } },
      { type: "fallback", from: { model: "a" }, to: { model: "b" }, trigger: { type: "refusal" } },
      { type: "text", text: "continua", citations: null },
    ] as unknown as Anthropic.Beta.BetaContentBlock[];
    const limpo = prepararParaReenvio(conteudo);
    expect(limpo.map((b) => ("id" in b ? `${b.type}:${b.id}` : "tool_use_id" in b ? `${b.type}:${b.tool_use_id}` : b.type))).toEqual([
      "server_tool_use:srv_busca",
      "web_search_tool_result:srv_busca",
      "server_tool_use:srv_bash",
      "bash_code_execution_tool_result:srv_bash",
      "server_tool_use:srv_code",
      "code_execution_tool_result:srv_code",
      "fallback",
      "text",
    ]);
    // Todo resultado mantido tem o seu server_tool_use antes.
    const usos = new Set(limpo.flatMap((b) => (b.type === "server_tool_use" ? [b.id] : [])));
    for (const b of limpo) if ("tool_use_id" in b) expect(usos.has(b.tool_use_id)).toBe(true);
  });

  it("sem fallback, nada muda", () => {
    const conteudo = [{ type: "text", text: "a", citations: null }] as unknown as Anthropic.Beta.BetaContentBlock[];
    expect(prepararParaReenvio(conteudo)).toBe(conteudo);
  });
});

describe("o que a tela recebe de uma conversa gravada", () => {
  it("só o texto visível e as fontes; ferramentas e raciocínio ficam no servidor", () => {
    const tela = mensagensParaTela([
      { id: 1, role: "user", content: [{ type: "text", text: "Hoje é ... \n\nComo foi setembro?" }], display_text: "Como foi setembro?" },
      {
        id: 2,
        role: "assistant",
        content: [
          { type: "thinking", thinking: "raciocínio secreto", signature: "s" },
          { type: "tool_use", id: "t", name: "resumo_financeiro", input: {} },
        ],
        display_text: "",
      },
      { id: 3, role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: '{"x":1}' }], display_text: "" },
      {
        id: 4,
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Entrou R$ 12.500,00.",
            citations: [
              { type: "web_search_result_location", url: "https://exemplo.com.br", title: "Fonte", cited_text: "c", encrypted_index: "e" },
            ],
          },
        ],
        display_text: "Entrou R$ 12.500,00.",
      },
      { id: 5, role: "assistant", content: [{ type: "text", text: "Próximos passos" }], display_text: "Próximos passos" },
    ]);
    expect(tela).toEqual([
      { id: "m1", papel: "usuario", texto: "Como foi setembro?", fontes: [] },
      {
        id: "m4",
        papel: "assistente",
        texto: "Entrou R$ 12.500,00.\n\nPróximos passos",
        fontes: [{ url: "https://exemplo.com.br", titulo: "Fonte" }],
      },
    ]);
    expect(JSON.stringify(tela)).not.toContain("raciocínio secreto");
  });

  it("fontesDoConteudo ignora endereço que não é https", () => {
    expect(
      fontesDoConteudo([
        {
          type: "text",
          text: "x",
          citations: [
            { type: "web_search_result_location", url: "http://inseguro.com", title: null, cited_text: "c", encrypted_index: "e" },
          ],
        },
      ]),
    ).toEqual([]);
  });
});

describe("fechar o turno de uma pergunta interrompida", () => {
  it("sem nada pendente, devolve as mesmas mensagens (os bytes enviados se mantêm)", () => {
    const novas: Anthropic.Beta.BetaMessageParam[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "t", name: "resumo_financeiro", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{}" }] },
      { role: "assistant", content: [{ type: "text", text: "Pronto." }] },
    ];
    const fechado = fecharTurno(novas);
    expect(fechado).toHaveLength(3);
    fechado.forEach((m, i) => expect(m).toBe(novas[i]));
  });

  it("tira a mensagem que só teria raciocínio depois de tirar o pendente", () => {
    const novas: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "tool_use", id: "t", name: "resumo_financeiro", input: {} },
        ],
      },
    ];
    expect(fecharTurno(novas)).toEqual([]);
  });

  it("server_tool_use cujo resultado veio na continuação fica", () => {
    const novas = [
      { role: "assistant", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }] },
      {
        role: "assistant",
        content: [
          { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
          { type: "text", text: "Achei." },
          { type: "tool_use", id: "t", name: "resumo_financeiro", input: {} },
        ],
      },
    ] as unknown as Anthropic.Beta.BetaMessageParam[];
    const fechado = fecharTurno(novas);
    expect(fechado[0]).toBe(novas[0]);
    expect((fechado[1].content as { type: string }[]).map((b) => b.type)).toEqual(["web_search_tool_result", "text"]);
  });
});
