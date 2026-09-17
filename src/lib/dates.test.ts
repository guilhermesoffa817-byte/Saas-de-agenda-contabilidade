import { describe, expect, it } from "vitest";

import { diaLocalISO, formatarData, formatarHora, instanteNaEmpresa, jaPassou } from "./dates";

describe("datas no fuso da empresa", () => {
  const instante = "2026-10-05T02:30:00Z"; // 04/10 às 23:30 em Cuiabá, 05/10 às 00:30 em Brasília

  it("mostra a data no fuso de cada empresa", () => {
    expect(formatarData(instante, "America/Sao_Paulo")).toBe("04/10/2026");
    expect(formatarData(instante, "America/Cuiaba")).toBe("04/10/2026");
    expect(formatarData("2026-10-05T12:00:00Z", "America/Sao_Paulo")).toBe("05/10/2026");
  });

  it("mostra a hora no fuso de cada empresa", () => {
    expect(formatarHora("2026-10-05T12:00:00Z", "America/Sao_Paulo")).toBe("09:00");
    expect(formatarHora("2026-10-05T12:00:00Z", "America/Cuiaba")).toBe("08:00");
    expect(formatarHora("2026-10-05T12:00:00Z", "America/Rio_Branco")).toBe("07:00");
  });

  it("monta o instante certo a partir do dia e da hora locais", () => {
    // Comparamos o instante em si (epoch): 09:00 em Brasília é 12:00 UTC.
    const emSaoPaulo = instanteNaEmpresa("2026-10-05", "09:00", "America/Sao_Paulo");
    expect(emSaoPaulo.getTime()).toBe(Date.UTC(2026, 9, 5, 12, 0, 0));

    const emManaus = instanteNaEmpresa("2026-10-05", "09:00", "America/Manaus");
    expect(emManaus.getTime()).toBe(Date.UTC(2026, 9, 5, 13, 0, 0));
  });

  it("ida e volta entre dia local e instante não muda o dia", () => {
    const dia = "2026-01-15";
    const instanteLocal = instanteNaEmpresa(dia, "23:30", "America/Cuiaba");
    expect(diaLocalISO(instanteLocal, "America/Cuiaba")).toBe(dia);
  });

  it("reconhece prazo vencido", () => {
    expect(jaPassou("2020-01-01T00:00:00Z")).toBe(true);
    expect(jaPassou("2999-01-01T00:00:00Z")).toBe(false);
  });
});
