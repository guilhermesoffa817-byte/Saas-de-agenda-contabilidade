import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Achado 33: "Remover bloqueio" devolvia a mensagem crua do banco. Um bloqueio
 * pode ter nascido de uma ausência da equipe (férias, atestado), e a recepção
 * não deve ficar sabendo o motivo pela mensagem de erro.
 */
const estado = vi.hoisted(() => ({
  erro: null as { message: string; code?: string } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/sessao", () => ({
  empresaAtual: async () => ({
    vinculo: { papel: "recepcao", empresa: { id: "org-1", timezone: "America/Sao_Paulo" } },
    vinculos: [],
  }),
  garantirEscrita: () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const b = {
      delete: () => b,
      eq: () => b,
      then: (ok: (valor: unknown) => unknown) => Promise.resolve({ error: estado.erro }).then(ok),
    };
    return { from: () => b };
  },
}));

const { removerBloqueio } = await import("./acoes");

beforeEach(() => {
  estado.erro = null;
});

describe("removerBloqueio não revela o tipo de ausência", () => {
  it.each([
    "Este tipo de ausência não combina com o vínculo do colaborador.",
    "Colaborador de outra empresa.",
    "Este colaborador foi removido e não pode ser editado.",
  ])("%s", async (mensagem) => {
    estado.erro = { code: "P0001", message: mensagem };
    const { erro } = await removerBloqueio("33333333-3333-4333-8333-333333333333");

    expect(erro).toBeDefined();
    expect(erro).not.toBe(mensagem);
    expect(erro).not.toMatch(/aus[eê]ncia|f[eé]rias|atestado|v[ií]nculo|licen[cç]a|falta/i);
    expect(erro).toContain("tela Equipe");
  });

  it("outros erros também não saem crus", async () => {
    estado.erro = { code: "XX000", message: 'relation "time_off" does not exist' };
    const { erro } = await removerBloqueio("33333333-3333-4333-8333-333333333333");
    expect(erro).toBe("Não conseguimos remover o bloqueio. Tente de novo.");
  });

  it("sem erro, remove", async () => {
    const resposta = await removerBloqueio("33333333-3333-4333-8333-333333333333");
    expect(resposta).toEqual({ aviso: "Bloqueio removido." });
  });
});
