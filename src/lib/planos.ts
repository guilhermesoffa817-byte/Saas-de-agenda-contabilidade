/**
 * Planos do Alicerce.
 *
 * ATENÇÃO: os valores abaixo são EXEMPLO e precisam ser revisados antes do
 * lançamento (a especificação marca isso como [EXEMPLO]). A lógica é a que vale:
 * anual = 10 mensalidades, contador sempre de graça em todos os planos, e os
 * limites conferidos no servidor.
 */
export const PLANOS = {
  essencial: {
    nome: "Essencial",
    mensalCents: 69_00,
    anualCents: 690_00,
    maxProfissionais: 1,
    lembretesAutomaticosMes: 0,
    nfse: false,
    resumo: "Para quem atende sozinho.",
  },
  profissional: {
    nome: "Profissional",
    mensalCents: 129_00,
    anualCents: 1_290_00,
    maxProfissionais: 5,
    lembretesAutomaticosMes: 500,
    nfse: false,
    resumo: "Para equipe pequena, com lembrete automático no WhatsApp.",
  },
  negocio: {
    nome: "Negócio",
    mensalCents: 219_00,
    anualCents: 2_190_00,
    maxProfissionais: Infinity,
    lembretesAutomaticosMes: 2000,
    nfse: true,
    resumo: "Equipe sem limite e emissão de nota fiscal de serviço.",
  },
} as const;

export type ChaveDePlano = keyof typeof PLANOS;

export const ORDEM_DOS_PLANOS: ChaveDePlano[] = ["essencial", "profissional", "negocio"];

/** O plano do meio é o mais escolhido: selo dourado só nele. */
export const PLANO_DESTACADO: ChaveDePlano = "profissional";

/** O que todo plano inclui — inclusive o acesso gratuito do contador. */
export const INCLUSO_EM_TODOS = [
  "Agenda com link de agendamento próprio",
  "Financeiro do dono: entrou, saiu, sobrou",
  "Fechamento do mês em um clique",
  "Relatórios em PDF, Excel e CSV",
  "Acesso gratuito para o seu contador",
  "Pix copia e cola nos recebimentos",
  "Suporte em português",
];

export const DIAS_DE_TESTE = 7;

/** Dias de tolerância depois do vencimento antes do modo somente leitura. */
export const DIAS_DE_TOLERANCIA = 5;

/** Por quantos dias os dados ficam guardados depois do cancelamento. [EXEMPLO] */
export const DIAS_APOS_CANCELAMENTO = 90;

export function planoDe(chave: string | null | undefined) {
  if (chave && chave in PLANOS) return PLANOS[chave as ChaveDePlano];
  return null;
}

export function precoDoCiclo(plano: ChaveDePlano, ciclo: "mensal" | "anual") {
  return ciclo === "anual" ? PLANOS[plano].anualCents : PLANOS[plano].mensalCents;
}

/** Quanto o anual economiza em relação a 12 mensalidades. */
export function economiaAnualCents(plano: ChaveDePlano) {
  return PLANOS[plano].mensalCents * 12 - PLANOS[plano].anualCents;
}

/** Quantos meses o cliente ganha pagando o ano (arredondado para baixo). */
export function mesesGratisNoAnual(plano: ChaveDePlano) {
  return Math.floor(economiaAnualCents(plano) / PLANOS[plano].mensalCents);
}

export function limiteDeProfissionais(chave: string | null | undefined) {
  // Durante o teste grátis, a pessoa experimenta o plano do meio.
  if (!chave || chave === "trial") return PLANOS[PLANO_DESTACADO].maxProfissionais;
  return planoDe(chave)?.maxProfissionais ?? 1;
}

export function limiteDeLembretes(chave: string | null | undefined) {
  if (!chave || chave === "trial") return PLANOS[PLANO_DESTACADO].lembretesAutomaticosMes;
  return planoDe(chave)?.lembretesAutomaticosMes ?? 0;
}

export function permiteNotaFiscal(chave: string | null | undefined) {
  if (!chave || chave === "trial") return false;
  return planoDe(chave)?.nfse ?? false;
}
