import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook de cobrança do Asaas.
 *
 * Três cuidados que a documentação do Asaas exige:
 * 1. o token vem no header `asaas-access-token` e é um token nosso, nunca a
 *    chave da API;
 * 2. a entrega é "pelo menos uma vez": o id do evento é gravado antes de
 *    processar, e evento repetido é ignorado;
 * 3. responder 200 rápido — depois de 15 falhas seguidas a fila é pausada.
 */
const STATUS_POR_EVENTO: Record<string, "active" | "past_due" | "canceled" | undefined> = {
  PAYMENT_CONFIRMED: "active",
  PAYMENT_RECEIVED: "active",
  PAYMENT_OVERDUE: "past_due",
  PAYMENT_REFUNDED: "past_due",
  PAYMENT_CHARGEBACK_REQUESTED: "past_due",
  PAYMENT_DELETED: "canceled",
  SUBSCRIPTION_DELETED: "canceled",
};

export async function POST(request: Request) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token || request.headers.get("asaas-access-token") !== token) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let evento: {
    id?: string;
    event?: string;
    payment?: { subscription?: string };
    subscription?: { id?: string };
  };

  try {
    evento = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  if (!evento.id || !evento.event) {
    return NextResponse.json({ erro: "evento sem id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("billing_events")
    .insert({ id: evento.id, type: evento.event, payload: evento });

  // Já processado: o Asaas reenvia o mesmo evento e isso é esperado.
  if (error?.code === "23505") return NextResponse.json({ ok: true, repetido: true });
  if (error) return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 });

  const assinatura = evento.payment?.subscription ?? evento.subscription?.id;
  const status = STATUS_POR_EVENTO[evento.event];

  if (assinatura && status) {
    const { error: erroAplicar } = await supabase.rpc("aplicar_status_de_cobranca", {
      p_assinatura: assinatura,
      p_status: status,
    });
    if (erroAplicar) {
      return NextResponse.json({ erro: "falha ao aplicar status" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
