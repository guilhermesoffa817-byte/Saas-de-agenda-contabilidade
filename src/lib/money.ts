const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarBRL = (cents: number) => brl.format(cents / 100);

/** Sem o símbolo: para colunas de tabela e planilhas. */
export const formatarValor = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

// Campo de valor no estilo app de banco: a pessoa digita só números e o valor preenche da direita.
// "12990" -> 12990 centavos -> R$ 129,90. Sem ambiguidade entre ponto e vírgula.
export const digitosParaCentavos = (texto: string) => Number(texto.replace(/\D/g, "") || "0");
