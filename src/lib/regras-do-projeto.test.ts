import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * As regras invioláveis do CLAUDE.md, viradas em teste — a parte que vive no
 * código-fonte. A do banco está em `tests/db/regras-invioláveis.test.ts`.
 *
 * Regra escrita que ninguém verifica é regra que se perde na terceira pressa.
 */

/** Lista arquivos versionados que casam com o padrão, direto do git. */
function arquivos(...padroes: string[]) {
  const saida = execFileSync("git", ["ls-files", ...padroes], { encoding: "utf8" });
  return saida.split("\n").filter(Boolean);
}

function ler(caminho: string) {
  return readFileSync(caminho, "utf8");
}

describe("a chave secreta nunca vaza para o navegador", () => {
  const fontes = arquivos("src/**/*.ts", "src/**/*.tsx");

  it("SUPABASE_SECRET_KEY só aparece em arquivo com import \"server-only\"", () => {
    const vazando = fontes.filter((caminho) => {
      const texto = ler(caminho);
      if (!texto.includes("SUPABASE_SECRET_KEY")) return false;
      // O aviso de configuração só cita o nome da variável num texto de ajuda.
      if (caminho.endsWith("aviso-configuracao.tsx")) return false;
      return !texto.includes('import "server-only"');
    });

    expect(vazando).toEqual([]);
  });

  it("nenhuma chave secreta ganha o prefixo NEXT_PUBLIC", () => {
    const errados = fontes
      .concat(arquivos(".env.example"))
      .filter((caminho) => /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE)/.test(ler(caminho)));

    expect(errados).toEqual([]);
  });

  it("os clientes com chave secreta declaram server-only", () => {
    for (const caminho of ["src/lib/supabase/admin.ts", "src/lib/asaas.ts", "src/lib/nfse/index.ts"]) {
      expect(ler(caminho), caminho).toContain('import "server-only"');
    }
  });
});

describe("Supabase só pelo caminho oficial", () => {
  it("ninguém usa o pacote antigo de auth-helpers", () => {
    // Este próprio arquivo cita o nome do pacote proibido: fica de fora da busca.
    const usando = arquivos("src/**/*.ts", "src/**/*.tsx", "package.json")
      .filter((caminho) => caminho !== "src/lib/regras-do-projeto.test.ts")
      .filter((caminho) => ler(caminho).includes("@supabase/auth-helpers"));

    expect(usando).toEqual([]);
  });

  it("os cookies passam por getAll e setAll, e não pelos métodos avulsos", () => {
    for (const caminho of ["src/lib/supabase/server.ts", "src/proxy.ts"]) {
      const texto = ler(caminho);
      expect(texto, caminho).toContain("getAll");
      expect(texto, caminho).toContain("setAll");
    }
  });
});

describe("dinheiro é centavo inteiro", () => {
  const fontes = arquivos("src/**/*.ts", "src/**/*.tsx").filter(
    (caminho) => !caminho.includes(".test."),
  );

  it("dividir por 100 só acontece na borda, em lugar conhecido", () => {
    // A regra é não fazer conta de dinheiro em float. Converter centavos para
    // reais na saída é outra coisa e é inevitável: planilha, PDF, payload do Pix
    // e API de cobrança pedem número decimal. Cada lugar desses está listado
    // aqui de propósito — arquivo novo que dividir por 100 quebra este teste e
    // obriga a decidir se é borda mesmo.
    const bordas = [
      "src/lib/money.ts", //                        formata para a tela
      "src/lib/asaas.ts", //                        API de cobrança
      "src/lib/nfse/tipos.ts", //                   API da nota fiscal
      "src/lib/pix.ts", //                          payload do Pix copia e cola
      "src/lib/reports/xlsx.ts", //                 célula de planilha
      "src/lib/reports/exportacao-contabil.ts", //  coluna do arquivo do contador
      "src/lib/reports/pdf/documento.tsx", //       texto do PDF
      "src/components/app/financeiro/grafico-seis-meses.tsx", // eixo do gráfico
      "src/app/(marketing)/page.tsx", //            preço no JSON-LD
    ];

    const suspeitos = fontes
      .filter((caminho) => !bordas.includes(caminho))
      .filter((caminho) => /\w*[Cc]ents\s*\/\s*100|\/\s*100\s*\)?\s*\.toFixed/.test(ler(caminho)));

    expect(suspeitos).toEqual([]);
  });

  it("nenhuma soma de dinheiro acontece depois de virar reais", () => {
    // Somar valor já dividido por 100 é o erro clássico: dois centavos somem na
    // arredondagem e o fechamento não bate com o extrato.
    const somandoFloat = fontes.filter((caminho) =>
      /\/\s*100[^;\n]*[+\-]\s*\w+\s*\/\s*100/.test(ler(caminho)),
    );

    expect(somandoFloat).toEqual([]);
  });

  it("a formatação de dinheiro é sempre pt-BR/BRL", () => {
    const texto = ler("src/lib/money.ts");
    expect(texto).toContain("pt-BR");
    expect(texto).toContain("BRL");
  });
});

