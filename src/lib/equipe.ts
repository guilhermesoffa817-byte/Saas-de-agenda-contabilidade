/**
 * Gestão de pessoas: vocabulário por vínculo, conta comercial combinada e alertas.
 *
 * O Bossa NÃO faz folha de pagamento. Aqui só existe a conta comercial
 * combinada (percentual × valor recebido, valor por atendimento, valor fixo),
 * que não é tributo. Salário líquido, encargos, férias e rescisão ficam com o
 * contador: o dono digita o que pagou.
 *
 * As palavras importam: registrar "férias", "falta" ou "salário" de quem não é
 * empregado produz prova de subordinação contra o próprio dono. Por isso cada
 * vínculo tem o seu vocabulário, e o banco recusa a combinação errada
 * (private.ausencia_permitida e private.pagamento_permitido, em 0013_pessoas.sql).
 */
import { ESTAGIO_DURACAO_MAX_MESES, MEI_MAX_EMPREGADOS } from "@/lib/fiscal/constantes";
import { formatarBRL } from "@/lib/money";
import type { Enums } from "@/lib/supabase/database.types";

export type Contrato = Enums<"staff_contract">;
export type TipoDeAusencia = Enums<"staff_absence_kind">;
export type TipoDePagamento = Enums<"staff_payment_kind">;

export const CONTRATOS = ["clt", "parceria", "mei", "pj", "autonomo", "estagio"] as const satisfies readonly Contrato[];

export const TIPOS_DE_AUSENCIA = [
  "ferias",
  "recesso",
  "folga",
  "atestado",
  "licenca",
  "falta",
  "indisponivel",
] as const satisfies readonly TipoDeAusencia[];

export const TIPOS_DE_PAGAMENTO = [
  "salario",
  "comissao",
  "cota_parte",
  "repasse",
  "bolsa",
  "adiantamento",
  "bonus",
  "beneficio",
  "encargo",
  "rescisao",
  "outro",
] as const satisfies readonly TipoDePagamento[];

// ---------------------------------------------------------------------------
// Vínculos
// ---------------------------------------------------------------------------

export const VINCULOS: Record<Contrato, { rotulo: string; curto: string; descricao: string }> = {
  clt: {
    rotulo: "CLT (carteira assinada)",
    curto: "CLT",
    descricao: "Empregado com carteira assinada. Salário, encargos e férias são calculados pelo contador.",
  },
  parceria: {
    rotulo: "Profissional-parceiro (Lei do Salão-Parceiro)",
    curto: "Parceria",
    descricao:
      "Lei 12.592/2012, com a redação da Lei 13.352/2016. Exige contrato escrito e homologado; o profissional recebe a cota-parte combinada.",
  },
  mei: {
    rotulo: "MEI prestador de serviço",
    curto: "MEI",
    descricao: "Presta serviço com o próprio CNPJ de MEI, por contrato de prestação de serviço.",
  },
  pj: {
    rotulo: "Empresa prestadora (PJ)",
    curto: "PJ",
    descricao: "Empresa que presta serviço ao seu negócio e emite nota fiscal pelo que recebe.",
  },
  autonomo: {
    rotulo: "Autônomo (pessoa física)",
    curto: "Autônomo",
    descricao: "Pessoa física que presta serviço sem vínculo de emprego. As retenções ficam com o contador.",
  },
  estagio: {
    rotulo: "Estagiário",
    curto: "Estágio",
    descricao: "Lei 11.788/2008: termo de compromisso com a instituição de ensino e bolsa-auxílio.",
  },
};

/** A parceria da Lei 13.352/2016 só vale para beleza (cabeleireiro, barbeiro, manicure…). */
const SEGMENTOS_COM_PARCERIA = ["salao", "barbearia", "outro"];

