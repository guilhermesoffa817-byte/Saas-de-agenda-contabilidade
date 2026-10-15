import Anthropic from "@anthropic-ai/sdk";

/**
 * API da Anthropic falsa para testes: respostas em SSE montadas evento a
 * evento, servidas por um `fetch` fixo (o SDK guarda o fetch na construção).
 */
export type EventoSse = Record<string, unknown> & { type: string };

export const usoFalso = {
  input_tokens: 100,
  output_tokens: 20,
  cache_creation_input_tokens: 400,
  cache_read_input_tokens: 50,
  server_tool_use: null,
  service_tier: "standard",
  iterations: null,
};

export const inicioSse = (id: string): EventoSse => ({
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
    usage: usoFalso,
  },
});

export const fimSse = (stop: string): EventoSse[] => [
  { type: "message_delta", delta: { stop_reason: stop, stop_details: null, stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: "message_stop" },
];

export const textoSse = (indice: number, ...partes: string[]): EventoSse[] => [
  { type: "content_block_start", index: indice, content_block: { type: "text", text: "" } },
  ...partes.map((text) => ({ type: "content_block_delta", index: indice, delta: { type: "text_delta", text } })),
  { type: "content_block_stop", index: indice },
];

export const ferramentaSse = (indice: number, id: string, nome: string, json: string): EventoSse[] => [
  { type: "content_block_start", index: indice, content_block: { type: "tool_use", id, name: nome, input: {} } },
  { type: "content_block_delta", index: indice, delta: { type: "input_json_delta", partial_json: json } },
  { type: "content_block_stop", index: indice },
];

export const sse = (eventos: EventoSse[]) => () =>
  new Response(eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

/** Cliente com fila de respostas; guarda o corpo cru de cada pedido (os bytes enviados). */
export function apiFalsa(respostas: ((init?: RequestInit) => Response | Promise<Response>)[]) {
  const corposCrus: string[] = [];
  const fila = [...respostas];
  const cliente = new Anthropic({
    apiKey: "sk-teste",
    maxRetries: 0,
    fetch: async (_url, init) => {
      corposCrus.push(String(init?.body));
      const proxima = fila.shift();
      if (!proxima) throw new Error("pedido inesperado à API");
      return proxima(init);
    },
  });
  return {
    cliente,
    corposCrus,
    corpos: () => corposCrus.map((c) => JSON.parse(c) as Record<string, unknown>),
  };
}
