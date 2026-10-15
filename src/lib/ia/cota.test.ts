import { describe, expect, it, vi } from "vitest";

const adminRpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc }) }));

import { atualizarUsoDeIa, cancelarUsoDeIa, cotaDeIa, reservarUsoDeIa, somarUso } from "./cota";

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

describe("reservarUsoDeIa", () => {
  it("reserva no banco com o limite do plano e devolve os ids", async () => {
    const { cliente, rpc } = clienteFalso({ data: [41, 42, 43], error: null });
    const reserva = await reservarUsoDeIa({
      supabase: cliente,
      empresa: { id: "org-1", plan: "profissional" },
      recurso: "classificacao",
      unidades: 3,
    });
    expect(rpc).toHaveBeenCalledWith("reservar_uso_de_ia", {
      p_org: "org-1",
      p_feature: "classificacao",
      p_unidades: 3,
      p_limite: 300,
    });
    expect(reserva).toEqual({ ok: true, ids: [41, 42, 43] });
  });

  it("uma pergunta ao assistente reserva 1, com o teto do teste grátis", async () => {
    const { cliente, rpc } = clienteFalso({ data: [7], error: null });
    await reservarUsoDeIa({ supabase: cliente, empresa: { id: "org-1", plan: "trial" }, recurso: "assistente" });
    expect(rpc).toHaveBeenCalledWith("reservar_uso_de_ia", {
      p_org: "org-1",
      p_feature: "assistente",
      p_unidades: 1,
      p_limite: 10,
    });
  });

  it("franquia esgotada não é falha: devolve quanto ainda cabe", async () => {
    const parcial = clienteFalso({
      data: null,
      error: { message: "A franquia de IA deste mês não cobre este pedido: restam 4.", details: "4" },
    });
    expect(
      await reservarUsoDeIa({
        supabase: parcial.cliente,
        empresa: { id: "org-1", plan: "essencial" },
        recurso: "classificacao",
        unidades: 10,
      }),
    ).toEqual({ ok: false, restantes: 4, mensagem: "A franquia de IA deste mês não cobre este pedido: restam 4." });

    const acabou = clienteFalso({
      data: null,
      error: { message: "A franquia de IA deste mês acabou.", details: "0" },
    });
    expect(
      await reservarUsoDeIa({ supabase: acabou.cliente, empresa: { id: "org-1", plan: "essencial" }, recurso: "assistente" }),
    ).toMatchObject({ ok: false, restantes: 0 });
  });

  it("qualquer outro erro barra a IA", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "Sem permissão." } });
    await expect(
      reservarUsoDeIa({ supabase: cliente, empresa: { id: "org-1", plan: "negocio" }, recurso: "assistente" }),
    ).rejects.toThrow(/franquia/i);
  });
});

describe("atualizarUsoDeIa", () => {
  it("grava os totais somados de todas as chamadas, com a escrita de cache", async () => {
    const { cliente, rpc } = clienteFalso({ data: 1, error: null });
    const achou = await atualizarUsoDeIa({
      supabase: cliente,
      ids: [41, 42],
      usage: [
        {
          input_tokens: 1000,
          output_tokens: 200,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 5000,
          server_tool_use: null,
        },
        {
          input_tokens: 1500,
          output_tokens: 300,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: 1200,
          server_tool_use: { web_search_requests: 2 },
        },
      ],
    });
    expect(achou).toBe(true);
    expect(rpc).toHaveBeenCalledWith("atualizar_uso_de_ia", {
      p_ids: [41, 42],
      p_input: 2500,
      p_output: 500,
      p_cache_read: 800,
      p_cache_creation: 6200,
      p_web_searches: 2,
    });
  });

  it("avisa quando não grava", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "Uso de IA inválido." } });
    await expect(
      atualizarUsoDeIa({ supabase: cliente, ids: [1], usage: { input_tokens: 1, output_tokens: 1 } }),
    ).rejects.toThrow(/uso da IA/i);
  });

  it("somarUso aceita uma chamada só", () => {
    expect(somarUso({ input_tokens: 10, output_tokens: 5 })).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      web_searches: 0,
    });
  });
});

describe("cancelarUsoDeIa", () => {
  it("devolve a reserva pela chave secreta, escopada à empresa e ao usuário", async () => {
    adminRpc.mockResolvedValueOnce({ data: 2, error: null });
    expect(await cancelarUsoDeIa({ empresaId: "org-1", userId: "user-1", ids: [41, 42] })).toBe(2);
    expect(adminRpc).toHaveBeenCalledWith("cancelar_uso_de_ia", {
      p_ids: [41, 42],
      p_org: "org-1",
      p_user: "user-1",
    });
  });

  it("nunca lança: falha vira 0, e lista vazia nem chama o banco", async () => {
    adminRpc.mockClear();
    expect(await cancelarUsoDeIa({ empresaId: "org-1", userId: "user-1", ids: [] })).toBe(0);
    expect(adminRpc).not.toHaveBeenCalled();
    adminRpc.mockResolvedValueOnce({ data: null, error: { message: "falhou" } });
    expect(await cancelarUsoDeIa({ empresaId: "org-1", userId: "user-1", ids: [1] })).toBe(0);
    adminRpc.mockRejectedValueOnce(new Error("rede"));
    expect(await cancelarUsoDeIa({ empresaId: "org-1", userId: "user-1", ids: [1] })).toBe(0);
  });
});
