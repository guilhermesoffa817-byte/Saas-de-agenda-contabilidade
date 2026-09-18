import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/cron/lembretes/route";

/**
 * O que dá para provar sem o Supabase e sem a conta da Meta: a porta só abre
 * com o segredo combinado. Quem não tem o `x-cron-secret` não roda a tarefa.
 */
function pedido(segredo?: string) {
  return new Request("http://localhost/api/cron/lembretes", {
    method: "POST",
    headers: segredo ? { "x-cron-secret": segredo } : {},
  });
}

const originais = { ...process.env };

afterEach(() => {
  process.env = { ...originais };
});

describe("tarefa dos lembretes", () => {
  it("recusa quando o segredo não está configurado no servidor", async () => {
    delete process.env.CRON_SECRET;
    const resposta = await POST(pedido("qualquer"));
    expect(resposta.status).toBe(401);
  });

  it("recusa segredo errado", async () => {
    process.env.CRON_SECRET = "segredo-longo";
    const resposta = await POST(pedido("segredo-errado"));
    expect(resposta.status).toBe(401);
  });

  it("recusa quando o cabeçalho não vem", async () => {
    process.env.CRON_SECRET = "segredo-longo";
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(401);
  });
});
