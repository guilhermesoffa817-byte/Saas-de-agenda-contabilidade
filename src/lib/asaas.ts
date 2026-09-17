// src/lib/asaas.ts
import "server-only";

const BASE = process.env.ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

export async function asaas<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "alicerce-app",
      access_token: process.env.ASAAS_API_KEY!,
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Asaas ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const asaasConfigurado = Boolean(process.env.ASAAS_API_KEY);

export type ClienteAsaas = { id: string; name: string; email?: string; cpfCnpj: string };

export type AssinaturaAsaas = {
  id: string;
  customer: string;
  value: number;
  cycle: "MONTHLY" | "YEARLY";
  status: string;
  nextDueDate: string;
  billingType: string;
};

export type CobrancaAsaas = {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

/** Reais com duas casas, que é o formato que a API espera. */
export function centavosParaReais(cents: number) {
  return Number((cents / 100).toFixed(2));
}

export async function criarClienteAsaas(dados: {
  nome: string;
  documento: string;
  email?: string;
  telefone?: string;
  cidade?: string | null;
}) {
  return asaas<ClienteAsaas>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: dados.nome,
      cpfCnpj: dados.documento.replace(/\D/g, ""),
      email: dados.email,
      mobilePhone: dados.telefone?.replace(/\D/g, ""),
      notificationDisabled: false,
    }),
  });
}

export async function criarAssinaturaAsaas(dados: {
  cliente: string;
  valorCents: number;
  ciclo: "mensal" | "anual";
  descricao: string;
  primeiroVencimento: string;
}) {
  return asaas<AssinaturaAsaas>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: dados.cliente,
      // UNDEFINED deixa o cliente escolher Pix, boleto ou cartão na página do Asaas,
      // então o Alicerce nunca chega perto de dado de cartão.
      billingType: "UNDEFINED",
      value: centavosParaReais(dados.valorCents),
      nextDueDate: dados.primeiroVencimento,
      cycle: dados.ciclo === "anual" ? "YEARLY" : "MONTHLY",
      description: dados.descricao,
    }),
  });
}

export async function atualizarAssinaturaAsaas(
  assinatura: string,
  dados: { valorCents: number; ciclo: "mensal" | "anual"; descricao: string },
) {
  return asaas<AssinaturaAsaas>(`/subscriptions/${assinatura}`, {
    method: "POST",
    body: JSON.stringify({
      value: centavosParaReais(dados.valorCents),
      cycle: dados.ciclo === "anual" ? "YEARLY" : "MONTHLY",
      description: dados.descricao,
      updatePendingPayments: true,
    }),
  });
}

export async function cancelarAssinaturaAsaas(assinatura: string) {
  return asaas<{ deleted: boolean; id: string }>(`/subscriptions/${assinatura}`, {
    method: "DELETE",
  });
}

/** Cobranças de uma assinatura, da mais nova para a mais velha. */
export async function cobrancasDaAssinatura(assinatura: string) {
  const resposta = await asaas<{ data: CobrancaAsaas[] }>(
    `/subscriptions/${assinatura}/payments?limit=10`,
  );
  return resposta.data ?? [];
}
