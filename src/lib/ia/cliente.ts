import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente da API do Claude (Anthropic). Só no servidor: a ANTHROPIC_API_KEY
 * nunca chega ao navegador.
 *
 * Tudo passa por `client.beta.messages.*`, porque `fallbacks` só existe nos
 * tipos e no método beta do SDK.
 */
export const MODELO_IA = "claude-opus-5-5" as const;
/** Forma escalar `fallbacks: "default"`; o header -06-01 é só da forma em array. */
export const BETA_FALLBACK = "server-side-fallback-2026-07-01" as const;

/** Lê o ambiente na hora da chamada (e não na carga do módulo). */
export function iaConfigurada() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cliente: Anthropic | null = null;

/** Cliente único por processo; o SDK lê ANTHROPIC_API_KEY do ambiente. */
export function anthropic() {
  cliente ??= new Anthropic({ maxRetries: 2, timeout: 5 * 60_000 });
  return cliente;
}

export type ErroIA = { codigo: string; mensagem: string; repetivel: boolean };

/** Erros do SDK -> pt-BR. Subclasses antes de APIError. */
export function traduzirErroIA(err: unknown): ErroIA {
  if (err instanceof Anthropic.APIUserAbortError) {
    return { codigo: "cancelado", mensagem: "Pedido cancelado.", repetivel: false };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      codigo: "tempo",
      mensagem: "A IA demorou demais para responder. Tente de novo.",
      repetivel: true,
    };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return {
      codigo: "rede",
      mensagem: "Sem conexão com o serviço de IA. Tente de novo.",
      repetivel: true,
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      codigo: "limite",
      mensagem: "Muitos pedidos agora. Espere um minuto e tente de novo.",
      repetivel: true,
    };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { codigo: "config", mensagem: "A IA não está configurada corretamente.", repetivel: false };
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return {
      codigo: "pedido",
      mensagem: "Não foi possível montar o pedido para a IA.",
      repetivel: false,
    };
  }
  if (err instanceof Anthropic.InternalServerError) {
    return {
      codigo: err.type === "overloaded_error" ? "sobrecarga" : "servidor",
      mensagem: "O serviço de IA está instável. Tente de novo em instantes.",
      repetivel: true,
    };
  }
  // Erro no meio do SSE: APIError genérico, status undefined, err.type preenchido.
  if (err instanceof Anthropic.APIError) {
    const instavel =
      err.type === "overloaded_error" || err.type === "api_error" || err.type === "timeout_error";
    return {
      codigo: err.type ?? "api",
      mensagem: instavel
        ? "O serviço de IA está instável. Tente de novo em instantes."
        : "Erro no serviço de IA.",
      repetivel: instavel,
    };
  }
  // AnthropicError puro = saída estruturada que não interpretou (JSON cortado/fora do schema).
  if (err instanceof Anthropic.AnthropicError) {
    return { codigo: "saida", mensagem: "A IA devolveu uma resposta incompleta.", repetivel: true };
  }
  return { codigo: "desconhecido", mensagem: "Erro inesperado.", repetivel: false };
}