/** Vínculos oferecidos no cadastro. O vínculo atual sempre aparece, mesmo fora do segmento. */
export function contratosDoSegmento(segmento: string | null | undefined, atual?: Contrato): Contrato[] {
  return CONTRATOS.filter(
    (contrato) =>
      contrato !== "parceria" ||
      atual === "parceria" ||
      SEGMENTOS_COM_PARCERIA.includes(segmento ?? "outro"),
  );
}

// ---------------------------------------------------------------------------
// Terminologia da remuneração
// ---------------------------------------------------------------------------

export type CampoDeRemuneracao = { rotulo: string; ajuda: string };

export type TermosDoVinculo = {
  /** Valor fixo mensal (base_pay_cents). */
  fixo: CampoDeRemuneracao | null;
  /** Percentual sobre os atendimentos recebidos (commission_bps). */
  percentual: CampoDeRemuneracao | null;
  /** Valor fixo por atendimento recebido (per_service_cents). */
  porAtendimento: CampoDeRemuneracao | null;
};

const ACORDO_DE_PRESTADOR: TermosDoVinculo = {
  fixo: null,
  percentual: {
    rotulo: "Percentual combinado",
    ajuda: "Sobre o que entrou dos atendimentos feitos por essa pessoa.",
  },
  porAtendimento: {
    rotulo: "Valor por atendimento",
    ajuda: "Valor combinado para cada atendimento recebido.",
  },
};

export const TERMOS_POR_VINCULO: Record<Contrato, TermosDoVinculo> = {
  clt: {
    fixo: {
      rotulo: "Salário",
      ajuda: "Salário bruto do contrato. O líquido e os encargos vêm do contador.",
    },
    percentual: {
      rotulo: "Comissão",
      ajuda: "Percentual sobre o que entrou dos atendimentos dessa pessoa.",
    },
    porAtendimento: null,
  },
  parceria: {
    fixo: null,
    percentual: {
      rotulo: "Cota-parte do profissional",
      ajuda: "Percentual de cada atendimento que fica com o profissional-parceiro, como está no contrato.",
    },
    porAtendimento: null,
  },
  mei: ACORDO_DE_PRESTADOR,
  pj: ACORDO_DE_PRESTADOR,
  autonomo: ACORDO_DE_PRESTADOR,
  estagio: {
    fixo: {
      rotulo: "Bolsa-auxílio",
      ajuda: "Valor mensal previsto no termo de compromisso de estágio.",
    },
    percentual: null,
    porAtendimento: null,
  },
};

export type Remuneracao = {
  fixoCents: number;
  percentualBps: number;
  porAtendimentoCents: number;
};

/** Zera o que não existe no vínculo: quem troca de CLT para parceria não leva salário junto. */
export function remuneracaoDoVinculo(contrato: Contrato, valores: Remuneracao): Remuneracao {
  const termos = TERMOS_POR_VINCULO[contrato];
  return {
    fixoCents: termos.fixo ? valores.fixoCents : 0,
    percentualBps: termos.percentual ? valores.percentualBps : 0,
    porAtendimentoCents: termos.porAtendimento ? valores.porAtendimentoCents : 0,
  };
}

/** "Salário R$ 1.900,00 + comissão 10%", "Cota-parte do profissional 60%", "R$ 25,00 por atendimento". */
export function resumirRemuneracao(contrato: Contrato, valores: Remuneracao) {
  const termos = TERMOS_POR_VINCULO[contrato];
  const partes: { rotulo: string; valor: string }[] = [];
  if (termos.fixo && valores.fixoCents > 0) {
    partes.push({ rotulo: termos.fixo.rotulo, valor: formatarBRL(valores.fixoCents) });
  }
  if (termos.percentual && valores.percentualBps > 0) {
    partes.push({ rotulo: termos.percentual.rotulo, valor: formatarPercentual(valores.percentualBps) });
  }
  if (termos.porAtendimento && valores.porAtendimentoCents > 0) {
    partes.push({ rotulo: "", valor: `${formatarBRL(valores.porAtendimentoCents)} por atendimento` });
  }
  if (!partes.length) return "Não informado";
  return partes
    .map(({ rotulo, valor }, indice) => {
      if (!rotulo) return valor;
      const texto = indice === 0 ? rotulo : rotulo.charAt(0).toLowerCase() + rotulo.slice(1);
      return `${texto} ${valor}`;
    })
    .join(" + ");
}

