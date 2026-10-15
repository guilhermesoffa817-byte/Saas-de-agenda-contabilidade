import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AvisoDaAgenda } from "./aviso-da-agenda";
import type { ColaboradorDaTela } from "./tipos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/equipe",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(app)/app/equipe/acoes", () => ({
  excluirPagamento: vi.fn(),
  registrarPagamento: vi.fn(),
  sugestoesDePagamento: vi.fn(),
}));

const { FormularioPagamento } = await import("./aba-pagamentos");

const ler = (caminho: string) => readFileSync(caminho, "utf8");
const tsxDe = (pasta: string) =>
  readdirSync(pasta)
    .filter((nome) => nome.endsWith(".tsx") && !nome.endsWith(".test.tsx"))
    .map((nome) => join(pasta, nome));

const JULIANA: ColaboradorDaTela = {
  id: "c-1",
  nome: "Juliana Prado Souza",
  cargo: "Cabeleireira",
  contrato: "parceria",
  inicio: "2025-01-06",
  fim: null,
  profissionalId: "p-1",
  fixoCents: 0,
  percentualBps: 4000,
  porAtendimentoCents: 0,
  removido: false,
};

describe("spinners respeitam 'reduzir movimento' (achado 28)", () => {
  const arquivos = [
    ...tsxDe("src/components/app/equipe"),
    ...tsxDe("src/components/app/contador"),
    "src/components/app/financeiro/lista-lancamentos.tsx",
  ];

  it.each(arquivos)("%s", (arquivo) => {
    for (const classe of ler(arquivo).match(/className="[^"]*animate-spin[^"]*"/g) ?? []) {
      expect(classe).toContain("motion-reduce:animate-none");
    }
  });

  it("a busca enxerga os spinners (o teste não passa vazio)", () => {
    const total = arquivos.map((a) => ler(a).match(/animate-spin/g)?.length ?? 0).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(10);
  });
});

describe("mês de referência do pagamento (achados 9 e 29)", () => {
  const html = renderToStaticMarkup(
    <FormularioPagamento
      colaboradores={[JULIANA]}
      colaboradorInicial="c-1"
      sugestoes={{
        "c-1": { fixoCents: 0, percentualCents: 32_000, porAtendimentoCents: 0, totalCents: 32_000 },
      }}
      mes="2026-10"
      hoje="2026-10-05"
      contas={[]}
      mesesFechados={[]}
      aoFechar={() => {}}
    />,
  );

  it("é uma lista de meses, não <input type=month> (texto livre no Safari e no Firefox)", () => {
    expect(html).not.toContain('type="month"');
    expect(html).toMatch(/<button[^>]*id="pagamento-referencia"/);
    expect(html).toContain("outubro de 2026");
    for (const arquivo of tsxDe("src/components/app/equipe")) {
      expect(ler(arquivo)).not.toContain('type="month"');
    }
  });

  it("diz de que mês é a sugestão", () => {
    expect(html).toContain("Valor sugerido com o que entrou em outubro de 2026.");
  });

  it("trocar o mês busca a base do mês novo e refaz o valor", () => {
    const fonte = ler("src/components/app/equipe/aba-pagamentos.tsx");
    expect(fonte).toMatch(/<Select value=\{mesDeReferencia\} onValueChange=\{escolherMes\}>/);
    const corpo = fonte.slice(fonte.indexOf("async function escolherMes"));
    expect(corpo.slice(0, corpo.indexOf("\n  }\n"))).toMatch(/sugestoesDePagamento\(novo\)[\s\S]*setValorCents/);
  });
});

describe("agenda de quem sai (achado 26)", () => {
  it("último dia até hoje: avisa que o perfil será desativado", () => {
    const html = renderToStaticMarkup(<AvisoDaAgenda nome="Juliana Prado" fim="2026-10-05" hoje="2026-10-05" />);
    expect(html).toContain("O perfil de Juliana Prado na agenda será desativado");
  });

  it("último dia no futuro: explica que o dono precisará desativar", () => {
    const html = renderToStaticMarkup(<AvisoDaAgenda nome="Juliana Prado" fim="2026-10-31" hoje="2026-10-05" />);
    expect(html).toContain("continua recebendo agendamentos online");
    expect(html).toContain("31/10/2026");
    expect(html).toContain("Serviços e equipe");
  });

  it("os diálogos de desligar, remover e editar mostram o aviso", () => {
    const colaboradores = ler("src/components/app/equipe/aba-colaboradores.tsx");
    expect(colaboradores).toContain("<AvisoDaAgenda");
    expect(colaboradores).toContain("deixa de receber agendamentos");
    expect(ler("src/components/app/equipe/formulario-colaborador.tsx")).toContain("<AvisoDaAgenda");
  });
});

describe("textos da remoção batem com o que a 0015 faz (achados 4 e 31)", () => {
  const fonte = ler("src/components/app/equipe/aba-colaboradores.tsx").replace(/\s+/g, " ");

  it("o diálogo conta que ausências, bloqueios e a ligação com a agenda também somem", () => {
    expect(fonte).toContain("sem identificar a pessoa");
    expect(fonte).toContain("também na descrição dos lançamentos");
    expect(fonte).toContain("as ausências com os bloqueios na agenda e a ligação com o profissional da agenda");
  });

  it("a situação do ex-colaborador não diz só 'dados pessoais apagados'", () => {
    expect(fonte).toContain("Removido, sem dados pessoais");
  });
});
