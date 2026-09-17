// src/lib/fiscal/constantes.ts
// Revisar todo ano. Fonte: gov.br/memp ("Teto do MEI"), consultado em set/2026.
// O PLP 186/2026 propõe R$ 110 mil (2027) e R$ 140 mil (2028) — ainda NÃO aprovado.
export const LIMITE_MEI_ANUAL_CENTS = 81_000_00; // R$ 81.000,00
export const LIMITE_MEI_POR_MES_CENTS = 6_750_00; // R$ 6.750,00 por mês de atividade no ano de abertura
export const ALERTAS_LIMITE_MEI = [0.7, 0.9] as const;
