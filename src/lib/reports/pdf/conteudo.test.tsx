import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { DocumentoDeRelatorio } from "./documento";
import { montarLivroCaixa } from "../livro-caixa";
import type { LancamentoParaRelatorio } from "../tipos";

/** Lê o texto de dentro do PDF gerado, para provar que o conteúdo chegou lá. */
async function textoDoPdf(arquivo: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const documento = await pdfjs.getDocument({
    data: new Uint8Array(arquivo),
    useSystemFonts: true,
  }).promise;

  let texto = "";
  for (let pagina = 1; pagina <= documento.numPages; pagina += 1) {
    const conteudo = await (await documento.getPage(pagina)).getTextContent();
    texto += conteudo.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .concat(" ");
  }
  return texto.replace(/\s+/g, " ");
}

function lancamento(dados: Partial<LancamentoParaRelatorio>): LancamentoParaRelatorio {
  return {
    id: crypto.randomUUID(),
    tipo: "receita",
    situacao: "pago",
    descricao: "Consulta particular",
    valorCents: 20000,
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
    cliente: "Marina Alves",
    documentoDoCliente: "12345678901",
    tipoDeReceita: "servico",
    notaFiscalEmitida: false,
    reciboSaudeEmitido: false,
    comprovante: null,
    ...dados,
  };
}

describe("conteúdo do PDF", () => {
  it("traz marca, empresa, período, valores e o aviso do Livro-Caixa", async () => {
    const tabela = montarLivroCaixa({
      periodo: "setembro de 2026",
      lancamentos: [
        lancamento({ valorCents: 20000, pagoEm: "2026-09-03" }),
        lancamento({
          tipo: "despesa",
          descricao: "Aluguel do consultório",
          valorCents: 150000,
          dedutivelSugerido: true,
          pagoEm: "2026-09-05",
        }),
      ],
    });

    const arquivo = await renderToBuffer(
      <DocumentoDeRelatorio
        tabela={tabela}
        empresa={{ nome: "Consultório Helena Barbosa", documento: "12345678000199" }}
        geradoEm="30/09/2026 às 18:00"
      />,
    );

    const texto = await textoDoPdf(arquivo);

    expect(texto).toContain("Alicerce");
    expect(texto).toContain("Consultório Helena Barbosa");
    expect(texto).toContain("Livro-Caixa");
    expect(texto).toContain("setembro de 2026");
    expect(texto).toContain("pela data de pagamento");
    expect(texto).toContain("Aluguel do consultório");
    // Valores em reais, com o formato brasileiro.
    expect(texto).toMatch(/R\$\s?200,00/);
    expect(texto).toMatch(/R\$\s?1\.500,00/);
    // Os avisos obrigatórios do relatório.
    expect(texto).toMatch(/limitada ao rendimento do mês/i);
    expect(texto).toMatch(/sugestão do sistema/i);
    expect(texto).toMatch(/não substitui a contabilidade/i);
    // Numeração de página.
    expect(texto).toMatch(/1\/1/);
  }, 60_000);
});
