import { ROTULO_DO_GRUPO, type LancamentoParaRelatorio, type Tabela } from "./tipos";

/**
 * Resumo do mês (DRE simplificada). Pelo regime de caixa: entra o que foi pago.
 * A retirada do dono fica em linha separada, porque não é despesa do negócio.
 */
export function montarDRE(params: {
  lancamentos: LancamentoParaRelatorio[];
  periodo: string;
}): Tabela {
  const pagos = params.lancamentos.filter((item) => item.situacao === "pago");

  const receitas = pagos.filter((item) => item.tipo === "receita");
  const despesas = pagos.filter((item) => item.tipo === "despesa");

  const somar = (lista: LancamentoParaRelatorio[]) =>
    lista.reduce((soma, item) => soma + item.valorCents, 0);

  const receitaTotal = somar(receitas);
  const porGrupo = (grupo: string) =>
    somar(despesas.filter((item) => (item.grupo ?? "operacional") === grupo));

  const operacional = porGrupo("operacional");
  const impostos = porGrupo("imposto");
  const financeiro = porGrupo("financeiro");
  const retiradas = porGrupo("retirada");

  const resultado = receitaTotal - operacional - impostos - financeiro;

  // Detalhe por categoria, para o contador conferir de onde veio cada número.
  const porCategoria = new Map<string, { tipo: string; grupo: string; valorCents: number }>();
  for (const item of pagos) {
    const chave = `${item.tipo}|${item.categoria ?? "Sem categoria"}`;
    const atual = porCategoria.get(chave);
    porCategoria.set(chave, {
      tipo: item.tipo,
      grupo: ROTULO_DO_GRUPO[item.grupo ?? "operacional"] ?? "Operacional",
      valorCents: (atual?.valorCents ?? 0) + item.valorCents,
    });
  }

  const linhas = [...porCategoria.entries()]
    .map(([chave, dados]) => ({
      tipo: dados.tipo === "receita" ? "Entrada" : "Saída",
      categoria: chave.split("|")[1],
      grupo: dados.grupo,
      valor: dados.valorCents,
    }))
    .sort((a, b) => (a.tipo === b.tipo ? b.valor - a.valor : a.tipo === "Entrada" ? -1 : 1));

  return {
    titulo: "Resumo do mês",
    subtitulo: params.periodo,
    colunas: [
      { chave: "tipo", rotulo: "Tipo", tipo: "texto" },
      { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
      { chave: "grupo", rotulo: "Grupo", tipo: "texto" },
      { chave: "valor", rotulo: "Valor", tipo: "dinheiro", alinhamento: "direita" },
    ],
    linhas,
    resumo: [
      { rotulo: "Receitas", valorCents: receitaTotal },
      { rotulo: "Despesas operacionais", valorCents: operacional, negativo: true },
      { rotulo: "Impostos", valorCents: impostos, negativo: true },
      { rotulo: "Despesas financeiras", valorCents: financeiro, negativo: true },
      { rotulo: "Resultado do mês", valorCents: resultado, destaque: true },
      { rotulo: "Retiradas do dono", valorCents: retiradas, negativo: true },
      { rotulo: "Sobrou depois das retiradas", valorCents: resultado - retiradas },
    ],
    avisos:
      resultado < 0
        ? ["O mês fechou no negativo: as saídas passaram das entradas."]
        : undefined,
  };
}
