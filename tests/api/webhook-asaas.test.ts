import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/asaas/route";

/**
 * O que dá para provar sem a conta do Asaas: o webhook recusa quem não traz o
 * token combinado e recusa corpo sem id de evento (sem isso não há como evitar
 * processar o mesmo evento duas vezes).
 */
function pedido(corpo: unknown, token?: string) {
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "asaas-access-token": token } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

describe("webhook do Asaas", () => {
  it("recusa quando o token não está configurado no servidor", async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    const resposta = await POST(pedido({ id: "evt_1", event: "PAYMENT_CONFIRMED" }, "qualquer"));
    expect(resposta.status).toBe(401);
  });

  it("recusa token errado", async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(pedido({ id: "evt_1", event: "PAYMENT_CONFIRMED" }, "token-errado"));
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ erro: "não autorizado" });
  });

  it("recusa quando falta o token no cabeçalho", async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(pedido({ id: "evt_1", event: "PAYMENT_CONFIRMED" }));
    expect(resposta.status).toBe(401);
  });

  it("recusa evento sem id, que é o que garante não processar duas vezes", async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(pedido({ event: "PAYMENT_CONFIRMED" }, "token-secreto"));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ erro: "evento sem id" });
  });

  it("recusa corpo que não é JSON", async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(
      new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: { "asaas-access-token": "token-secreto" },
        body: "não é json",
      }),
    );
    expect(resposta.status).toBe(400);
  });
});
