import { montarContas } from "./contas";
import { montarDRE } from "./dre";
import { montarLivroCaixa } from "./livro-caixa";
import { montarReceitaSaudePendentes, montarReceitasMEI } from "./receitas-mei";
import type { LancamentoParaRelatorio, Tabela } from "./tipos";

export type TipoDeRelatorio =
  | "resumo"
  | "livro-caixa"
  | "receitas-mei"
  | "receita-saude"
  | "contas";

export const RELATORIOS: {
  tipo: TipoDeRelatorio;
  nome: string;
  descricao: string;
  /** Regimes para os quais o relatório faz sentido; vazio = todos. */
  regimes: string[];
}[] = [
  {
    tipo: "resumo",
    nome: "Resumo do mês",
    descricao: "Entradas, saídas por grupo, resultado e retiradas do dono.",
    regimes: [],
  },
  {
    tipo: "livro-caixa",
    nome: "Livro-Caixa",
    descricao: "Base do Carnê-Leão, pela data de pagamento, com receita de PF e de PJ.",
    regimes: ["pf_autonomo"],
  },
  {
    tipo: "receitas-mei",
    nome: "Receitas brutas do MEI",
    descricao: "Mês a mês, por tipo de receita e com ou sem nota fiscal.",
    regimes: ["mei"],
  },
  {
    tipo: "receita-saude",
    nome: "Recibos do Receita Saúde",
    descricao: "Recebimentos de pacientes pessoa física ainda sem recibo emitido.",
    regimes: ["pf_autonomo"],
  },
  {
    tipo: "contas",
    nome: "Contas a pagar e a receber",
    descricao: "Vencimentos, atrasados e previsão de caixa.",
    regimes: [],
  },
];

export function relatoriosDoRegime(regime: string) {
  return RELATORIOS.filter(
    (relatorio) => relatorio.regimes.length === 0 || relatorio.regimes.includes(regime),
  );
}

/** Qual filtro de data cada relatório usa. */
export function filtroDeData(tipo: TipoDeRelatorio): "competencia" | "pagamento" {
  return tipo === "livro-caixa" || tipo === "receitas-mei" || tipo === "receita-saude"
    ? "pagamento"
    : "competencia";
}

export function montarRelatorio(
  tipo: TipoDeRelatorio,
  dados: {
    lancamentos: LancamentoParaRelatorio[];
    periodo: string;
    ano: number;
    hoje: string;
  },
): Tabela {
  switch (tipo) {
    case "livro-caixa":
      return montarLivroCaixa({ lancamentos: dados.lancamentos, periodo: dados.periodo });
    case "receitas-mei":
      return montarReceitasMEI({ lancamentos: dados.lancamentos, ano: dados.ano });
    case "receita-saude":
      return montarReceitaSaudePendentes({
        lancamentos: dados.lancamentos,
        periodo: dados.periodo,
      });
    case "contas":
      return montarContas({ lancamentos: dados.lancamentos, hoje: dados.hoje });
    case "resumo":
    default:
      return montarDRE({ lancamentos: dados.lancamentos, periodo: dados.periodo });
  }
}

export function nomeDoArquivo(params: {
  tipo: TipoDeRelatorio | "exportacao-contabil";
  slug: string;
  de: string;
  ate: string;
  extensao: string;
}) {
  return `${params.slug}-${params.tipo}-${params.de}-a-${params.ate}.${params.extensao}`;
}
