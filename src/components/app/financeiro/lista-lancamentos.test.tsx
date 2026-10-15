import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LinhaDeLancamento } from "./lista-lancamentos";

/**
 * Achado 34: lançamento ligado a um pagamento da equipe não oferece "Editar"
 * no Financeiro (o valor mudaria só de um lado); a linha leva para a Equipe.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/financeiro/lancamentos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(app)/app/financeiro/acoes", () => ({
  darBaixa: vi.fn(),
  excluirLancamento: vi.fn(),
  linkDoComprovante: vi.fn(),
  salvarLancamento: vi.fn(),
}));
vi.mock("@/app/(app)/app/financeiro/acoes-nota", () => ({ emitirNotaFiscal: vi.fn() }));

const { ListaDeLancamentos } = await import("./lista-lancamentos");

function linha(parcial: Partial<LinhaDeLancamento>): LinhaDeLancamento {
  return {
    id: "l-1",
    tipo: "despesa",
    situacao: "pago",
    descricao: "Aluguel do espaço",
    valorCents: 250_000,
    competencia: "2026-09-05",
    vencimento: null,
    pagoEm: "2026-09-05",
    formaDePagamento: "pix",
    categoria: "Aluguel do espaço",
    categoriaId: null,
    conta: null,
    contaId: null,
    comprovante: null,
    doAtendimento: false,
    notaFiscalEmitida: false,
    ...parcial,
  };
}

function renderizar(lancamentos: LinhaDeLancamento[], mesFechado = false) {
  return renderToStaticMarkup(
    <ListaDeLancamentos
      empresaId="org-1"
      fuso="America/Sao_Paulo"
      lancamentos={lancamentos}
      categorias={[]}
      contas={[]}
      filtros={{}}
      mesFechado={mesFechado}
    />,
  );
}

describe("pagamento da equipe na lista do Financeiro", () => {
  const html = renderizar([
    linha({}),
    linha({
      id: "l-2",
      descricao: "Cota-parte — Juliana S.",
      valorCents: 480_000,
      mesDoPagamentoDaEquipe: "2026-09",
    }),
  ]);

  it("não tem Editar nem Excluir; aponta a tela Equipe no mês de referência", () => {
    expect(html).not.toContain('aria-label="Editar Cota-parte — Juliana S."');
    expect(html).not.toContain('aria-label="Excluir Cota-parte — Juliana S."');
    expect(html).toContain("Pagamento da equipe: altere pela tela Equipe");
    expect(html).toContain('href="/app/equipe?mes=2026-09&amp;aba=pagamentos"');
  });

  it("os outros lançamentos continuam editáveis", () => {
    expect(html).toContain('aria-label="Editar Aluguel do espaço"');
    expect(html).toContain('aria-label="Excluir Aluguel do espaço"');
  });
});
