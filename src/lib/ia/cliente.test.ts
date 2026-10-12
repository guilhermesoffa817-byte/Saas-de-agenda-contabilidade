import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MODELO_IA, iaConfigurada, traduzirErroIA } from "./cliente";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cliente de IA", () => {
  it("usa o Opus 5.5", () => {
    expect(MODELO_IA).toBe("claude-opus-5-5");
  });

  it("iaConfigurada lê o ambiente na hora", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(iaConfigurada()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-de-teste");
    expect(iaConfigurada()).toBe(true);
  });

  it("traduz os erros do SDK para português", () => {
    expect(traduzirErroIA(new Anthropic.APIUserAbortError()).codigo).toBe("cancelado");
    expect(traduzirErroIA(new Anthropic.APIConnectionTimeoutError()).codigo).toBe("tempo");
    expect(traduzirErroIA(new Anthropic.APIConnectionError({ message: "x" })).codigo).toBe("rede");

    const limite = traduzirErroIA(new Anthropic.RateLimitError(429, undefined, "x", new Headers()));
    expect(limite).toMatchObject({ codigo: "limite", repetivel: true });

    const sobrecarga = traduzirErroIA(
      new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error" } }, "x", new Headers()),
    );
    expect(sobrecarga.repetivel).toBe(true);

    expect(traduzirErroIA(new Anthropic.AnthropicError("json cortado")).codigo).toBe("saida");
    expect(traduzirErroIA(new Error("?"))).toMatchObject({ codigo: "desconhecido", repetivel: false });
  });
});
