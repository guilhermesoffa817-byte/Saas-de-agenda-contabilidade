import { describe, expect, it } from "vitest";

import { dobrarLinha, escaparTexto, montarICal, paraInstanteICal } from "./ical";

describe("instante do iCal", () => {
  it("vai para UTC no formato compacto", () => {
    expect(paraInstanteICal("2026-10-05T14:30:00.000Z")).toBe("20261005T143000Z");
  });

  it("converte um horário com fuso para UTC", () => {
    // 11:30 em Cuiabá (UTC-4) é 15:30 em UTC.
    expect(paraInstanteICal("2026-10-05T11:30:00-04:00")).toBe("20261005T153000Z");
  });
});

describe("escape do texto", () => {
  it("escapa barra, ponto e vírgula, vírgula e quebra de linha, nessa ordem", () => {
    expect(escaparTexto("a\\b;c,d\ne")).toBe("a\\\\b\;c\\,d\\ne");
  });

  it("nome de serviço com vírgula não quebra o arquivo", () => {
    expect(escaparTexto("Escova, hidratação e corte")).toBe("Escova\\, hidratação e corte");
  });
});

describe("dobra de linha", () => {
  it("linha curta fica como está", () => {
    expect(dobrarLinha("SUMMARY:Corte")).toBe("SUMMARY:Corte");
  });

  it("linha longa dobra com espaço no começo da continuação", () => {
    const dobrada = dobrarLinha("SUMMARY:" + "a".repeat(200));
    const partes = dobrada.split("\r\n");
    expect(partes.length).toBeGreaterThan(1);
    expect(Buffer.from(partes[0], "utf8").length).toBeLessThanOrEqual(75);
    for (const parte of partes.slice(1)) {
      expect(parte.startsWith(" ")).toBe(true);
      expect(Buffer.from(parte, "utf8").length).toBeLessThanOrEqual(75);
    }
    expect(dobrada.replace(/\r\n /g, "")).toBe("SUMMARY:" + "a".repeat(200));
  });

  it("não corta um caractere acentuado no meio", () => {
    const dobrada = dobrarLinha("SUMMARY:" + "ã".repeat(80));
    expect(dobrada.replace(/\r\n /g, "")).toBe("SUMMARY:" + "ã".repeat(80));
    for (const parte of dobrada.split("\r\n")) {
      expect(Buffer.from(parte, "utf8").length).toBeLessThanOrEqual(75);
    }
  });
});

describe("arquivo .ics", () => {
  const ics = montarICal({
    nomeDaAgenda: "Ana Ribeiro · Studio Ana Ribeiro",
    dominio: "alicerce.com.br",
    agora: new Date("2026-09-18T12:00:00Z"),
    eventos: [
      {
        id: "abc-123",
        inicio: "2026-10-05T11:30:00-04:00",
        fim: "2026-10-05T13:00:00-04:00",
        titulo: "Escova + hidratação — Marina Alves",
        descricao: "Cliente: Marina Alves\nTelefone: +55 65 99999-0001",
        local: "Studio Ana Ribeiro",
      },
      {
        id: "def-456",
        inicio: "2026-10-06T14:00:00-04:00",
        fim: "2026-10-06T15:00:00-04:00",
        titulo: "Corte feminino — Juliana Prado",
        cancelado: true,
      },
    ],
  });

  it("abre e fecha o calendário, com CRLF em toda linha", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
    // Nenhuma quebra de linha solta: toda \n vem depois de \r.
    expect(ics.split("\n").every((parte, indice, todas) =>
      indice === todas.length - 1 ? parte === "" : parte.endsWith("\r"),
    )).toBe(true);
  });

  it("traz um VEVENT por atendimento, com id estável", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:abc-123@alicerce.com.br");
    expect(ics).toContain("UID:def-456@alicerce.com.br");
  });

  it("grava os horários em UTC e marca o cancelado", () => {
    expect(ics).toContain("DTSTART:20261005T153000Z");
    expect(ics).toContain("DTEND:20261005T170000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("diz ao aplicativo de quanto em quanto tempo reler", () => {
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M");
    expect(ics).toContain("X-PUBLISHED-TTL:PT15M");
  });

  it("a quebra de linha da descrição vira \\n, e não quebra de verdade", () => {
    expect(ics).toContain("Cliente: Marina Alves\\nTelefone");
  });

  it("agenda sem atendimento ainda é um calendário válido", () => {
    const vazio = montarICal({ nomeDaAgenda: "Ana", dominio: "alicerce.com.br", eventos: [] });
    expect(vazio).toContain("BEGIN:VCALENDAR");
    expect(vazio).toContain("END:VCALENDAR");
    expect(vazio).not.toContain("BEGIN:VEVENT");
  });
});
