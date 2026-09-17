import { describe, expect, it } from "vitest";

import { montarContas } from "./contas";
import { gerarCSV, tabelaParaCSV } from "./csv";
import { montarDRE } from "./dre";
import { gerarExportacaoContabil, MODELO_PADRAO } from "./exportacao-contabil";
import { montarLivroCaixa } from "./livro-caixa";
import { montarReceitaSaudePendentes, montarReceitasMEI } from "./receitas-mei";
import { tabelaParaExcel } from "./xlsx";
import type { LancamentoParaRelatorio } from "./tipos";

function lancamento(dados: Partial<LancamentoParaRelatorio>): LancamentoParaRelatorio {
  return {
    id: crypto.randomUUID(),
    tipo: "receita",
    situacao: "pago",
    descricao: "Atendimento",
    valorCents: 10000,
    competencia: "2026-09-10",
    pagoEm: "2026-09-10",
    vencimento: null,
    categoria: "Atendimentos",
    grupo: "operacional",
    dedutivelSugerido: false,
    codigoDaCategoria: null,
    conta: "Caixa",
    codigoDaConta: null,
    formaDePagamento: "pix",
    pagador: "pf",
    cliente: "Maria Souza",
    documentoDoCliente: "12345678901",
    tipoDeReceita: "servico",
    notaFiscalEmitida: false,
    reciboSaudeEmitido: false,
    comprovante: null,
    ...dados,
  };
}

