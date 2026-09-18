import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ErroDoWhatsApp,
  MODELO_LEMBRETE,
  cargaDoBotao,
  corpoDoLembrete,
  enviarLembrete,
  lerCargaDoBotao,
  paraNumeroDaMeta,
  whatsappConfigurado,
} from "./cloud";

const VARIAVEIS = {
  cliente: "Marina Alves",
  servico: "Escova + hidratação",
  data: "05/10/2026",
  hora: "11:30",
};

describe("número da Meta", () => {
  it("tira o mais e tudo que não é dígito", () => {
    expect(paraNumeroDaMeta("+55 (65) 99999-0001")).toBe("5565999990001");
  });
});

describe("carga dos botões", () => {
  it("vai e volta com a ação e o atendimento", () => {
    const carga = cargaDoBotao("confirmar", "abc-123");
    expect(carga).toBe("confirmar:abc-123");
    expect(lerCargaDoBotao(carga)).toEqual({ acao: "confirmar", atendimentoId: "abc-123" });
  });

  it("recusa carga estranha, para o webhook não agir por engano", () => {
    expect(lerCargaDoBotao("apagar:abc-123")).toBeNull();
    expect(lerCargaDoBotao("confirmar:")).toBeNull();
    expect(lerCargaDoBotao("qualquer coisa")).toBeNull();
  });
});

describe("corpo do lembrete", () => {
  const corpo = corpoDoLembrete({
    telefoneE164: "+5565999990001",
    atendimentoId: "abc-123",
    variaveis: VARIAVEIS,
  });

  it("é um modelo de utilidade em português, com as quatro variáveis na ordem", () => {
    expect(corpo.messaging_product).toBe("whatsapp");
    expect(corpo.type).toBe("template");
    expect(corpo.template.name).toBe(MODELO_LEMBRETE);
    expect(corpo.template.language.code).toBe("pt_BR");

    const body = corpo.template.components.find((item) => item.type === "body");
    expect(body?.parameters).toEqual([
      { type: "text", text: "Marina Alves" },
      { type: "text", text: "Escova + hidratação" },
      { type: "text", text: "05/10/2026" },
      { type: "text", text: "11:30" },
    ]);
  });

  it("leva os dois botões, cada um com o atendimento na carga", () => {
    const botoes = corpo.template.components.filter((item) => item.type === "button");
    expect(botoes).toHaveLength(2);
    expect(botoes[0].index).toBe("0");
    expect(botoes[0].parameters[0]).toEqual({ type: "payload", payload: "confirmar:abc-123" });
    expect(botoes[1].index).toBe("1");
    expect(botoes[1].parameters[0]).toEqual({ type: "payload", payload: "remarcar:abc-123" });
  });
});

describe("envio", () => {
  const originais = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_TOKEN = "token-de-teste";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
  });

  afterEach(() => {
    process.env = { ...originais };
    vi.unstubAllGlobals();
  });

  it("sem as chaves, nem tenta falar com a Meta", async () => {
    delete process.env.WHATSAPP_TOKEN;
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);

    expect(whatsappConfigurado()).toBe(false);
    await expect(
      enviarLembrete({ telefoneE164: "+5565999990001", atendimentoId: "a", variaveis: VARIAVEIS }),
    ).rejects.toThrow(/WHATSAPP_TOKEN/);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("chama o endereço oficial da Meta com o token no cabeçalho e devolve o id", async () => {
    const fetchFalso = vi.fn(async () =>
      new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.XYZ" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const id = await enviarLembrete({
      telefoneE164: "+5565999990001",
      atendimentoId: "abc-123",
      variaveis: VARIAVEIS,
    });

    expect(id).toBe("wamid.XYZ");
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/123456/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-de-teste");
    expect(init.method).toBe("POST");
  });

  it("erro da Meta vira ErroDoWhatsApp com status e detalhe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("modelo não aprovado", { status: 400 })),
    );

    await expect(
      enviarLembrete({ telefoneE164: "+5565999990001", atendimentoId: "a", variaveis: VARIAVEIS }),
    ).rejects.toBeInstanceOf(ErroDoWhatsApp);
  });

  it("resposta sem id de mensagem é falha, não sucesso silencioso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ messaging_product: "whatsapp" }), { status: 200 })),
    );

    await expect(
      enviarLembrete({ telefoneE164: "+5565999990001", atendimentoId: "a", variaveis: VARIAVEIS }),
    ).rejects.toThrow(/sem id de mensagem/);
  });
});
