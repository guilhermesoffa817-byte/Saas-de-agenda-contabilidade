import { describe, expect, it, vi } from "vitest";

import { cotaDeIa, registrarUsoDeIa, somarUso } from "./cota";

type Cliente = Parameters<typeof cotaDeIa>[0]["supabase"];

function clienteFalso(resposta: { data: unknown; error: unknown }) {
  const insert = vi.fn(async () => ({ error: resposta.error }));
  const rpc = vi.fn(async () => resposta);
  const from = vi.fn(() => ({ insert }));
  return { cliente: { rpc, from } as unknown as Cliente, rpc, from, insert };
}

describe("cotaDeIa", () => {
  it("conta pelo banco e devolve o que resta da franquia do plano", async () => {
    const { cliente, rpc } = clienteFalso({ data: 7, error: null });
    const cota = await cotaDeIa({
      supabase: cliente,
      empresa: { id: "org-1", plan: "essencial" },
      recurso: "assistente",
    });
    expect(rpc).toHaveBeenCalledWith("uso_de_ia_no_mes", { p_org: "org-1", p_feature: "assistente" });
    expect(cota).toEqual({ limite: 20, usados: 7, restantes: 13 });
  });

  it("nunca devolve saldo negativo", async () => {
    const { cliente } = clienteFalso({ data: 40, error: null });
    const cota = await cotaDeIa({
      supabase: cliente,
      empresa: { id: "org-1", plan: "trial" },
      recurso: "classificacao",
    });
    expect(cota).toEqual({ limite: 30, usados: 40, restantes: 0 });
  });

  it("se não consegue conferir, não libera", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "Sem permissão." } });
    await expect(
      cotaDeIa({ supabase: cliente, empresa: { id: "org-1", plan: "negocio" }, recurso: "assistente" }),
    ).rejects.toThrow(/franquia/i);
  });
});

describe("registrarUsoDeIa", () => {
  it("soma as chamadas de uma pergunta numa linha só", async () => {
    const { cliente, from, insert } = clienteFalso({ data: null, error: null });
    await registrarUsoDeIa({
      supabase: cliente,
      empresaId: "org-1",
      userId: "user-1",
      recurso: "assistente",
      usage: [
        { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 800, server_tool_use: null },
        {
          input_tokens: 1500,
          output_tokens: 300,
          cache_read_input_tokens: null,
          server_tool_use: { web_search_requests: 2 },
        },
      ],
    });
    expect(from).toHaveBeenCalledWith("ai_usage_logs");
    expect(insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      user_id: "user-1",
      feature: "assistente",
      input_tokens: 2500,
      output_tokens: 500,
      cache_read_tokens: 800,
      web_searches: 2,
    });
  });

  it("avisa quando não grava", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "row-level security" } });
    await expect(
      registrarUsoDeIa({
        supabase: cliente,
        empresaId: "org-1",
        userId: null,
        recurso: "classificacao",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    ).rejects.toThrow(/uso da IA/i);
  });

  it("somarUso aceita uma chamada só", () => {
    expect(somarUso({ input_tokens: 10, output_tokens: 5 })).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      cache_read_tokens: 0,
      web_searches: 0,
    });
  });
});