// ---------------------------------------------------------------------------
// Ausências e pagamentos permitidos (espelho das funções do banco)
// ---------------------------------------------------------------------------

/** Idêntico a private.ausencia_permitida (0013_pessoas.sql). Um teste confere. */
export const AUSENCIAS_POR_VINCULO: Record<Contrato, TipoDeAusencia[]> = {
  clt: ["ferias", "folga", "atestado", "licenca", "falta"],
  estagio: ["recesso", "folga", "atestado", "falta"],
  parceria: ["indisponivel"],
  mei: ["indisponivel"],
  pj: ["indisponivel"],
  autonomo: ["indisponivel"],
};

/** Idêntico a private.pagamento_permitido (0013_pessoas.sql). Um teste confere. */
export const PAGAMENTOS_POR_VINCULO: Record<Contrato, TipoDePagamento[]> = {
  clt: ["salario", "comissao", "adiantamento", "bonus", "beneficio", "encargo", "rescisao", "outro"],
  estagio: ["bolsa", "beneficio", "outro"],
  parceria: ["cota_parte", "outro"],
  mei: ["repasse", "outro"],
  pj: ["repasse", "outro"],
  autonomo: ["repasse", "outro"],
};

/** Estágio tem recesso, nunca férias. Quem não é empregado só fica "indisponível na agenda". */
export const ROTULO_AUSENCIA: Record<TipoDeAusencia, string> = {
  ferias: "Férias",
  recesso: "Recesso",
  folga: "Folga",
  atestado: "Atestado",
  licenca: "Licença",
  falta: "Falta",
  indisponivel: "Indisponível na agenda",
};

export const ROTULO_PAGAMENTO: Record<TipoDePagamento, string> = {
  salario: "Salário",
  comissao: "Comissão",
  cota_parte: "Cota-parte",
  repasse: "Repasse do valor combinado",
  bolsa: "Bolsa-auxílio",
  adiantamento: "Adiantamento",
  bonus: "Bônus",
  beneficio: "Benefício (transporte, alimentação)",
  encargo: "Guia de encargos",
  rescisao: "Rescisão",
  outro: "Outro",
};

export function ausenciaPermitida(contrato: Contrato, tipo: TipoDeAusencia) {
  return AUSENCIAS_POR_VINCULO[contrato].includes(tipo);
}

export function pagamentoPermitido(contrato: Contrato, tipo: TipoDePagamento) {
  return PAGAMENTOS_POR_VINCULO[contrato].includes(tipo);
}

const VINCULOS_SEM_EMPREGO: Contrato[] = ["parceria", "mei", "pj", "autonomo"];

/**
 * Troca que o banco recusa quando já há histórico de emprego (0015,
 * private.conferir_colaborador): de CLT ou estágio para um vínculo sem emprego.
 */
export function trocaParaVinculoSemEmprego(de: Contrato, para: Contrato) {
  return de !== para && !VINCULOS_SEM_EMPREGO.includes(de) && VINCULOS_SEM_EMPREGO.includes(para);
}

/** Tipo de pagamento que já vem marcado no diálogo. */
export function tipoDePagamentoSugerido(contrato: Contrato, valores: Remuneracao): TipoDePagamento {
  switch (contrato) {
    case "clt":
      return valores.fixoCents === 0 && valores.percentualBps > 0 ? "comissao" : "salario";
    case "estagio":
      return "bolsa";
    case "parceria":
      return "cota_parte";
    default:
      return "repasse";
  }
}

