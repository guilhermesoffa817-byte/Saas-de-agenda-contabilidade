/**
 * Quem é o Alicerce, do lado de quem vende: nome, documento, cidade e os
 * e-mails institucionais. Fica tudo num lugar só para não divergir entre a
 * página de vendas, o rodapé, os termos e a política de privacidade.
 *
 * Aceita **CPF ou CNPJ**: dá para começar como pessoa física e virar empresa
 * depois mexendo só neste arquivo. O que a lei exige é identificar quem está
 * do outro lado do contrato — e isso um CPF faz.
 *
 * [EXEMPLO] — trocar por dados reais antes de cobrar do primeiro cliente.
 */

export type TipoDePessoa = "fisica" | "juridica";

export const IDENTIDADE = {
  /** Como você assina o contrato: seu nome completo, ou a razão social. */
  nome: "[EXEMPLO] Seu Nome Completo",
  tipo: "fisica" as TipoDePessoa,
  /** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00), como for o caso. */
  documento: "[EXEMPLO] 000.000.000-00",
  cidade: "Cuiabá",
  estado: "MT",
} as const;

export const ENCARREGADO_DE_DADOS = "privacidade@alicerce.com.br";
export const SUPORTE = "suporte@alicerce.com.br";
export const CONTATO = "contato@alicerce.com.br";

/** "CPF" ou "CNPJ", conforme o tipo — para não escrever o rótulo errado na tela. */
export function rotuloDoDocumento(tipo: TipoDePessoa = IDENTIDADE.tipo) {
  return tipo === "fisica" ? "CPF" : "CNPJ";
}

/** Linha de identificação, do jeito que aparece no rodapé e nos documentos. */
export function linhaDeIdentificacao() {
  const partes = [
    IDENTIDADE.nome,
    `${rotuloDoDocumento()} ${IDENTIDADE.documento}`,
    `${IDENTIDADE.cidade}, ${IDENTIDADE.estado}`,
    CONTATO,
  ];
  return partes.join(" · ");
}
