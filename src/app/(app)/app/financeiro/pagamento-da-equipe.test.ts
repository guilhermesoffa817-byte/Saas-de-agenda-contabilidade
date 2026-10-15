import { describe, expect, it, vi } from "vitest";

/**
 * Achado 34: o banco (0015, trg_proteger_pagamento_da_equipe) recusa mudar
 * valor, tipo, situação ou datas de um lançamento de pagamento da equipe. A
 * ação do Financeiro reconhece a recusa e aponta o caminho certo.
 */
const MENSAGEM_DO_BANCO =
  "Este lançamento é um pagamento da equipe: altere ou exclua pela tela Equipe.";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/sessao", () => ({
  empresaAtual: async () => ({
    vinculo: { papel: "dono", empresa: { id: "org-1", timezone: "America/Sao_Paulo" } },
    vinculos: [],
  }),
  garantirEscrita: () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const b = {
      update: () => b,
      eq: () => b,
      then: (ok: (valor: unknown) => unknown) =>
        Promise.resolve({ error: { code: "P0001", message: MENSAGEM_DO_BANCO } }).then(ok),
    };
    return { from: () => b };
  },
}));

const { salvarLancamento } = await import("./acoes");

describe("editar pagamento da equipe pelo Financeiro", () => {
  it("a recusa do banco vira a orientação para a aba Pagamentos da Equipe", async () => {
    const { erro } = await salvarLancamento({
      lancamentoId: "44444444-4444-4444-8444-444444444444",
      tipo: "despesa",
      descricao: "Cota-parte — Juliana S.",
      valor: 99,
      pago: true,
      dataPagamento: "2026-09-30",
      competencia: "2026-09-30",
      repetirMeses: 1,
    });

    expect(erro).toBe(
      "Este lançamento é um pagamento da equipe: valor, tipo, situação e datas mudam pela tela Equipe, na aba Pagamentos.",
    );
  });
});
