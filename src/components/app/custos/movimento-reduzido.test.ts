import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md: toda animação respeita prefers-reduced-motion. O spinner da
 * sugestão da IA pode girar por até dois minutos; com "reduzir movimento"
 * ligado no sistema, ele para.
 */
const raiz = join(process.cwd(), "src/components/app");
const arquivos = [
  ...readdirSync(join(raiz, "custos"))
    .filter((nome) => nome.endsWith(".tsx"))
    .map((nome) => join(raiz, "custos", nome)),
  join(raiz, "financeiro/gestao-categorias.tsx"),
  join(raiz, "financeiro/termometro-mei.tsx"),
];

describe("spinners dos custos e das categorias", () => {
  it.each(arquivos)("%s: todo animate-spin para com motion-reduce", (arquivo) => {
    const classes = readFileSync(arquivo, "utf8").match(/className="[^"]*animate-spin[^"]*"/g) ?? [];
    for (const classe of classes) expect(classe).toContain("motion-reduce:animate-none");
  });

  it("a busca enxerga os spinners (o teste não passa vazio)", () => {
    const total = arquivos
      .map((arquivo) => readFileSync(arquivo, "utf8").match(/animate-spin/g)?.length ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(4);
  });
});
