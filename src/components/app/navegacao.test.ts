import { describe, expect, it } from "vitest";

import { itensPorPapel } from "./navegacao";

const enderecos = (papel: Parameters<typeof itensPorPapel>[0]) => itensPorPapel(papel).map((i) => i.href);

describe("menu por papel", () => {
  it("o dono vê a equipe perto de Serviços e o assistente depois de Relatórios", () => {
    const menu = enderecos("dono");
    expect(menu).toContain("/app/equipe");
    expect(menu).toContain("/app/assistente");
    expect(menu.indexOf("/app/assistente")).toBe(menu.indexOf("/app/relatorios") + 1);
    expect(Math.abs(menu.indexOf("/app/equipe") - menu.indexOf("/app/servicos"))).toBe(1);
  });

  it("recepção e profissional não veem equipe, assistente nem custos", () => {
    for (const papel of ["recepcao", "profissional"] as const) {
      const menu = enderecos(papel);
      expect(menu, papel).not.toContain("/app/equipe");
      expect(menu, papel).not.toContain("/app/assistente");
      expect(menu.some((href) => href.startsWith("/app/financeiro/custos")), papel).toBe(false);
    }
  });

  it("nenhum endereço se repete no menu", () => {
    for (const papel of ["dono", "recepcao", "profissional"] as const) {
      const menu = enderecos(papel);
      expect(new Set(menu).size, papel).toBe(menu.length);
    }
  });
});
