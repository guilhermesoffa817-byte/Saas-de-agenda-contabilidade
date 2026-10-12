import { describe, expect, it } from "vitest";

import {
  esquemaAusencia,
  esquemaColaborador,
  esquemaDadosPessoais,
  esquemaDesligamento,
  esquemaDocumento,
  esquemaPagamentoEquipe,
  esquemaPercentual,
} from "./equipe";

const ID = "6f1c2a4e-8b1d-4c3e-9f2a-1b2c3d4e5f60";

function erro(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.success ? null : resultado.error?.issues[0]?.message;
}

describe("colaborador", () => {
  const base = { nome: "Juliana Prado", contrato: "parceria", inicio: "2026-03-02" } as const;

  it("aceita o mínimo e preenche o resto", () => {
    const resultado = esquemaColaborador.parse(base);
    expect(resultado).toMatchObject({
      nome: "Juliana Prado",
      cargo: "",
      contrato: "parceria",
      fixoCents: 0,
      percentual: 0,
      porAtendimentoCents: 0,
      dadosPessoais: { documento: "", pix: "", telefone: "", email: "", observacoes: "" },
    });
  });

  it("converte o percentual digitado em pontos-base", () => {
    expect(esquemaColaborador.parse({ ...base, percentual: "60" }).percentual).toBe(6000);
    expect(esquemaColaborador.parse({ ...base, percentual: "40,5%" }).percentual).toBe(4050);
    expect(erro(esquemaColaborador.safeParse({ ...base, percentual: "120" }))).toMatch(/0 a 100/);
    expect(erro(esquemaPercentual.safeParse("12,345"))).toMatch(/duas casas/);
  });

  it("recusa nome curto, vínculo desconhecido, data inválida e término antes do início", () => {
    expect(erro(esquemaColaborador.safeParse({ ...base, nome: " J " }))).toMatch(/nome/);
    expect(erro(esquemaColaborador.safeParse({ ...base, contrato: "freelancer" }))).toMatch(/vínculo/);
    expect(erro(esquemaColaborador.safeParse({ ...base, inicio: "02/03/2026" }))).toMatch(/início/);
    expect(erro(esquemaColaborador.safeParse({ ...base, fim: "2026-03-01" }))).toMatch(/antes do início/);
    expect(esquemaColaborador.safeParse({ ...base, fim: "" }).success).toBe(true);
    expect(esquemaColaborador.safeParse({ ...base, fim: "2026-03-02" }).success).toBe(true);
  });

  it("dinheiro só em centavos inteiros", () => {
    expect(esquemaColaborador.safeParse({ ...base, fixoCents: 1900.5 }).success).toBe(false);
    expect(esquemaColaborador.safeParse({ ...base, fixoCents: -1 }).success).toBe(false);
    expect(esquemaColaborador.safeParse({ ...base, porAtendimentoCents: 2500 }).success).toBe(true);
  });

  it("profissional da agenda é opcional, mas precisa ser um id", () => {
    expect(esquemaColaborador.safeParse({ ...base, profissionalId: "" }).success).toBe(true);
    expect(esquemaColaborador.safeParse({ ...base, profissionalId: ID }).success).toBe(true);
    expect(esquemaColaborador.safeParse({ ...base, profissionalId: "juliana" }).success).toBe(false);
  });
});

describe("dados pessoais", () => {
  it("CPF e CNPJ ficam só com os dígitos", () => {
    expect(esquemaDocumento.parse("123.456.789-09")).toBe("12345678909");
    expect(esquemaDocumento.parse("12.345.678/0001-95")).toBe("12345678000195");
    expect(esquemaDocumento.parse("")).toBe("");
    expect(erro(esquemaDocumento.safeParse("123.456"))).toMatch(/CPF/);
  });

  it("telefone vira E.164 e e-mail é conferido", () => {
    const dados = esquemaDadosPessoais.parse({
      telefone: "(66) 99876-5432",
      email: "Rafael.Lima@Exemplo.com.br ",
    });
    expect(dados.telefone).toBe("+5566998765432");
    expect(dados.email).toBe("rafael.lima@exemplo.com.br");
    expect(erro(esquemaDadosPessoais.safeParse({ telefone: "9999" }))).toMatch(/DDD/);
    expect(erro(esquemaDadosPessoais.safeParse({ email: "rafael@" }))).toMatch(/e-mail/);
  });

  it("observação tem limite", () => {
    expect(esquemaDadosPessoais.safeParse({ observacoes: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("desligamento, ausência e pagamento", () => {
  it("desligamento pede o último dia", () => {
    expect(esquemaDesligamento.safeParse({ colaboradorId: ID, fim: "2026-10-31" }).success).toBe(true);
    expect(esquemaDesligamento.safeParse({ colaboradorId: ID, fim: "" }).success).toBe(false);
  });

  it("ausência confere tipo e período", () => {
    const ok = { colaboradorId: ID, tipo: "ferias", inicio: "2026-11-03", fim: "2026-11-17" };
    expect(esquemaAusencia.safeParse(ok).success).toBe(true);
    expect(esquemaAusencia.safeParse({ ...ok, fim: "2026-11-03" }).success).toBe(true);
    expect(erro(esquemaAusencia.safeParse({ ...ok, fim: "2026-11-02" }))).toMatch(/antes/);
    expect(esquemaAusencia.safeParse({ ...ok, tipo: "doenca" }).success).toBe(false);
  });

  it("pagamento exige valor positivo em centavos e mês aaaa-mm", () => {
    const ok = {
      colaboradorId: ID,
      tipo: "cota_parte",
      mes: "2026-10",
      valorCents: 274500,
      pagoEm: "2026-11-05",
      contaId: "",
      forma: "pix",
    };
    expect(esquemaPagamentoEquipe.safeParse(ok).success).toBe(true);
    expect(esquemaPagamentoEquipe.safeParse({ ...ok, valorCents: 0 }).success).toBe(false);
    expect(esquemaPagamentoEquipe.safeParse({ ...ok, valorCents: 2745.5 }).success).toBe(false);
    expect(esquemaPagamentoEquipe.safeParse({ ...ok, mes: "2026-13" }).success).toBe(false);
    expect(esquemaPagamentoEquipe.safeParse({ ...ok, forma: "cheque" }).success).toBe(false);
    expect(esquemaPagamentoEquipe.safeParse({ ...ok, contaId: ID, forma: undefined }).success).toBe(true);
  });
});
