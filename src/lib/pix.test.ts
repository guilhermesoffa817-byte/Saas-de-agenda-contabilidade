import { describe, expect, it } from "vitest";

import { crc16, pixCopiaECola } from "./pix";

/** Lê um BR Code campo por campo (id + tamanho + valor), sem usar o código que gerou. */
function lerCampos(payload: string) {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length - 4) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return campos;
}

describe("crc16", () => {
  it("é o CRC-16/CCITT-FALSE, que é o exigido no BR Code", () => {
    // Vetor de teste padrão do algoritmo: "123456789" -> 0x29B1
    expect(crc16("123456789")).toBe("29B1");
  });

  it("devolve sempre 4 caracteres em maiúscula", () => {
    for (const texto of ["a", "pix", "00020126", ""]) {
      expect(crc16(texto)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe("pixCopiaECola", () => {
  const base = { chave: "12345678901", nome: "Studio Ana Ribeiro", cidade: "Cuiaba" };

  it("monta o BR Code com os campos obrigatórios", () => {
    const payload = pixCopiaECola(base);
    const campos = lerCampos(payload);

    expect(payload.startsWith("000201")).toBe(true);
    expect(campos["26"]).toContain("br.gov.bcb.pix");
    expect(campos["26"]).toContain(base.chave);
    expect(campos["53"]).toBe("986"); // real brasileiro
    expect(campos["58"]).toBe("BR");
    expect(campos["59"]).toBe("Studio Ana Ribeiro");
    expect(campos["60"]).toBe("Cuiaba");
    expect(campos["62"]).toBe("0503***"); // txid livre
  });

  it("fecha com o CRC calculado sobre tudo, inclusive o '6304'", () => {
    const payload = pixCopiaECola(base);
    const semCrc = payload.slice(0, -4);

    expect(semCrc.endsWith("6304")).toBe(true);
    expect(payload.slice(-4)).toBe(crc16(semCrc));
    expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it("inclui o valor com duas casas quando informado", () => {
    const campos = lerCampos(pixCopiaECola({ ...base, valorCents: 12990 }));
    expect(campos["54"]).toBe("129.90");
  });

  it("omite o valor quando o cliente escolhe quanto pagar", () => {
    const campos = lerCampos(pixCopiaECola(base));
    expect(campos["54"]).toBeUndefined();
  });

  it("tira acento e respeita o limite de tamanho do nome e da cidade", () => {
    const campos = lerCampos(
      pixCopiaECola({
        ...base,
        nome: "Clínica São José de Odontologia Avançada",
        cidade: "São José do Rio Preto",
      }),
    );

    expect(campos["59"]).toBe("Clinica Sao Jose de Odont");
    expect(campos["59"].length).toBeLessThanOrEqual(25);
    expect(campos["60"]).toBe("Sao Jose do Rio");
    expect(campos["60"].length).toBeLessThanOrEqual(15);
  });

  it("limpa o txid e cai no padrão quando ele fica vazio", () => {
    expect(lerCampos(pixCopiaECola({ ...base, txid: "Atend #12/2026" }))["62"]).toBe("0511Atend122026");
    expect(lerCampos(pixCopiaECola({ ...base, txid: "!!!" }))["62"]).toBe("0503***");
  });

  it("aceita chave de e-mail, telefone e aleatória", () => {
    for (const chave of [
      "ana@studio.com.br",
      "+5566999999999",
      "123e4567-e89b-12d3-a456-426614174000",
    ]) {
      const campos = lerCampos(pixCopiaECola({ ...base, chave }));
      expect(campos["26"]).toContain(chave);
      // o campo 26 guarda "br.gov.bcb.pix" (18 com id e tamanho) mais a chave (4 + tamanho)
      expect(campos["26"].length).toBe(22 + chave.length);
    }
  });
});
