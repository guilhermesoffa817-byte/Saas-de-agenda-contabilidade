import "server-only";

/**
 * WhatsApp Business Platform (Cloud API), a oficial da Meta.
 *
 * Nada de API não oficial: além de violar os termos, dá banimento no número do
 * cliente. Modelo de **utilidade** (`lembrete_agendamento`): dentro da janela de
 * 24h de atendimento é gratuito; fora dela, a Meta cobra por mensagem. A tabela
 * de preços só muda no primeiro dia de cada trimestre — confira antes de mexer
 * nas franquias dos planos em `src/lib/planos.ts`.
 */

const VERSAO = "v23.0";

export const MODELO_LEMBRETE = "lembrete_agendamento";
export const IDIOMA_DO_MODELO = "pt_BR";

/** Diz se as chaves da Meta estão no ambiente. Sem elas, o lembrete não sai. */
export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export type RespostaDeEnvio = {
  messaging_product: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
};

export class ErroDoWhatsApp extends Error {
  constructor(
    readonly status: number,
    readonly detalhe: string,
  ) {
    super(`WhatsApp ${status}: ${detalhe}`);
    this.name = "ErroDoWhatsApp";
  }
}

/** O número como a Meta quer: só dígitos, com DDI, sem "+". */
export function paraNumeroDaMeta(telefoneE164: string) {
  return telefoneE164.replace(/\D/g, "");
}

/**
 * Carga do botão: leva o id do atendimento de volta no webhook, para a resposta
 * do cliente saber a qual horário ela se refere.
 */
export function cargaDoBotao(acao: "confirmar" | "remarcar", atendimentoId: string) {
  return `${acao}:${atendimentoId}`;
}

export function lerCargaDoBotao(carga: string) {
  const [acao, atendimentoId] = carga.split(":");
  if ((acao !== "confirmar" && acao !== "remarcar") || !atendimentoId) return null;
  return { acao, atendimentoId } as const;
}

export type VariaveisDoLembrete = {
  cliente: string;
  servico: string;
  data: string;
  hora: string;
};

/**
 * Monta o corpo do envio. Fica separado do `fetch` para o teste conferir o
 * formato sem falar com a Meta.
 */
export function corpoDoLembrete(params: {
  telefoneE164: string;
  atendimentoId: string;
  variaveis: VariaveisDoLembrete;
}) {
  const { cliente, servico, data, hora } = params.variaveis;

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: paraNumeroDaMeta(params.telefoneE164),
    type: "template",
    template: {
      name: MODELO_LEMBRETE,
      language: { code: IDIOMA_DO_MODELO },
      components: [
        {
          type: "body",
          parameters: [cliente, servico, data, hora].map((text) => ({ type: "text", text })),
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: cargaDoBotao("confirmar", params.atendimentoId) }],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [{ type: "payload", payload: cargaDoBotao("remarcar", params.atendimentoId) }],
        },
      ],
    },
  };
}

/** Envia o modelo de utilidade e devolve o id da mensagem na Meta. */
export async function enviarLembrete(params: {
  telefoneE164: string;
  atendimentoId: string;
  variaveis: VariaveisDoLembrete;
}) {
  if (!whatsappConfigurado()) {
    throw new Error("Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no ambiente.");
  }

  const url = `https://graph.facebook.com/${VERSAO}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify(corpoDoLembrete(params)),
    cache: "no-store",
  });

  const texto = await res.text();
  if (!res.ok) throw new ErroDoWhatsApp(res.status, texto);

  const resposta = JSON.parse(texto) as RespostaDeEnvio;
  const id = resposta.messages?.[0]?.id;
  if (!id) throw new ErroDoWhatsApp(res.status, "a Meta respondeu sem id de mensagem");
  return id;
}
