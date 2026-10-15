import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Painel do Financeiro e termômetro do MEI: o PostgREST devolve no máximo mil
 * linhas por resposta e corta o resto sem erro (max_rows). As somas têm de ler
 * página por página, senão o termômetro subestima a receita do ano.
 */
type Linha = {
  id: string;
  kind: "receita" | "despesa";
  status: string;
  amount_cents: number;
  paid_at: string;
  categories: { name: string } | null;
};

const MAX_ROWS = 1000;

const estado = vi.hoisted(() => ({ linhas: [] as Linha[], pedidos: [] as { de: number; ate: number }[] }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from() {
      const filtros: [keyof Linha, unknown][] = [];
      let ordenado = false;
      let faixa: { de: number; ate: number } | null = null;
      const construtor = {
        select: () => construtor,
        eq(coluna: keyof Linha, valor: unknown) {
          filtros.push([coluna, valor]);
          return construtor;
        },
        gte: () => construtor,
        lte: () => construtor,
        order() {
          ordenado = true;
          return construtor;
        },
        range(de: number, ate: number) {
          faixa = { de, ate };
          return construtor;
        },
        then(resolver: (r: { data: Partial<Linha>[]; error: null }) => unknown) {
          let linhas = estado.linhas.filter((l) => filtros.every(([c, v]) => !(c in l) || l[c] === v));
          if (ordenado) linhas = [...linhas].sort((a, b) => a.id.localeCompare(b.id));
          const de = faixa?.de ?? 0;
          const ate = Math.min(faixa?.ate ?? Number.MAX_SAFE_INTEGER, de + MAX_ROWS - 1);
          estado.pedidos.push({ de, ate });
          return Promise.resolve({ data: linhas.slice(de, ate + 1), error: null }).then(resolver);
        },
      };
      return construtor;
    },
  }),
}));

const { maioresDespesas, resumoDoMes, seisMeses, termometroMEI } = await import("./dados");

function lancamentos(quantidade: number, dados: Partial<Linha>): Linha[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    id: `${dados.kind ?? "receita"}-${String(i).padStart(6, "0")}`,
    kind: "receita",
    status: "pago",
    amount_cents: 10_000,
    paid_at: "2026-10-05",
    categories: null,
    ...dados,
  }));
}

beforeEach(() => {
  estado.linhas = [];
  estado.pedidos = [];
});

describe("termômetro do MEI", () => {
  it("soma todas as receitas do ano, mesmo passando de mil", async () => {
    estado.linhas = lancamentos(2_350, { kind: "receita", amount_cents: 3_500 });

    const termometro = await termometroMEI({ empresaId: "org", ano: 2026, aberturaEm: null });

    expect(termometro.recebidoCents).toBe(2_350 * 3_500);
    expect(estado.pedidos.length).toBe(3);
  });
});

describe("painel do Financeiro", () => {
  it("resumo do mês e maiores despesas leem todas as páginas", async () => {
    estado.linhas = [
      ...lancamentos(1_200, { kind: "receita", amount_cents: 10_000 }),
      ...lancamentos(1_100, { kind: "despesa", amount_cents: 2_000, categories: { name: "Materiais e insumos" } }),
    ];

    expect(await resumoDoMes("org", "2026-10")).toEqual({
      entrouCents: 12_000_000,
      saiuCents: 2_200_000,
      sobrouCents: 9_800_000,
    });
    expect(await maioresDespesas("org", "2026-10")).toEqual([
      { categoria: "Materiais e insumos", valorCents: 2_200_000 },
    ]);
  });

  it("o gráfico de seis meses também", async () => {
    estado.linhas = lancamentos(1_500, { kind: "receita", amount_cents: 10_000, paid_at: "2026-10-05" });

    const meses = await seisMeses("org", "2026-10");

    expect(meses.at(-1)).toMatchObject({ mes: "2026-10", rotulo: "out", entrouCents: 15_000_000, saiuCents: 0 });
  });
});
