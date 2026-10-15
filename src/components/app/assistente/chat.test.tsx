import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { perguntaDoLink, TAMANHO_MAXIMO_DA_PERGUNTA } from "./protocolo";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/app/(app)/app/assistente/acoes", () => ({ apagarConversa: vi.fn() }));

const { ChatDoAssistente } = await import("./chat");

function renderizar(perguntaInicial: string | null) {
  return renderToStaticMarkup(
    <ChatDoAssistente
      conversaInicial={null}
      perguntaInicial={perguntaInicial}
      conversas={[]}
      cota={{ usados: 3, limite: 40 }}
      bloqueio={null}
      fuso="America/Sao_Paulo"
    />,
  );
}

const ler = (caminho: string) => readFileSync(caminho, "utf8");

describe("pergunta vinda do painel (?pergunta=)", () => {
  it("só aceita texto, sem espaços sobrando e no tamanho que a rota aceita", () => {
    expect(perguntaDoLink("  Quanto preciso faturar por mês?  ")).toBe("Quanto preciso faturar por mês?");
    expect(perguntaDoLink(["a", "b"])).toBeNull();
    expect(perguntaDoLink(undefined)).toBeNull();
    expect(perguntaDoLink("   ")).toBeNull();
    expect(perguntaDoLink("x".repeat(5000))).toHaveLength(TAMANHO_MAXIMO_DA_PERGUNTA);
  });

  it("preenche o campo da pergunta", () => {
    const html = renderizar("Quanto preciso faturar por mês para cobrir os custos fixos?");
    expect(html).toMatch(/<textarea[^>]*id="pergunta-assistente"[^>]*>Quanto preciso faturar por mês para cobrir os custos fixos\?<\/textarea>/);
  });

  it("sem pergunta, o campo vem vazio", () => {
    expect(renderizar(null)).toMatch(/<textarea[^>]*id="pergunta-assistente"[^>]*><\/textarea>/);
  });

  it("não envia sozinha (enviar gasta franquia): só o clique ou o Enter mandam", () => {
    const fonte = ler("src/components/app/assistente/chat.tsx");
    const efeito = fonte.slice(fonte.indexOf("useEffect(() => {\n    if (!perguntaInicial)"));
    const corpoDoEfeito = efeito.slice(0, efeito.indexOf("}, [perguntaInicial]);"));
    expect(corpoDoEfeito.length).toBeGreaterThan(0);
    expect(corpoDoEfeito).not.toMatch(/enviar\(|fetch\(/);
  });

  it("a página lê o parâmetro e o passa ao chat só numa conversa nova", () => {
    const pagina = ler("src/app/(app)/app/assistente/page.tsx");
    expect(pagina).toMatch(/pergunta\?: string \| string\[\]/);
    expect(pagina).toMatch(/perguntaInicial = conversa \? null : perguntaDoLink\(pergunta\)/);
    expect(pagina).toMatch(/perguntaInicial=\{perguntaInicial\}/);
  });
});

describe("acessibilidade do chat", () => {
  it("ao enviar (pergunta pronta ou Enviar), o foco vai para o campo antes de esperar a resposta", () => {
    // O botão acionado desmonta no mesmo render; sem isso o foco cai no <body>
    // durante toda a resposta.
    const fonte = ler("src/components/app/assistente/chat.tsx");
    const enviar = fonte.slice(fonte.indexOf("async function enviar("), fonte.indexOf("function aoEnviar("));
    const foco = enviar.indexOf("campo.current?.focus()");
    expect(foco).toBeGreaterThan(-1);
    expect(foco).toBeLessThan(enviar.indexOf("await fetch("));
    // O campo não fica desabilitado durante o envio (senão não recebe foco).
    expect(fonte).toMatch(/<Textarea[\s\S]*?disabled=\{travado\}[\s\S]*?\/>/);
  });

  it("todo spinner do assistente para com prefers-reduced-motion", () => {
    const pastas = ["src/components/app/assistente", "src/app/(app)/app/assistente"];
    const listar = (pasta: string): string[] =>
      readdirSync(pasta).flatMap((nome) => {
        const caminho = join(pasta, nome);
        if (statSync(caminho).isDirectory()) return listar(caminho);
        return /\.tsx$/.test(nome) && !/\.test\./.test(nome) ? [caminho] : [];
      });
    const arquivos = pastas.flatMap((pasta) => listar(pasta));
    const semFreio = arquivos.flatMap((caminho) =>
      (ler(caminho).match(/className="[^"]*animate-spin[^"]*"/g) ?? [])
        .filter((classe) => !classe.includes("motion-reduce:animate-none"))
        .map((classe) => `${caminho}: ${classe}`),
    );
    expect(arquivos.length).toBeGreaterThan(0);
    expect(semFreio).toEqual([]);
  });
});