/** Categoria de despesa em que o pagamento cai no Financeiro (a mesma regra de registrar_pagamento_equipe). */
export function categoriaDoPagamento(tipo: TipoDePagamento) {
  return tipo === "comissao" || tipo === "cota_parte" || tipo === "repasse"
    ? "Comissões e repasses a profissionais"
    : "Salários e encargos";
}

// ---------------------------------------------------------------------------
// Percentual em pontos-base (10000 = 100%), sem float
// ---------------------------------------------------------------------------

/** Valor × percentual, arredondado ao centavo. 4000 bps = 40%. */
export function aplicarPercentual(valorCents: number, bps: number) {
  return Math.round((valorCents * bps) / 10_000);
}

/**
 * Converte o percentual digitado em pontos-base, só com manipulação de texto
 * (nada de parseFloat): "40" → 4000, "40,5" → 4050, "12,25%" → 1225.
 * Vazio vale 0. Devolve null se não for um percentual entre 0 e 100 com até
 * duas casas decimais.
 */
export function textoParaBps(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/%$/, "");
  if (limpo === "") return 0;
  const partes = /^(\d{1,3})(?:[.,](\d{0,2}))?$/.exec(limpo);
  if (!partes) return null;
  const inteiro = Number(partes[1]);
  const casas = Number((partes[2] ?? "").padEnd(2, "0"));
  const bps = inteiro * 100 + casas;
  return bps > 10_000 ? null : bps;
}

/** 4050 → "40,5"; 4000 → "40"; 1225 → "12,25"; 5 → "0,05". */
export function bpsParaTexto(bps: number) {
  const inteiro = Math.trunc(bps / 100);
  const resto = bps % 100;
  if (resto === 0) return String(inteiro);
  return `${inteiro},${String(resto).padStart(2, "0").replace(/0$/, "")}`;
}

export function formatarPercentual(bps: number) {
  return `${bpsParaTexto(bps)}%`;
}

// ---------------------------------------------------------------------------
// Valor sugerido do mês
// ---------------------------------------------------------------------------

export type ValorSugerido = {
  fixoCents: number;
  percentualCents: number;
  porAtendimentoCents: number;
  totalCents: number;
};

/**
 * Conta comercial combinada do mês: fixo + percentual sobre a base de comissão
 * (o que entrou dos atendimentos) + valor por atendimento × quantidade. Não
 * desconta nem acrescenta tributo: isso é com o contador.
 */
export function valorSugeridoDoMes(
  valores: Remuneracao & { baseCents: number; atendimentos: number },
): ValorSugerido {
  const fixoCents = valores.fixoCents;
  const percentualCents = aplicarPercentual(valores.baseCents, valores.percentualBps);
  const porAtendimentoCents = valores.porAtendimentoCents * valores.atendimentos;
  return {
    fixoCents,
    percentualCents,
    porAtendimentoCents,
    totalCents: fixoCents + percentualCents + porAtendimentoCents,
  };
}

export const SUGESTAO_ZERADA: ValorSugerido = {
  fixoCents: 0,
  percentualCents: 0,
  porAtendimentoCents: 0,
  totalCents: 0,
};

type ColaboradorComCombinado = Remuneracao & {
  id: string;
  contrato: Contrato;
  inicio: string;
  fim: string | null;
  removido?: boolean;
};
type BaseDoColaborador = { baseCents: number; atendimentos: number | null };

/** A conta do combinado de um colaborador sobre a base de um mês. */
export function sugestaoDoColaborador(
  colaborador: Pick<ColaboradorComCombinado, "contrato"> & Remuneracao,
  base: BaseDoColaborador | undefined,
): ValorSugerido {
  return valorSugeridoDoMes({
    ...remuneracaoDoVinculo(colaborador.contrato, colaborador),
    baseCents: base?.baseCents ?? 0,
    atendimentos: base?.atendimentos ?? 0,
  });
}

/**
 * Sugestão de cada colaborador para o mês de referência "aaaa-mm", com a base
 * DESSE mês. Quem não trabalhou no mês (ou foi removido) fica zerado.
 */
