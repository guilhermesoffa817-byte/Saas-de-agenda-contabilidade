import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Junta o site público inteiro num arquivo .html que abre sem internet.
 *
 * Serve para mandar no WhatsApp, mostrar para alguém no celular sem sinal ou
 * guardar como registro de como o site está hoje. Não é o sistema rodando: o
 * JavaScript do React sai fora, então formulário não envia e acordeão não abre
 * — mas nada fica escondido, porque o conteúdo todo já está no HTML. A troca
 * mensal/anual dos preços é a exceção: ela volta a funcionar aqui, com um
 * punhado de linhas próprias no fim do arquivo.
 *
 * Precisa do servidor no ar:
 *   npm run build && npm start     (em outro terminal)
 *   npm run site:arquivo
 *
 * A captura é feita com navegador de verdade, e rolando cada página até o fim,
 * porque o tour e o gráfico só entram no HTML depois que aparecem na tela.
 */

const BASE = process.env.SITE_URL ?? "http://localhost:3000";
const DESTINO = "alicerce-site-completo.html";

const PAGINAS = [
  ["/", "index", "Página de vendas"],
  ["/precos", "precos", "Preços"],
  ["/para-saloes", "para-saloes", "Salões e barbearias"],
  ["/para-clinicas", "para-clinicas", "Clínicas e consultórios"],
  ["/para-personal", "para-personal", "Personal e terapeutas"],
  ["/para-contadores", "para-contadores", "Para contadores"],
  ["/entrar", "entrar", "Entrar"],
  ["/cadastro", "cadastro", "Criar conta"],
  ["/recuperar-senha", "recuperar-senha", "Recuperar senha"],
  ["/termos", "termos", "Termos de uso"],
  ["/privacidade", "privacidade", "Política de privacidade"],
];

/** Prefixo no id da página: a home já tem um `#precos` próprio, e colidiria. */
const idDaPagina = (nome) => `pg-${nome}`;

const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
const aba = await contexto.newPage();

const pasta = mkdtempSync(join(tmpdir(), "alicerce-"));
const baixados = new Map();

aba.on("response", async (resposta) => {
  const url = new URL(resposta.url());
  if (url.origin !== BASE || baixados.has(url.pathname)) return;
  if (!/\.(css|woff2)$/.test(url.pathname)) return;
  try {
    baixados.set(url.pathname, await resposta.body());
  } catch {
    /* recurso que já saiu de cena: ignora */
  }
});

const corpos = [];
for (const [rota, nome, titulo] of PAGINAS) {
  await aba.goto(BASE + rota, { waitUntil: "networkidle" });
  for (let i = 0; i < 40; i += 1) {
    await aba.mouse.wheel(0, 700);
    await aba.waitForTimeout(90);
  }
  await aba.waitForTimeout(1500);
  await aba.evaluate(() => window.scrollTo(0, 0));
  await aba.waitForTimeout(500);

  const html = await aba.content();
  const corpo = html
    .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<template[\s\S]*?<\/template>/g, "")
    .replace(/href="\/#([a-z-]+)"/g, 'href="#$1"')
    // Com ou sem `?plano=...`: o botão de cada plano aponta para a mesma página.
    .replace(/href="\/([a-z-]+)(\?[^"]*)?"/g, (_, destino) => `href="#${idDaPagina(destino)}"`)
    .replace(/href="\/"/g, `href="#${idDaPagina("index")}"`);

  corpos.push({ nome, titulo, corpo });
  console.log(`capturado ${rota}`);
}

const classesDoHtml = (await aba.evaluate(() => document.documentElement.className)) + " tema-papel";
await navegador.close();

// As fontes entram no CSS como base64, para o arquivo não depender de nada.
//
// Buscar só o que o navegador pediu não basta: ele baixa apenas os pesos que
// aquela visita usou, e os outros ficariam apontando para um arquivo que não
// existe mais. Então a lista sai do próprio CSS e cada fonte é buscada.
const arquivoCss = [...baixados.keys()].find((caminho) => caminho.endsWith(".css"));
let css = baixados.get(arquivoCss).toString("utf8");

