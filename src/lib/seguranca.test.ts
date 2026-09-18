import { afterEach, describe, expect, it } from "vitest";

import { CABECALHOS_FIXOS, montarCSP, rotaDinamica } from "./seguranca";

const originais = { ...process.env };

afterEach(() => {
  process.env = { ...originais };
});

function diretiva(csp: string, nome: string) {
  const parte = csp.split("; ").find((item) => item.startsWith(`${nome} `));
  return parte?.slice(nome.length + 1) ?? "";
}

describe("cabeçalhos fixos", () => {
  it("trazem HSTS por um ano, nosniff e proibição de moldura", () => {
    const porChave = new Map(CABECALHOS_FIXOS.map((item) => [item.chave, item.valor]));
    expect(porChave.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(porChave.get("X-Content-Type-Options")).toBe("nosniff");
    expect(porChave.get("X-Frame-Options")).toBe("DENY");
  });

  it("desligam câmera, microfone, localização e pagamento", () => {
    const permissoes = CABECALHOS_FIXOS.find((item) => item.chave === "Permissions-Policy")!.valor;
    for (const recurso of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) {
      expect(permissoes).toContain(recurso);
    }
  });
});

describe("CSP", () => {
  it("em produção, script só com nonce e strict-dynamic, sem eval", () => {
    const csp = montarCSP({ nonce: "abc123", desenvolvimento: false });
    expect(diretiva(csp, "script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("em desenvolvimento libera eval, que o Turbopack precisa", () => {
    const csp = montarCSP({ nonce: "abc123", desenvolvimento: true });
    expect(diretiva(csp, "script-src")).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("proíbe moldura, objeto e base solta", () => {
    const csp = montarCSP({ nonce: "n", desenvolvimento: false });
    expect(diretiva(csp, "frame-ancestors")).toBe("'none'");
    expect(diretiva(csp, "object-src")).toBe("'none'");
    expect(diretiva(csp, "base-uri")).toBe("'self'");
    expect(diretiva(csp, "form-action")).toBe("'self'");
  });

  it("libera o domínio do Supabase na conexão, inclusive por websocket", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdef.supabase.co";
    const conexao = diretiva(montarCSP({ nonce: "n", desenvolvimento: false }), "connect-src");
    expect(conexao).toContain("https://abcdef.supabase.co");
    expect(conexao).toContain("wss://abcdef.supabase.co");
  });

  it("sem Supabase configurado, não sobra origem vazia na diretiva", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const conexao = diretiva(montarCSP({ nonce: "n", desenvolvimento: false }), "connect-src");
    expect(conexao).not.toContain("  ");
    expect(conexao.split(" ").every((item) => item.length > 0)).toBe(true);
  });

  it("url do Supabase quebrada não derruba a CSP", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "não é url";
    expect(() => montarCSP({ nonce: "n", desenvolvimento: false })).not.toThrow();
  });

  it("cada nonce entra na sua própria CSP", () => {
    const a = montarCSP({ nonce: "um", desenvolvimento: false });
    const b = montarCSP({ nonce: "dois", desenvolvimento: false });
    expect(a).toContain("'nonce-um'");
    expect(b).toContain("'nonce-dois'");
    expect(a).not.toBe(b);
  });
});

describe("rota dinâmica ou estática", () => {
  it("as telas com dado de gente são dinâmicas", () => {
    for (const caminho of [
      "/app",
      "/app/financeiro/lancamentos",
      "/contador/abc",
      "/comecar",
      "/agendar/studio-ana",
      "/entrar",
      "/cadastro",
      "/api/ical/abc",
    ]) {
      expect(rotaDinamica(caminho), caminho).toBe(true);
    }
  });

  it("a página de vendas e as de conteúdo são estáticas", () => {
    for (const caminho of ["/", "/precos", "/para-saloes", "/termos", "/privacidade"]) {
      expect(rotaDinamica(caminho), caminho).toBe(false);
    }
  });

  it("caminho parecido não conta como dinâmico", () => {
    expect(rotaDinamica("/aplicativo")).toBe(false);
    expect(rotaDinamica("/contadores")).toBe(false);
  });

  it("a estática não usa nonce, e a dinâmica não usa unsafe-inline no script", () => {
    const estatica = montarCSP({ nonce: "n", desenvolvimento: false, dinamica: false });
    const dinamica = montarCSP({ nonce: "n", desenvolvimento: false, dinamica: true });

    expect(diretiva(estatica, "script-src")).toBe("'self' 'unsafe-inline'");
    expect(diretiva(dinamica, "script-src")).not.toContain("unsafe-inline");
    expect(diretiva(dinamica, "script-src")).toContain("'nonce-n'");
  });
});
