/**
 * Markdown simples da resposta do assistente, interpretado em estrutura (nunca
 * em HTML): parágrafos, títulos, listas, negrito e links https. Todo o resto
 * vira texto puro, que o React escapa. Nada de dangerouslySetInnerHTML.
 */

export type Trecho =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrito"; texto: string }
  | { tipo: "link"; texto: string; url: string };

export type Bloco =
  | { tipo: "paragrafo"; trechos: Trecho[] }
  | { tipo: "titulo"; trechos: Trecho[] }
  | { tipo: "lista"; ordenada: boolean; itens: Trecho[][] };

/** Só https, e só endereço que o navegador entende como tal. */
export function linkSeguro(url: string) {
  try {
    const endereco = new URL(url);
    return endereco.protocol === "https:" ? endereco.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(https:\/\/[^\s<>()[\]]+)/g;

export function interpretarTrechos(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  const texto = (t: string) => {
    if (!t) return;
    const ultimo = trechos.at(-1);
    if (ultimo?.tipo === "texto") ultimo.texto += t;
    else trechos.push({ tipo: "texto", texto: t });
  };

  let posicao = 0;
  for (const achado of linha.matchAll(INLINE)) {
    const inicio = achado.index ?? 0;
    texto(linha.slice(posicao, inicio));
    const [inteiro, negrito, rotulo, alvo, solto] = achado;
    if (negrito !== undefined) {
      trechos.push({ tipo: "negrito", texto: negrito });
    } else if (rotulo !== undefined && alvo !== undefined) {
      const url = linkSeguro(alvo);
      if (url) trechos.push({ tipo: "link", texto: rotulo, url });
      else texto(rotulo);
    } else if (solto !== undefined) {
      // Pontuação no fim da frase não faz parte do endereço.
      const limpo = solto.replace(/[.,;:!?]+$/, "");
      const url = linkSeguro(limpo);
      if (url) trechos.push({ tipo: "link", texto: limpo, url });
      else texto(limpo);
      texto(solto.slice(limpo.length));
    } else {
      texto(inteiro);
    }
    posicao = inicio + inteiro.length;
  }
  texto(linha.slice(posicao));
  return trechos;
}

const TITULO = /^\s{0,3}#{1,6}\s+(.*)$/;
const ITEM = /^\s*[-*•]\s+(.*)$/;
const ITEM_NUMERADO = /^\s*\d{1,3}[.)]\s+(.*)$/;
const SEPARADOR = /^\s*([-*_])(\s*\1){2,}\s*$/;

type ListaAberta = { ordenada: boolean; itens: string[] };

export function interpretarMarkdown(entrada: string): Bloco[] {
  const blocos: Bloco[] = [];
  const aberto: { paragrafo: string[]; lista: ListaAberta | null } = { paragrafo: [], lista: null };

  const fecharParagrafo = () => {
    if (aberto.paragrafo.length) {
      blocos.push({ tipo: "paragrafo", trechos: interpretarTrechos(aberto.paragrafo.join(" ")) });
    }
    aberto.paragrafo = [];
  };
  const fecharLista = () => {
    if (aberto.lista) {
      blocos.push({ tipo: "lista", ordenada: aberto.lista.ordenada, itens: aberto.lista.itens.map(interpretarTrechos) });
    }
    aberto.lista = null;
  };

  for (const linhaCrua of entrada.replace(/\r\n?/g, "\n").split("\n")) {
    const linha = linhaCrua.trimEnd();
    if (!linha.trim() || SEPARADOR.test(linha)) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const titulo = TITULO.exec(linha);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ tipo: "titulo", trechos: interpretarTrechos(titulo[1].replace(/#+\s*$/, "").trim()) });
      continue;
    }
    const item = ITEM.exec(linha) ?? ITEM_NUMERADO.exec(linha);
    if (item) {
      fecharParagrafo();
      const ordenada = !ITEM.test(linha);
      if (!aberto.lista || aberto.lista.ordenada !== ordenada) {
        fecharLista();
        aberto.lista = { ordenada, itens: [] };
      }
      aberto.lista.itens.push(item[1].trim());
      continue;
    }
    if (aberto.lista && /^\s+/.test(linha)) {
      // Continuação do item (linha recuada).
      aberto.lista.itens[aberto.lista.itens.length - 1] += ` ${linha.trim()}`;
      continue;
    }
    fecharLista();
    aberto.paragrafo.push(linha.trim());
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}
