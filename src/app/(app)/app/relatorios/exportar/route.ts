import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NextResponse, type NextRequest } from "next/server";

import { carregarLancamentosParaRelatorio, carregarModeloDeExportacao } from "../dados";
import { tabelaParaCSV } from "@/lib/reports/csv";
import { gerarExportacaoContabil, MODELO_PADRAO, type ChaveDeColuna } from "@/lib/reports/exportacao-contabil";
import {
  filtroDeData,
  montarRelatorio,
  nomeDoArquivo,
  type TipoDeRelatorio,
} from "@/lib/reports";
import { tabelaParaPDF } from "@/lib/reports/pdf/gerar";
import { tabelaParaExcel } from "@/lib/reports/xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

const TIPOS: (TipoDeRelatorio | "exportacao-contabil")[] = [
  "resumo",
  "livro-caixa",
  "receitas-mei",
  "receita-saude",
  "contas",
  "exportacao-contabil",
];

const DIA = /^\d{4}-\d{2}-\d{2}$/;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

/**
 * Baixa de relatório: /app/relatorios/exportar?tipo=resumo&formato=pdf&de=…&ate=…
 * A empresa vem da sessão, nunca da URL, e o contador também pode baixar.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tipo = searchParams.get("tipo") ?? "resumo";
  const formato = searchParams.get("formato") ?? "pdf";
  const de = searchParams.get("de") ?? "";
  const ate = searchParams.get("ate") ?? "";
  const empresaPedida = searchParams.get("empresa");

  if (!TIPOS.includes(tipo as TipoDeRelatorio) || !MIME[formato]) {
    return NextResponse.json({ erro: "Relatório ou formato desconhecido." }, { status: 400 });
  }
  if (!DIA.test(de) || !DIA.test(ate) || de > ate) {
    return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  }

  const { vinculo, vinculos } = await empresaAtual();
  // O contador escolhe a empresa pela lista do portal dele.
  const escolhido = empresaPedida
    ? vinculos.find((item) => item.empresa.id === empresaPedida)
    : vinculo;

  if (!escolhido) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  if (escolhido.papel !== "dono" && escolhido.papel !== "contador") {
    return NextResponse.json({ erro: "Sem permissão para este relatório." }, { status: 403 });
  }

  const empresa = escolhido.empresa;
  const lancamentos = await carregarLancamentosParaRelatorio({
    empresaId: empresa.id,
    de,
    ate,
    por: tipo === "exportacao-contabil" ? "pagamento" : filtroDeData(tipo as TipoDeRelatorio),
  });

  const arquivo = nomeDoArquivo({
    tipo: tipo as TipoDeRelatorio,
    slug: empresa.slug,
    de,
    ate,
    extensao: formato,
  });

  // Exportação para o sistema do contador: só CSV, no leiaute que ele configurou.
  if (tipo === "exportacao-contabil") {
    const modelo = await carregarModeloDeExportacao(empresa.id);
    const csv = gerarExportacaoContabil({
      lancamentos,
      modelo: modelo
        ? {
            colunas: modelo.columns as ChaveDeColuna[],
            separador: modelo.separator,
            formatoDeData: modelo.date_format as "dd/MM/yyyy",
            decimalComVirgula: modelo.decimal_comma,
          }
        : MODELO_PADRAO,
    });

    await registrarNaAuditoria(empresa.id, `exportacao.contabil`, { de, ate, formato: "csv" });

    return new NextResponse(csv, {
      headers: {
        "content-type": MIME.csv,
        "content-disposition": `attachment; filename="${arquivo}"`,
      },
    });
  }

  const periodo =
    de.slice(0, 7) === ate.slice(0, 7)
      ? format(new Date(`${de}T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR })
      : `${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`;

  const tabela = montarRelatorio(tipo as TipoDeRelatorio, {
    lancamentos,
    periodo,
    ano: Number(de.slice(0, 4)),
    hoje: new Intl.DateTimeFormat("en-CA", { timeZone: empresa.timezone }).format(new Date()),
  });

  await registrarNaAuditoria(empresa.id, `exportacao.${tipo}`, { de, ate, formato });

  if (formato === "csv") {
    return new NextResponse(tabelaParaCSV(tabela), {
      headers: {
        "content-type": MIME.csv,
        "content-disposition": `attachment; filename="${arquivo}"`,
      },
    });
  }

  if (formato === "xlsx") {
    const conteudo = await tabelaParaExcel(tabela);
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "content-type": MIME.xlsx,
        "content-disposition": `attachment; filename="${arquivo}"`,
      },
    });
  }

  const geradoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: empresa.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const pdf = await tabelaParaPDF(tabela, { nome: empresa.name, documento: empresa.document }, geradoEm);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": MIME.pdf,
      "content-disposition": `attachment; filename="${arquivo}"`,
    },
  });
}

/**
 * Exportação é rastreável: a LGPD pede saber quem levou os dados e quando.
 * A tabela de auditoria não aceita escrita de quem está logado (só leitura para
 * o dono), então quem grava é o servidor.
 */
async function registrarNaAuditoria(
  empresaId: string,
  acao: string,
  metadata: Record<string, string>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await createAdminClient().from("audit_logs").insert({
    organization_id: empresaId,
    user_id: user?.id ?? null,
    action: acao,
    metadata,
  });
}