describe("gerarCSV", () => {
  it("usa ponto e vírgula, vírgula decimal e BOM", () => {
    const csv = gerarCSV(["Data", "Valor"], [["05/10/2026", 1234.5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Data;Valor");
    expect(csv).toContain("05/10/2026;1234,50");
    expect(csv).toContain("\r\n");
  });

  it("protege o texto que tem o separador ou aspas", () => {
    const csv = gerarCSV(["Histórico"], [['Aluguel; "setembro"']]);
    expect(csv).toContain('"Aluguel; ""setembro"""');
  });

  it("respeita outro separador quando o contador pede", () => {
    const csv = gerarCSV(["A", "B"], [["x", 10]], { separador: "," });
    expect(csv).toContain("A,B");
    // Com separador vírgula, o número decimal precisa vir entre aspas para o
    // arquivo continuar válido — por isso a tela sugere ponto decimal nesse caso.
    expect(csv).toContain('x,"10,00"');
  });

  it("com separador vírgula e ponto decimal, nada precisa de aspas", () => {
    const csv = gerarCSV(["A", "B"], [["x", 10]], { separador: ",", decimalComVirgula: false });
    expect(csv).toContain("x,10.00");
    expect(csv).not.toContain('"');
  });
});

describe("montarDRE", () => {
  const lancamentos = [
    lancamento({ valorCents: 500000 }),
    lancamento({ valorCents: 100000, tipo: "despesa", categoria: "Aluguel", grupo: "operacional" }),
    lancamento({ valorCents: 30000, tipo: "despesa", categoria: "DAS", grupo: "imposto" }),
    lancamento({ valorCents: 20000, tipo: "despesa", categoria: "Taxa da maquininha", grupo: "financeiro" }),
    lancamento({ valorCents: 200000, tipo: "despesa", categoria: "Retirada", grupo: "retirada" }),
    lancamento({ valorCents: 999999, situacao: "pendente" }),
  ];

  it("separa despesa operacional, imposto, financeiro e retirada do dono", () => {
    const dre = montarDRE({ lancamentos, periodo: "setembro de 2026" });
    const valor = (rotulo: string) =>
      dre.resumo?.find((item) => item.rotulo === rotulo)?.valorCents;

    expect(valor("Receitas")).toBe(500000);
    expect(valor("Despesas operacionais")).toBe(100000);
    expect(valor("Impostos")).toBe(30000);
    expect(valor("Despesas financeiras")).toBe(20000);
    expect(valor("Retiradas do dono")).toBe(200000);
    // A retirada não entra no resultado do negócio.
    expect(valor("Resultado do mês")).toBe(350000);
    expect(valor("Sobrou depois das retiradas")).toBe(150000);
  });

  it("ignora o que ainda não foi pago", () => {
    const dre = montarDRE({ lancamentos, periodo: "setembro de 2026" });
    expect(dre.resumo?.find((item) => item.rotulo === "Receitas")?.valorCents).toBe(500000);
  });

  it("avisa quando o mês fecha no negativo", () => {
    const dre = montarDRE({
      lancamentos: [
        lancamento({ valorCents: 10000 }),
        lancamento({ valorCents: 50000, tipo: "despesa", grupo: "operacional" }),
      ],
      periodo: "setembro de 2026",
    });
    expect(dre.avisos?.[0]).toMatch(/negativo/i);
  });
});

describe("montarLivroCaixa", () => {
  it("separa receita de pessoa física e de empresa, pela data de pagamento", () => {
    const tabela = montarLivroCaixa({
      lancamentos: [
        lancamento({ valorCents: 20000, pagador: "pf", pagoEm: "2026-09-03" }),
        lancamento({ valorCents: 80000, pagador: "pj", pagoEm: "2026-09-01" }),
        lancamento({
          valorCents: 15000,
          tipo: "despesa",
          dedutivelSugerido: true,
          pagoEm: "2026-09-02",
        }),
      ],
      periodo: "setembro de 2026",
    });

    expect(tabela.totais).toEqual({ receitaPF: 20000, receitaPJ: 80000, despesa: 15000 });
    // Ordenado pela data de pagamento.
    expect(tabela.linhas.map((linha) => linha.data)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(tabela.linhas[1].dedutivel).toBe("Sim (sugestão)");
  });

  it("avisa quando a dedução passa da receita do período", () => {
    const tabela = montarLivroCaixa({
      lancamentos: [
        lancamento({ valorCents: 50000 }),
        lancamento({ valorCents: 90000, tipo: "despesa", dedutivelSugerido: true }),
      ],
      periodo: "setembro de 2026",
    });

    expect(tabela.avisos?.[0]).toMatch(/limitada ao rendimento do mês/i);
  });

  it("sempre lembra que a dedutibilidade é sugestão", () => {
    const tabela = montarLivroCaixa({ lancamentos: [lancamento({})], periodo: "setembro" });
    expect(tabela.avisos?.join(" ")).toMatch(/sugestão do sistema/i);
  });
});

describe("montarReceitasMEI", () => {
  it("separa serviço, revenda e industrializado, com e sem nota", () => {
    const tabela = montarReceitasMEI({
      ano: 2026,
      lancamentos: [
        lancamento({ valorCents: 100000, tipoDeReceita: "servico", notaFiscalEmitida: true, pagoEm: "2026-01-10" }),
        lancamento({ valorCents: 50000, tipoDeReceita: "servico", notaFiscalEmitida: false, pagoEm: "2026-01-20" }),
        lancamento({ valorCents: 25000, tipoDeReceita: "revenda", notaFiscalEmitida: true, pagoEm: "2026-02-05" }),
        lancamento({ valorCents: 10000, tipoDeReceita: "industrializado", notaFiscalEmitida: false, pagoEm: "2026-03-05" }),
        lancamento({ valorCents: 77000, tipo: "despesa", pagoEm: "2026-01-15" }),
      ],
    });

    expect(tabela.linhas).toHaveLength(12);
    expect(tabela.linhas[0]).toMatchObject({
      mes: "janeiro",
      servicoComNota: 100000,
      servicoSemNota: 50000,
      total: 150000,
    });
    expect(tabela.linhas[1]).toMatchObject({ mes: "fevereiro", revendaComNota: 25000, total: 25000 });
    expect(tabela.linhas[2]).toMatchObject({ industrializadoSemNota: 10000, total: 10000 });
    expect(tabela.totais?.total).toBe(185000);
  });
});

describe("montarReceitaSaudePendentes", () => {
  it("lista só recebimento de pessoa física sem recibo", () => {
    const tabela = montarReceitaSaudePendentes({
      periodo: "setembro de 2026",
      lancamentos: [
        lancamento({ cliente: "Paciente PF", pagador: "pf", reciboSaudeEmitido: false }),
        lancamento({ cliente: "Já emitido", pagador: "pf", reciboSaudeEmitido: true }),
        lancamento({ cliente: "Empresa", pagador: "pj", reciboSaudeEmitido: false }),
        lancamento({ cliente: "Ainda não pago", situacao: "pendente" }),
      ],
    });

    expect(tabela.linhas.map((linha) => linha.paciente)).toEqual(["Paciente PF"]);
    expect(tabela.avisos?.join(" ")).toMatch(/não oferece integração/i);
  });
});

describe("montarContas", () => {
  it("marca atrasado, soma a previsão e respeita a janela de dias", () => {
    const tabela = montarContas({
      hoje: "2026-09-15",
      dias: 30,
      lancamentos: [
        lancamento({ situacao: "pendente", tipo: "receita", valorCents: 30000, vencimento: "2026-09-10" }),
        lancamento({ situacao: "pendente", tipo: "despesa", valorCents: 20000, vencimento: "2026-09-20" }),
        lancamento({ situacao: "pendente", tipo: "despesa", valorCents: 90000, vencimento: "2026-12-01" }),
        lancamento({ situacao: "pago", tipo: "receita", valorCents: 70000, vencimento: "2026-09-18" }),
      ],
    });

    expect(tabela.linhas).toHaveLength(2);
    expect(tabela.linhas[0].situacao).toBe("Atrasado");
    expect(tabela.totais).toEqual({ aReceber: 30000, aPagar: 20000 });
    expect(tabela.resumo?.find((item) => item.rotulo === "Previsão de caixa")?.valorCents).toBe(10000);
  });
});

describe("gerarExportacaoContabil", () => {
  const lancamentos = [
    lancamento({
      descricao: "Consulta particular",
      valorCents: 20000,
      pagoEm: "2026-09-05",
      codigoDaCategoria: "3.1.01",
      codigoDaConta: "1.1.01",
    }),
    lancamento({
      tipo: "despesa",
      descricao: "Aluguel",
      valorCents: 150000,
      pagoEm: "2026-09-02",
      codigoDaCategoria: "4.1.05",
      codigoDaConta: "1.1.01",
    }),
  ];

  it("inverte débito e crédito entre receita e despesa", () => {
    const csv = gerarExportacaoContabil({ lancamentos });
    const linhas = csv.replace("﻿", "").split("\r\n");

    expect(linhas[0]).toBe("Data;Histórico;Valor;Conta débito;Conta crédito");
    // A despesa vem primeiro (02/09) e debita a categoria.
    expect(linhas[1]).toBe("02/09/2026;Aluguel;1500,00;4.1.05;1.1.01");
    expect(linhas[2]).toBe("05/09/2026;Consulta particular;200,00;1.1.01;3.1.01");
  });

  it("deixa a célula vazia quando o contador ainda não cadastrou o código", () => {
    const csv = gerarExportacaoContabil({
      lancamentos: [lancamento({ pagoEm: "2026-09-05", codigoDaCategoria: null, codigoDaConta: null })],
    });
    expect(csv.replace("﻿", "").split("\r\n")[1]).toBe("05/09/2026;Atendimento;100,00;;");
  });

  it("obedece a ordem das colunas, o separador e o formato de data escolhidos", () => {
    const csv = gerarExportacaoContabil({
      lancamentos,
      modelo: {
        ...MODELO_PADRAO,
        colunas: ["conta_debito", "valor", "data", "categoria"],
        separador: "|",
        formatoDeData: "ddMMyyyy",
        decimalComVirgula: false,
      },
    });
    const linhas = csv.replace("﻿", "").split("\r\n");

    expect(linhas[0]).toBe("Conta débito|Valor|Data|Categoria");
    expect(linhas[1]).toBe("4.1.05|1500.00|02092026|Atendimentos");
  });
});

describe("tabelaParaCSV e tabelaParaExcel", () => {
  const tabela = montarLivroCaixa({
    lancamentos: [lancamento({ valorCents: 12345, pagoEm: "2026-09-04" })],
    periodo: "setembro de 2026",
  });

  it("o CSV do relatório traz cabeçalho, valores em reais e linha de total", () => {
    const csv = tabelaParaCSV(tabela).replace("﻿", "");
    const linhas = csv.split("\r\n");

    expect(linhas[0]).toContain("Receita de PF");
    expect(linhas[1]).toContain("123,45");
    expect(linhas[linhas.length - 1].startsWith("TOTAL;")).toBe(true);
  });

  it("o Excel sai como arquivo xlsx de verdade", async () => {
    const arquivo = await tabelaParaExcel(tabela);
    // xlsx é um zip: começa com "PK".
    expect(arquivo.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(arquivo.length).toBeGreaterThan(2000);
  });
});
