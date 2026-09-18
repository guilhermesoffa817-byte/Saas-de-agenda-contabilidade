import { headers } from "next/headers";
import type { ReactNode } from "react";

import { ProvedorDeTema } from "./tema-cliente";

/**
 * Tema claro/escuro só onde ele existe: o sistema, as telas de conta e o portal
 * do contador. A página de vendas é sempre clara (`tema-papel`), então não
 * carrega nada disso.
 *
 * O nonce da CSP vem do proxy e é repassado ao script que o next-themes injeta
 * antes da primeira pintura — sem ele, a CSP estrita bloqueia o script e quem
 * escolheu o tema escuro vê um piscar claro.
 */
export async function Tema({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <ProvedorDeTema nonce={nonce}>{children}</ProvedorDeTema>;
}
