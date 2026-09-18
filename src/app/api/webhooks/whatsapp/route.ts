import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { lerCargaDoBotao } from "@/lib/whatsapp/cloud";

export const dynamic = "force-dynamic";

/**
 * Webhook da WhatsApp Cloud API.
 *
 * Três cuidados que a Meta exige:
 * 1. o GET de verificação devolve o `hub.challenge` em texto puro quando o
 *    `hub.verify_token` bate com o nosso;
 * 2. o POST vem assinado em `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com
 *    o app secret) — sem conferir isso qualquer um manda evento falso;
 * 3. a entrega é "pelo menos uma vez": o mesmo evento pode chegar de novo, então
 *    confirmar duas vezes precisa dar no mesmo.
 */

/** Verificação do endereço, feita uma vez quando o webhook é cadastrado. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!esperado || modo !== "subscribe" || token !== esperado || !desafio) {
    return new NextResponse("não autorizado", { status: 401 });
  }
  return new NextResponse(desafio, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/** Confere a assinatura da Meta contra o corpo cru, em tempo constante. */
export function assinaturaConfere(corpoCru: string, assinatura: string | null, segredo: string) {
  if (!assinatura?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex");
  const recebida = assinatura.slice("sha256=".length);
  if (recebida.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(recebida, "hex"), Buffer.from(esperada, "hex"));
}

type EventoDaMeta = {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id?: string; status?: string; errors?: { title?: string }[] }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          button?: { payload?: string; text?: string };
          interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
        }[];
      };
    }[];
  }[];
};

export async function POST(request: Request) {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const corpoCru = await request.text();
  if (!assinaturaConfere(corpoCru, request.headers.get("x-hub-signature-256"), segredo)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let evento: EventoDaMeta;
  try {
    evento = JSON.parse(corpoCru) as EventoDaMeta;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  // O banco só é aberto quando há algo para gravar: evento vazio (a Meta manda
  // vários) não precisa de conexão nenhuma.
  let cliente: ReturnType<typeof createAdminClient> | null = null;
  const supabase = () => (cliente ??= createAdminClient());
  const resultado = { confirmados: 0, remarcacoes: 0, status: 0 };

  for (const entrada of evento.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      // Entrega, leitura e falha da mensagem que nós mandamos.
      for (const status of mudanca.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const nosso = traduzirStatus(status.status);
        if (!nosso) continue;
        await supabase()
          .from("message_logs")
          .update({
            status: nosso,
            error: status.errors?.[0]?.title ?? null,
          })
          .eq("provider_message_id", status.id);
        resultado.status += 1;
      }

      // Resposta do cliente: clique em "Confirmar" ou em "Remarcar".
      for (const mensagem of mudanca.value?.messages ?? []) {
        const carga =
          mensagem.button?.payload ?? mensagem.interactive?.button_reply?.id ?? null;
        if (!carga) continue;

        const acao = lerCargaDoBotao(carga);
        if (!acao) continue;

        if (acao.acao === "confirmar") {
          // Só sai de "agendado": confirmar o que já foi concluído ou cancelado
          // seria desfazer o trabalho de quem atende.
          await supabase()
            .from("appointments")
            .update({ status: "confirmado", confirmed_at: new Date().toISOString() })
            .eq("id", acao.atendimentoId)
            .eq("status", "agendado");
          resultado.confirmados += 1;
        } else {
          // Remarcar é conversa: o Alicerce não move horário sozinho. Fica o
          // registro para a recepção ver e ligar.
          const { data: atendimento } = await supabase()
            .from("appointments")
            .select("organization_id")
            .eq("id", acao.atendimentoId)
            .maybeSingle();

          if (atendimento) {
            await supabase().from("message_logs").insert({
              organization_id: atendimento.organization_id,
              appointment_id: acao.atendimentoId,
              template: "resposta_remarcar",
              status: "entregue",
            });
          }
          resultado.remarcacoes += 1;
        }
      }
    }
  }

  // 200 sempre que o evento foi lido: a Meta repete o que não recebe 200.
  return NextResponse.json(resultado);
}

function traduzirStatus(status: string) {
  if (status === "delivered") return "entregue" as const;
  if (status === "read") return "lido" as const;
  if (status === "failed") return "falhou" as const;
  return null;
}