export function sugestoesDoMes(
  colaboradores: ColaboradorComCombinado[],
  bases: Record<string, BaseDoColaborador>,
  mes: string,
): Record<string, ValorSugerido> {
  return Object.fromEntries(
    colaboradores.map((c) => [
      c.id,
      !c.removido && ativoNoMes(c, mes) ? sugestaoDoColaborador(c, bases[c.id]) : SUGESTAO_ZERADA,
    ]),
  );
}

/**
 * Valor que já vem preenchido no diálogo de pagamento, conforme o tipo
 * escolhido. Salário e bolsa puxam o fixo; comissão, só o percentual; cota-parte
 * e repasse, o percentual mais o valor por atendimento. Adiantamento, bônus,
 * benefício, guia de encargos e rescisão não têm conta combinada: o dono digita.
 */
export function valorDoTipoDePagamento(tipo: TipoDePagamento, sugerido: ValorSugerido) {
  switch (tipo) {
    case "salario":
    case "bolsa":
      return sugerido.fixoCents;
    case "comissao":
      return sugerido.percentualCents;
    case "cota_parte":
    case "repasse":
      return sugerido.percentualCents + sugerido.porAtendimentoCents;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Datas (dias no formato aaaa-mm-dd, sem fuso: são datas de calendário)
// ---------------------------------------------------------------------------

/** Soma meses a um dia, encostando no último dia do mês quando ele não existe (31/01 + 1 → 28/02). */
export function somarMeses(dia: string, meses: number) {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const indice = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(indice / 12);
  const novoMes = (indice % 12) + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  const novoDia = Math.min(diaDoMes, ultimoDia);
  return `${String(novoAno).padStart(4, "0")}-${String(novoMes).padStart(2, "0")}-${String(novoDia).padStart(2, "0")}`;
}

/** Primeiro e último dia de um mês "aaaa-mm". */
export function limitesDoMes(mes: string) {
  const [ano, numero] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-09" → "setembro de 2026". */
export function nomeDoMes(mes: string) {
  const [ano, numero] = mes.split("-").map(Number);
  return `${NOMES_DOS_MESES[numero - 1]} de ${ano}`;
}

/** Soma meses a um mês "aaaa-mm". */
export function somarMesesAoMes(mes: string, meses: number) {
  return somarMeses(`${mes}-01`, meses).slice(0, 7);
}

/**
 * Opções do campo "Mês de referência", da mais recente para a mais antiga: de
 * 2 meses depois de hoje até 24 meses antes, mais os meses de `incluir` (o mês
 * aberto na página pode estar fora dessa faixa). Lista fechada em vez de
 * <input type="month">, que vira texto livre no Safari e no Firefox de desktop.
 */
export function mesesDeReferencia(hoje: string, incluir: string[] = []) {
  const atual = hoje.slice(0, 7);
  const meses = new Set<string>();
  for (let deslocamento = 2; deslocamento >= -24; deslocamento--) {
    meses.add(somarMesesAoMes(atual, deslocamento));
  }
  for (const mes of incluir) meses.add(mes);
  return [...meses]
    .sort((a, b) => b.localeCompare(a))
    .map((valor) => ({ valor, rotulo: nomeDoMes(valor) }));
}

/** "2026-10-05" → "05/10/2026". Data de calendário: não passa por fuso nenhum. */
export function formatarDia(dia: string) {
  const [ano, mes, diaDoMes] = dia.slice(0, 10).split("-");
  return `${diaDoMes}/${mes}/${ano}`;
}

/** Quantos dias de calendário o período cobre, contando o primeiro e o último. */
export function diasNoPeriodo(inicio: string, fim: string) {
  const [a1, m1, d1] = inicio.split("-").map(Number);
  const [a2, m2, d2] = fim.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000) + 1;
}

type Periodo = { inicio: string; fim: string | null };

/** Ativo hoje: começou e ainda não terminou (o último dia ainda conta). */
export function estaAtivo(periodo: Periodo, hoje: string) {
  return periodo.inicio <= hoje && (periodo.fim === null || periodo.fim >= hoje);
}

/** Trabalhou em algum dia do mês "aaaa-mm". */
export function ativoNoMes(periodo: Periodo, mes: string) {
  const { de, ate } = limitesDoMes(mes);
  return periodo.inicio <= ate && (periodo.fim === null || periodo.fim >= de);
}

/**
 * Profissionais da agenda que ainda podem ser ligados a um colaborador: os que
 * ninguém usa, mais o do próprio colaborador em edição.
 */
export function profissionaisLivres<P extends { id: string }>(
  profissionais: P[],
  colaboradores: { id: string; profissionalId: string | null }[],
  colaboradorEmEdicao?: string,
) {
  const usados = new Set(
    colaboradores
      .filter((c) => c.id !== colaboradorEmEdicao && c.profissionalId)
      .map((c) => c.profissionalId),
  );
  return profissionais.filter((p) => !usados.has(p.id));
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export type Alerta = {
  chave: string;
  nivel: "atencao" | "lembrete";
  titulo: string;
  texto: string;
};

export type ColaboradorParaAlerta = {
  id: string;
  nome: string;
  contrato: Contrato;
  inicio: string;
  fim: string | null;
  removido?: boolean;
};

/**
 * Avisos que o dono precisa ver. Não decidem nada: apontam o que conferir com
 * o contador. Nenhum avalia a pessoa — só o cadastro.
 */
export function alertasDaEquipe({
  regime,
  hoje,
  colaboradores,
}: {
  regime: string | null | undefined;
  hoje: string;
  colaboradores: ColaboradorParaAlerta[];
}): Alerta[] {
  const ativos = colaboradores.filter((c) => !c.removido && estaAtivo(c, hoje));
  const alertas: Alerta[] = [];

  const empregados = ativos.filter((c) => c.contrato === "clt").length;
  if (regime === "mei" && empregados > MEI_MAX_EMPREGADOS) {
    alertas.push({
      chave: "mei-empregados",
      nivel: "atencao",
      titulo: "Mais empregados do que o MEI permite",
      texto: `O MEI pode ter no máximo ${MEI_MAX_EMPREGADOS} empregado com carteira assinada (LC 123/2006, art. 18-C). Há ${empregados} cadastrados como CLT e ativos. Converse com seu contador.`,
    });
  }

  for (const estagiario of ativos.filter((c) => c.contrato === "estagio")) {
    const limite = somarMeses(estagiario.inicio, ESTAGIO_DURACAO_MAX_MESES);
    if (hoje > limite) {
      alertas.push({
        chave: `estagio-${estagiario.id}`,
        nivel: "atencao",
        titulo: `Estágio de ${estagiario.nome} passou do prazo`,
        texto: `O estágio na mesma empresa dura no máximo ${ESTAGIO_DURACAO_MAX_MESES} meses (Lei 11.788/2008, art. 11), salvo estagiário com deficiência. Converse com seu contador sobre o encerramento ou a contratação.`,
      });
    }
  }

  if (ativos.some((c) => c.contrato === "parceria")) {
    alertas.push({
      chave: "parceria-contrato",
      nivel: "lembrete",
      titulo: "Parceria exige contrato escrito e homologado",
      texto:
        "A Lei 13.352/2016 pede contrato escrito, homologado pelo sindicato da categoria (ou pelo órgão local do Ministério do Trabalho) e assinado diante de duas testemunhas. Sem ele, a parceria pode ser tratada como emprego.",
    });
    alertas.push({
      chave: "parceria-receita",
      nivel: "lembrete",
      titulo: "Cota-parte e receita bruta",
      texto:
        "Hoje o Bossa registra o valor inteiro do atendimento como receita. Confira com seu contador como a cota-parte do profissional-parceiro entra na receita bruta do salão.",
    });
  }

  return alertas;
}
