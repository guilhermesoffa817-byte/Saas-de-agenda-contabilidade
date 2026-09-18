import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { GET, POST, assinaturaConfere } from "@/app/api/webhooks/whatsapp/route";

const SEGREDO = "app-secret-de-teste";
const originais = { ...process.env };

afterEach(() => {
  process.env = { ...originais };
});

function assinar(corpo: string) {
  return "sha256=" + createHmac("sha256", SEGREDO).update(corpo, "utf8").digest("hex");
}

function pedido(corpo: unknown, assinatura?: string) {
  const texto = JSON.stringify(corpo);
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(assinatura ? { "x-hub-signature-256": assinatura } : {}),
    },
    body: texto,
  });
}

describe("verificação do endereço", () => {
  it("devolve o desafio quando o token bate", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "token-combinado";
    const resposta = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=token-combinado&hub.challenge=1234",
      ),
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toBe("1234");
  });

  it("recusa token errado", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "token-combinado";
    const resposta = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=1234",
      ),
    );
    expect(resposta.status).toBe(401);
  });

  it("recusa quando o servidor não tem token configurado", async () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    const resposta = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=1234",
      ),
    );
    expect(resposta.status).toBe(401);
  });
});

describe("assinatura da Meta", () => {
  it("aceita a assinatura certa e recusa a errada", () => {
    const corpo = JSON.stringify({ entry: [] });
    expect(assinaturaConfere(corpo, assinar(corpo), SEGREDO)).toBe(true);
    expect(assinaturaConfere(corpo, "sha256=" + "0".repeat(64), SEGREDO)).toBe(false);
    expect(assinaturaConfere(corpo, null, SEGREDO)).toBe(false);
    expect(assinaturaConfere(corpo, "md5=abc", SEGREDO)).toBe(false);
  });

  it("corpo adulterado não passa, mesmo com assinatura de outro corpo", () => {
    const certo = JSON.stringify({ entry: [{ id: "1" }] });
    const adulterado = JSON.stringify({ entry: [{ id: "2" }] });
    expect(assinaturaConfere(adulterado, assinar(certo), SEGREDO)).toBe(false);
  });
});

describe("webhook do WhatsApp", () => {
  it("recusa quando o servidor não tem o app secret", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const resposta = await POST(pedido({ entry: [] }, "sha256=abc"));
    expect(resposta.status).toBe(401);
  });

  it("recusa evento sem assinatura", async () => {
    process.env.WHATSAPP_APP_SECRET = SEGREDO;
    const resposta = await POST(pedido({ entry: [] }));
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ erro: "assinatura inválida" });
  });

  it("recusa assinatura que não confere com o corpo", async () => {
    process.env.WHATSAPP_APP_SECRET = SEGREDO;
    const resposta = await POST(pedido({ entry: [{ id: "1" }] }, assinar("{}")));
    expect(resposta.status).toBe(401);
  });

  it("recusa corpo que não é JSON, mesmo assinado", async () => {
    process.env.WHATSAPP_APP_SECRET = SEGREDO;
    const texto = "isto não é json";
    const resposta = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": assinar(texto) },
        body: texto,
      }),
    );
    expect(resposta.status).toBe(400);
  });

  it("evento assinado e vazio responde 200, para a Meta não repetir", async () => {
    process.env.WHATSAPP_APP_SECRET = SEGREDO;
    const corpo = { entry: [] };
    const resposta = await POST(pedido(corpo, assinar(JSON.stringify(corpo))));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ confirmados: 0, remarcacoes: 0, status: 0 });
  });
});
