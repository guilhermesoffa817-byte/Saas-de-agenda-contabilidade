/**
 * Limpa texto livre (descrição de lançamento, nome de categoria) antes de ir
 * para o provedor de IA — minimização da LGPD, art. 6º, III. Tira CPF, CNPJ,
 * e-mail, telefone e chave Pix aleatória, e corta em 200 caracteres.
 *
 * Valores ("R$ 1.234,56") e datas ("12/10/2026", "2026-10-12") passam intactos:
 * são o que a IA precisa para ajudar.
 */

/** Antes e depois do número não pode haver dígito, ponto nem vírgula colados. */
const SEM_DIGITO_ANTES = String.raw`(?<![\d.,/-])`;
const SEM_DIGITO_DEPOIS = String.raw`(?![\d]|[.,/-]\d)`;

const PADROES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[e-mail]"],
  // Chave Pix aleatória (formato UUID).
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[chave]"],
  [new RegExp(`${SEM_DIGITO_ANTES}\\d{2}\\.?\\d{3}\\.?\\d{3}\\/?\\d{4}-?\\d{2}${SEM_DIGITO_DEPOIS}`, "g"), "[cnpj]"],
  [new RegExp(`${SEM_DIGITO_ANTES}\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}${SEM_DIGITO_DEPOIS}`, "g"), "[cpf]"],
  // Telefone: +55 opcional, DDD com ou sem parênteses, 8 ou 9 dígitos. Sem ponto
  // nem vírgula no meio — é isso que deixa "R$ 1.234,56" em paz.
  [
    new RegExp(
      `${SEM_DIGITO_ANTES}(?:\\+?55[\\s-]?)?(?:\\(\\d{2}\\)|\\d{2})[\\s-]?(?:9[\\s-]?)?\\d{4}[\\s-]?\\d{4}${SEM_DIGITO_DEPOIS}`,
      "g",
    ),
    "[telefone]",
  ],
];

export const LIMITE_PARA_IA = 200;

export function sanitizarParaIA(texto: string) {
  return PADROES.reduce((t, [re, troca]) => t.replace(re, troca), texto).slice(0, LIMITE_PARA_IA);
}
