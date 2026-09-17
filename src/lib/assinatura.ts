import { DIAS_APOS_CANCELAMENTO, DIAS_DE_TOLERANCIA } from "@/lib/planos";

export type EmpresaParaAssinatura = {
  plan: string;
  subscription_status: string;
  trial_ends_at: string;
  past_due_since?: string | null;
  canceled_at?: string | null;
};

export type SituacaoDaAssinatura = {
  modo: "teste" | "ativa" | "aviso" | "somente_leitura";
  /** Escrever inclui marcar atendimento, lançar dinheiro e mudar cadastro. */
  podeEscrever: boolean;
  /** Exportar e ver os dados nunca é bloqueado: é confiança e é a LGPD. */
  podeExportar: true;
  diasRestantesDoTeste: number | null;
  diasEmAtraso: number | null;
  diasAteApagar: number | null;
  titulo: string;
  mensagem: string;
};

const DIA_EM_MS = 86_400_000;

function diasDesde(iso: string | null | undefined, agora: number) {
  if (!iso) return null;
  return Math.floor((agora - new Date(iso).getTime()) / DIA_EM_MS);
}

/**
 * Traduz o status da cobrança em permissão de uso.
 *
 * Regras da especificação: teste vencido ou atraso de mais de 5 dias deixa a
 * conta em modo somente leitura — nada é apagado e a exportação continua
 * liberada. Cancelado guarda os dados por 90 dias.
 */
export function situacaoDaAssinatura(
  empresa: EmpresaParaAssinatura,
  agora = Date.now(),
): SituacaoDaAssinatura {
  const base = { podeExportar: true as const, diasAteApagar: null, diasEmAtraso: null };

  if (empresa.subscription_status === "trialing") {
    const restam = Math.ceil((new Date(empresa.trial_ends_at).getTime() - agora) / DIA_EM_MS);

    if (restam > 0) {
      return {
        ...base,
        modo: "teste",
        podeEscrever: true,
        diasRestantesDoTeste: restam,
        titulo: `Teste grátis: ${restam} ${restam === 1 ? "dia" : "dias"}`,
        mensagem:
          restam <= 2
            ? "Seu teste está acabando. Assine para não perder a agenda cheia."
            : "Você está no teste grátis, sem cartão. Pode usar tudo.",
      };
    }

    return {
      ...base,
      modo: "somente_leitura",
      podeEscrever: false,
      diasRestantesDoTeste: 0,
      titulo: "Teste grátis encerrado",
      mensagem:
        "Seus dados continuam aqui e você pode exportar tudo. Para voltar a marcar atendimentos e lançar valores, escolha um plano.",
    };
  }

  if (empresa.subscription_status === "past_due") {
    const atraso = diasDesde(empresa.past_due_since, agora) ?? 0;

    if (atraso <= DIAS_DE_TOLERANCIA) {
      return {
        ...base,
        modo: "aviso",
        podeEscrever: true,
        diasRestantesDoTeste: null,
        diasEmAtraso: atraso,
        titulo: "Pagamento em atraso",
        mensagem: `A última cobrança não foi confirmada. Você tem ${
          DIAS_DE_TOLERANCIA - atraso
        } ${DIAS_DE_TOLERANCIA - atraso === 1 ? "dia" : "dias"} para regularizar antes de a conta ficar somente leitura.`,
      };
    }

    return {
      ...base,
      modo: "somente_leitura",
      podeEscrever: false,
      diasRestantesDoTeste: null,
      diasEmAtraso: atraso,
      titulo: "Conta em modo somente leitura",
      mensagem:
        "A cobrança está atrasada há mais de 5 dias. Nada foi apagado e a exportação segue liberada: regularize para voltar a usar.",
    };
  }

  if (empresa.subscription_status === "canceled") {
    const desde = diasDesde(empresa.canceled_at, agora) ?? 0;
    const restam = Math.max(DIAS_APOS_CANCELAMENTO - desde, 0);

    return {
      ...base,
      modo: "somente_leitura",
      podeEscrever: false,
      diasRestantesDoTeste: null,
      diasAteApagar: restam,
      titulo: "Assinatura cancelada",
      mensagem: `Seus dados ficam guardados por ${restam} ${
        restam === 1 ? "dia" : "dias"
      } e você pode exportar tudo nesse período. Assinando de novo, volta tudo como estava.`,
    };
  }

  return {
    ...base,
    modo: "ativa",
    podeEscrever: true,
    diasRestantesDoTeste: null,
    titulo: "Assinatura ativa",
    mensagem: "Tudo em ordem.",
  };
}

/** Mensagem única para as ações do servidor recusarem escrita. */
export const AVISO_SOMENTE_LEITURA =
  "Sua conta está em modo somente leitura. Assine ou regularize o pagamento em Assinatura para voltar a alterar dados — exportar continua liberado.";