const nomesDasFontes = [...new Set([...css.matchAll(/url\(\.\.\/media\/([^)]+\.woff2)\)/g)].map((m) => m[1]))];
const fontes = new Map();
for (const nome of nomesDasFontes) {
  const caminho = `/_next/static/media/${nome}`;
  if (baixados.has(caminho)) {
    fontes.set(nome, baixados.get(caminho));
    continue;
  }
  const resposta = await fetch(BASE + caminho);
  if (resposta.ok) fontes.set(nome, Buffer.from(await resposta.arrayBuffer()));
}
console.log(`fontes embutidas: ${fontes.size} de ${nomesDasFontes.length}`);

css = css.replace(/url\(\.\.\/media\/([^)]+\.woff2)\)/g, (original, nome) => {
  const dados = fontes.get(nome);
  if (!dados) return original;
  return `url(data:font/woff2;base64,${dados.toString("base64")})`;
});

const estiloDoArquivo = `
/* Uma página por vez, só com CSS: quem manda é o :target. */
.pagina { display: none }
.pagina:target { display: block }
body:not(:has(.pagina:target)) #${idDaPagina("index")} { display: block }

/* Índice deste arquivo. Não faz parte do site. */
#indice-do-arquivo {
  position: sticky; top: 0; z-index: 99999;
  display: flex; flex-wrap: wrap; gap: 2px; padding: 8px 10px;
  background: #0F3D2E; font: 500 12px/1.3 system-ui, sans-serif;
}
#indice-do-arquivo a { color: #FBF9F4; text-decoration: none; padding: 5px 9px; border-radius: 6px; white-space: nowrap }
#indice-do-arquivo a:hover, #indice-do-arquivo a:focus-visible { background: rgba(255,255,255,.16) }
#indice-do-arquivo strong { color: #B8872B; padding: 5px 4px 5px 0; letter-spacing: .04em }

/* Sem JavaScript não há o que revelar: tudo já aparece no lugar. */
.a-revelar, .hero-mockup { opacity: 1 !important; transform: none !important; animation: none !important }
`;

/**
 * O React não veio junto, então o botão mensal/anual ganha aqui o pouco que
 * precisa: mexer no pino, nos dois rótulos e nos preços da mesma seção. Os
 * valores dos dois ciclos já saíram prontos do servidor, nos `data-*`.
 */
const scriptDoArquivo = `
function aplicarCiclo(botao, anual) {
  botao.setAttribute("aria-checked", String(anual));
  var pino = botao.querySelector("[data-pino]");
  if (pino) pino.style.transform = anual ? "translateX(100%)" : "translateX(0%)";
  var mensal = botao.querySelector('[data-rotulo="mensal"]');
  var anualRotulo = botao.querySelector('[data-rotulo="anual"]');
  if (mensal) mensal.classList.toggle("text-primary-foreground", !anual);
  if (anualRotulo) anualRotulo.classList.toggle("text-primary-foreground", anual);

  var secao = botao.closest("[data-secao-precos]") || document;
  var ciclo = anual ? "anual" : "mensal";
  secao.querySelectorAll("[data-preco], [data-nota-preco]").forEach(function (alvo) {
    var texto = alvo.getAttribute("data-" + ciclo);
    if (texto) alvo.textContent = texto;
  });
}

document.querySelectorAll("[data-alternador-preco]").forEach(function (botao) {
  botao.addEventListener("click", function () {
    aplicarCiclo(botao, botao.getAttribute("aria-checked") !== "true");
  });
});
`;

const indice = corpos
  .map(({ nome, titulo }) => `<a href="#${idDaPagina(nome)}">${titulo}</a>`)
  .join("");

const secoes = corpos
  .map(
    ({ nome, titulo, corpo }) =>
      `<section class="pagina" id="${idDaPagina(nome)}" aria-label="${titulo}">${corpo}</section>`,
  )
  .join("");

writeFileSync(
  DESTINO,
  `<!doctype html>
<html lang="pt-BR" class="${classesDoHtml}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alicerce — o site inteiro em um arquivo</title>
<style>${css}</style>
<style>${estiloDoArquivo}</style>
</head>
<body class="tema-papel">
<nav id="indice-do-arquivo"><strong>ALICERCE</strong>${indice}</nav>
${secoes}
<script>${scriptDoArquivo}</script>
</body>
</html>
`,
);

const tamanho = (readFileSync(DESTINO).length / 1024 / 1024).toFixed(1);
console.log(`\n${DESTINO} — ${corpos.length} páginas, ${tamanho} MB. Abra com duplo clique.`);
void pasta;
