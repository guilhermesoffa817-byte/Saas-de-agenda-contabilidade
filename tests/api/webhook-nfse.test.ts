import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/nfse/route";

/**
 * O que dá para provar sem a conta do provedor: a porta só abre com o token
 * combinado e só aceita evento que diga a qual lançamento se refere.
 */
function pedido(corpo: unknown, token?: string) {
  return new Request("http://localhost/api/webhooks/nfse", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-nfse-token": token } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

const originais = { ...process.env };

afterEach(() => {
  process.env = { ...originais };
});

describe("webhook da NFS-e", () => {
  it("recusa quando o token não está configurado no servidor", async () => {
    delete process.env.NFSE_WEBHOOK_TOKEN;
    const resposta = await POST(pedido({ ref: "lanc-1", status: "autorizado" }, "qualquer"));
    expect(resposta.status).toBe(401);
  });

  it("recusa token errado", async () => {
    process.env.NFSE_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(pedido({ ref: "lanc-1" }, "token-errado"));
    expect(resposta.status).toBe(401);
  });

  it("recusa quando falta o token no cabeçalho", async () => {
    process.env.NFSE_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(pedido({ ref: "lanc-1" }));
    expect(resposta.status).toBe(401);
  });

  it("recusa evento sem referência, que é o que liga a nota ao lançamento", async () => {
    process.env.NFSE_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(pedido({ status: "autorizado" }, "token-secreto"));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ erro: "evento sem referência" });
  });

  it("recusa corpo que não é JSON", async () => {
    process.env.NFSE_WEBHOOK_TOKEN = "token-secreto";
    const resposta = await POST(
      new Request("http://localhost/api/webhooks/nfse", {
        method: "POST",
        headers: { "x-nfse-token": "token-secreto" },
        body: "isto não é json",
      }),
    );
    expect(resposta.status).toBe(400);
  });
});