describe("valores legais ficam num lugar só, com fonte e data", () => {
  const constantes = ler("src/lib/fiscal/constantes.ts");

  it("cada constante traz a fonte e a data da pesquisa", () => {
    expect(constantes).toMatch(/fonte/i);
    expect(constantes).toMatch(/20\d{2}/);
  });

  it("nenhum outro arquivo repete o teto do MEI", () => {
    const tetoNoArquivo = constantes.match(/81[._]?000/);
    expect(tetoNoArquivo, "o teto do MEI precisa estar em constantes.ts").not.toBeNull();

    const repetindo = arquivos("src/**/*.ts", "src/**/*.tsx")
      .filter((caminho) => caminho !== "src/lib/fiscal/constantes.ts")
      .filter((caminho) => !caminho.includes(".test."))
      .filter((caminho) => /\b81[._]?000\b/.test(ler(caminho)));

    expect(repetindo).toEqual([]);
  });
});

describe("interface em português, sem enchimento", () => {
  const telas = arquivos("src/app/**/*.tsx", "src/components/**/*.tsx");

  it("nenhum lorem ipsum ficou para trás", () => {
    const com = telas.filter((caminho) => /lorem ipsum/i.test(ler(caminho)));
    expect(com).toEqual([]);
  });

  it("nenhum texto de interface em inglês nos lugares clássicos", () => {
    const suspeitos = telas.filter((caminho) =>
      />\s*(Loading|Submit|Cancel|Save|Delete|Search|Settings|Sign in|Sign up)\s*</.test(
        ler(caminho),
      ),
    );
    expect(suspeitos).toEqual([]);
  });

  it("o idioma da página é pt-BR", () => {
    expect(ler("src/app/layout.tsx")).toContain('lang="pt-BR"');
  });
});

describe("design: só os tokens, e movimento com freio", () => {
  const estilos = arquivos("src/app/**/*.tsx", "src/components/**/*.tsx", "src/app/globals.css");

  it("nenhum gradiente roxo ou azul decorativo", () => {
    const proibidos = estilos.filter((caminho) =>
      /(from|via|to)-(purple|violet|indigo|blue|fuchsia)-\d{2,3}/.test(ler(caminho)),
    );
    expect(proibidos).toEqual([]);
  });

  it("nenhuma foto de banco de imagens", () => {
    const bancos = estilos.filter((caminho) =>
      /(unsplash|pexels|shutterstock|istockphoto|gettyimages)\.com/i.test(ler(caminho)),
    );
    expect(bancos).toEqual([]);
  });

  it("toda animação da página de vendas respeita prefers-reduced-motion", () => {
    const css = ler("src/app/globals.css");
    // Cada bloco de animação precisa ter o seu contraponto de movimento reduzido.
    const animacoes = (css.match(/@keyframes/g) ?? []).length;
    const freios = (css.match(/prefers-reduced-motion/g) ?? []).length;
    expect(animacoes).toBeGreaterThan(0);
    expect(freios).toBeGreaterThanOrEqual(animacoes);

    for (const caminho of [
      "src/components/marketing/reveal.tsx",
      "src/components/marketing/stat-counter.tsx",
      "src/components/marketing/hero-mockup.tsx",
      "src/components/marketing/smooth-scroll.tsx",
      "src/components/marketing/tour-produto.tsx",
    ]) {
      expect(ler(caminho), caminho).toMatch(/prefers-reduced-motion|useReducedMotion/);
    }
  });
});

describe("nada que o produto não faz é prometido", () => {
  const marketing = arquivos("src/components/marketing/**/*.tsx", "src/app/(marketing)/**/*.tsx");

  it("nenhum texto diz que substitui o contador ou calcula imposto", () => {
    const promessas =
      /substitui o (seu )?contador\b(?! *[,.]? *(não|nao))|calcula (os )?impostos? por você|emitimos o recibo do receita saúde/i;

    const errados = marketing.filter((caminho) => {
      const texto = ler(caminho);
      // "não substitui o contador" é o que a gente quer dizer — e é o contrário.
      const semNegativa = texto.replace(/não substitui o (seu )?contador/gi, "");
      return promessas.test(semNegativa);
    });

    expect(errados).toEqual([]);
  });

  it("o aviso de que não substitui o contador está no rodapé", () => {
    expect(ler("src/components/marketing/rodape.tsx")).toMatch(/não substitui o contador/i);
  });
});
