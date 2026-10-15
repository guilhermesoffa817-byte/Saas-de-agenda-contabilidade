import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EquipeDoCliente } from "./equipe-do-cliente";
import type { EquipeParaOContador } from "@/app/(app)/app/equipe/dados";

/**
 * Achado 25: a política e o menu prometem que o contador vê a equipe (nome,
 * função, contrato, remuneração combinada, ausências e pagamentos), mas o
 * portal não mostrava nada. Agora mostra, só leitura e sem dados pessoais.
 */
type Consulta = { tabela: string; colunas?: string; filtros: [string, string, unknown][] };

const estado = vi.hoisted(() => ({ consultas: [] as Consulta[] }));

const LINHAS: Record<string, unknown[]> = {
  staff_members: [
    {
      id: "c-1",
      name: "Juliana Prado Souza",
      job_title: "Cabeleireira",
      contract: "parceria",
      started_on: "2025-01-06",
      ended_on: null,
      professional_id: "p-1",
      base_pay_cents: 0,
      commission_bps: 4000,
      per_service_cents: 0,
      anonymized_at: null,
    },
    {
      id: "c-2",
      name: "Rafael Lima",
      job_title: "Recepcionista",
      contract: "clt",
      started_on: "2024-02-01",
      ended_on: null,
      professional_id: null,
      base_pay_cents: 190_000,
      commission_bps: 0,
      per_service_cents: 0,
      anonymized_at: null,
    },
    {
      id: "c-3",
      name: "Ex-colaborador",
      job_title: null,
      contract: "mei",
      started_on: "2023-05-02",
      ended_on: "2026-08-31",
      professional_id: null,
      base_pay_cents: 0,
      commission_bps: 0,
      per_service_cents: 0,
      anonymized_at: "2026-09-02T12:00:00Z",
    },
    {
      id: "c-4",
      name: "Bianca Rocha",
      job_title: "Manicure",
      contract: "mei",
      started_on: "2026-11-03",
      ended_on: null,
      professional_id: null,
      base_pay_cents: 0,
      commission_bps: 0,
      per_service_cents: 2_500,
      anonymized_at: null,
    },
  ],
  staff_absences: [
    { id: "a-1", staff_id: "c-2", kind: "ferias", starts_on: "2026-09-14", ends_on: "2026-09-23", time_off_id: null },
  ],
  staff_payments: [
    { id: "g-1", staff_id: "c-2", kind: "salario", amount_cents: 175_840, paid_on: "2026-10-05", reference_month: "2026-09-01" },
    { id: "g-2", staff_id: "c-3", kind: "repasse", amount_cents: 60_000, paid_on: "2026-09-10", reference_month: "2026-09-01" },
  ],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabela: string) {
      const consulta: Consulta = { tabela, filtros: [] };
      estado.consultas.push(consulta);
      const b = {
        select(colunas: string) {
          consulta.colunas = colunas;
          return b;
        },
        eq: (c: string, v: unknown) => (consulta.filtros.push(["eq", c, v]), b),
        gte: (c: string, v: unknown) => (consulta.filtros.push(["gte", c, v]), b),
        lte: (c: string, v: unknown) => (consulta.filtros.push(["lte", c, v]), b),
        order: () => b,
        then: (ok: (valor: unknown) => unknown) =>
          Promise.resolve({ data: LINHAS[tabela] ?? [], error: null }).then(ok),
      };
      return b;
    },
  }),
}));

const { carregarEquipeParaOContador } = await import("@/app/(app)/app/equipe/dados");

beforeEach(() => {
  estado.consultas = [];
});

describe("carregarEquipeParaOContador", () => {
  it("nunca lê dados pessoais (staff_private) nem pede colunas deles", async () => {
    await carregarEquipeParaOContador("org-1", "2026-09-01", "2026-09-30");

    expect(estado.consultas.map((c) => c.tabela).sort()).toEqual([
      "staff_absences",
      "staff_members",
      "staff_payments",
    ]);
    for (const consulta of estado.consultas) {
      expect(consulta.colunas).not.toMatch(/document|pix|phone|email|notes/);
      expect(consulta.filtros).toContainEqual(["eq", "organization_id", "org-1"]);
    }
  });

  it("pagamentos pelo mês de referência do período; ausências que tocam o período", async () => {
    await carregarEquipeParaOContador("org-1", "2026-09-01", "2026-09-30");
    const pagamentos = estado.consultas.find((c) => c.tabela === "staff_payments");
    expect(pagamentos?.filtros).toContainEqual(["gte", "reference_month", "2026-09-01"]);
    expect(pagamentos?.filtros).toContainEqual(["lte", "reference_month", "2026-09-01"]);
    const ausencias = estado.consultas.find((c) => c.tabela === "staff_absences");
    expect(ausencias?.filtros).toContainEqual(["lte", "starts_on", "2026-09-30"]);
    expect(ausencias?.filtros).toContainEqual(["gte", "ends_on", "2026-09-01"]);
  });

  it("lista quem trabalhou no período e o ex-colaborador com pagamento nele; não quem começa depois", async () => {
    const equipe = await carregarEquipeParaOContador("org-1", "2026-09-01", "2026-09-30");
    expect(equipe.colaboradores.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
    expect(equipe.pagamentos[0]).toEqual({
      id: "g-1",
      colaboradorId: "c-2",
      tipo: "salario",
      mesDeReferencia: "2026-09",
      valorCents: 175_840,
      pagoEm: "2026-10-05",
    });
  });
});

describe("seção Equipe do portal", () => {
  it("mostra cadastro, combinado, ausências e pagamentos, só leitura", async () => {
    const equipe: EquipeParaOContador = await carregarEquipeParaOContador("org-1", "2026-09-01", "2026-09-30");
    const html = renderToStaticMarkup(<EquipeDoCliente equipe={equipe} periodo="setembro de 2026" />);

    expect(html).toContain("Equipe");
    expect(html).toContain("Juliana Prado Souza");
    expect(html).toContain("Cabeleireira");
    expect(html).toContain("Parceria");
    expect(html).toContain("Cota-parte do profissional 40%");
    expect(html).toContain("06/01/2025");
    expect(html).toContain("Salário R$");
    expect(html).toContain("Férias");
    expect(html).toContain("14/09/2026 a 23/09/2026");
    expect(html).toContain("setembro de 2026");
    expect(html).toMatch(/R\$\s1\.758,40/);
    expect(html).toMatch(/Total pago[\s\S]*R\$\s2\.358,40/);
    expect(html).not.toMatch(/<button|<input|<form/);
  });

  it("sem equipe no período, diz isso", () => {
    const html = renderToStaticMarkup(
      <EquipeDoCliente equipe={{ colaboradores: [], ausencias: [], pagamentos: [] }} periodo="setembro de 2026" />,
    );
    expect(html).toContain("O cliente não tem equipe cadastrada neste período.");
  });

  it("a página do cliente no portal carrega e mostra a seção", () => {
    const pagina = readFileSync("src/app/contador/[empresa]/page.tsx", "utf8");
    expect(pagina).toContain("carregarEquipeParaOContador(empresa.id, de, ate)");
    expect(pagina).toContain("<EquipeDoCliente equipe={equipe}");
  });
});
