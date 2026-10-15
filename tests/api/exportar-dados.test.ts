import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exportação LGPD: o PostgREST corta cada resposta em 1.000 linhas, sem erro.
 * A rota tem de pedir página por página, em ordem estável, em todas as tabelas.
 */
type Consulta = { tabela: string; colunas: string; ordem: string; de: number; ate: number };

const estado = vi.hoisted(() => ({
  linhas: {} as Record<string, number>,
  consultas: [] as { tabela: string; colunas: string; ordem: string; de: number; ate: number }[],
  erroEm: null as string | null,
}));

vi.mock("@/lib/supabase/sessao", () => ({
  empresaAtual: async () => ({
    vinculo: {
      papel: "dono",
      empresa: {
        id: "org-1",
        name: "Studio Bela Vista",
        slug: "studio-bela-vista",
        segment: "salao",
        tax_regime: "mei",
        document: null,
        city: "Campinas",
        state: "SP",
        timezone: "America/Sao_Paulo",
        plan: "profissional",
      },
    },
    vinculos: [],
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabela: string) {
      const consulta: Partial<Consulta> = { tabela };
      const construtor = {
        select(colunas: string) {
          consulta.colunas = colunas;
          return construtor;
        },
        eq() {
          return construtor;
        },
        order(coluna: string) {
          consulta.ordem = coluna;
          return construtor;
        },
        range(de: number, ate: number) {
          Object.assign(consulta, { de, ate });
          estado.consultas.push(consulta as Consulta);
          if (estado.erroEm === `${tabela}:${de}`) {
            return Promise.resolve({ data: null, error: { message: "falhou a página" } });
          }
          const total = estado.linhas[tabela] ?? 0;
          const fim = Math.min(ate, total - 1);
          const data = Array.from({ length: Math.max(0, fim - de + 1) }, (_, i) => ({ id: de + i + 1 }));
          return Promise.resolve({ data, error: null });
        },
      };
      return construtor;
    },
  }),
}));

import { GET } from "@/app/api/dados/exportar/route";

beforeEach(() => {
  estado.linhas = {};
  estado.consultas = [];
  estado.erroEm = null;
});

async function exportar() {
  const resposta = await GET();
  expect(resposta.status).toBe(200);
  return (await resposta.json()) as Record<string, unknown>;
}

describe("GET /api/dados/exportar", () => {
  it("traz todas as linhas de cada tabela, passando de 1.000", async () => {
    estado.linhas = { transactions: 2500, ai_usage_logs: 1000, audit_logs: 3, ai_messages: 1200 };
    const pacote = await exportar();

    expect((pacote.transactions as unknown[]).length).toBe(2500);
    expect((pacote.ai_usage_logs as unknown[]).length).toBe(1000);
    expect((pacote.audit_logs as unknown[]).length).toBe(3);
    expect((pacote.ai_messages as unknown[]).length).toBe(1200);
    // Sem repetir nem pular linha entre as páginas.
    const ids = (pacote.transactions as { id: number }[]).map((l) => l.id);
    expect(new Set(ids).size).toBe(2500);
    expect(ids.at(-1)).toBe(2500);

    const paginas = (tabela: string) => estado.consultas.filter((c) => c.tabela === tabela).map((c) => [c.de, c.ate]);
    expect(paginas("transactions")).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // Exatamente 1.000: pede a página seguinte para ter certeza de que acabou.
    expect(paginas("ai_usage_logs")).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("ordena pela chave de cada tabela e não exporta o conteúdo bruto das mensagens", async () => {
    await exportar();
    const ordem = Object.fromEntries(estado.consultas.map((c) => [c.tabela, c.ordem]));
    expect(ordem).toMatchObject({
      transactions: "id",
      staff_private: "staff_id",
      service_tax_codes: "service_id",
      transaction_cost_overrides: "transaction_id",
      ai_consents: "user_id",
      ai_messages: "id",
    });
    const mensagens = estado.consultas.find((c) => c.tabela === "ai_messages");
    expect(mensagens?.colunas).toBe("id, conversation_id, role, display_text, created_at");
  });

  it("falha numa página aparece no pacote, em vez de exportar pela metade calado", async () => {
    estado.linhas = { transactions: 1500 };
    estado.erroEm = "transactions:1000";
    const pacote = await exportar();
    expect(pacote.transactions).toEqual({ erro: "falhou a página" });
  });
});
