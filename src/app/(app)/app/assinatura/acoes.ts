"use server";

import { addDays, format } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  asaasConfigurado,
  atualizarAssinaturaAsaas,
  cancelarAssinaturaAsaas,
  cobrancasDaAssinatura,
  criarAssinaturaAsaas,
  criarClienteAsaas,
} from "@/lib/asaas";
import { ORDEM_DOS_PLANOS, PLANOS, precoDoCiclo, type ChaveDePlano } from "@/lib/planos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

const Escolha = z.object({
  plano: z.enum(ORDEM_DOS_PLANOS as [ChaveDePlano, ...ChaveDePlano[]]),
  ciclo: z.enum(["mensal", "anual"]),
});

const SEM_CONFIGURACAO =
  "A cobrança ainda não está configurada. Preencha ASAAS_API_KEY no .env.local (use a conta sandbox para testar).";

async function empresaDoDono() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." as const, vinculo: null };
  if (vinculo.papel !== "dono") {
    return { erro: "Só o dono cuida da assinatura." as const, vinculo: null };
  }
  return { erro: undefined, vinculo };
}

/**
 * Assinar: garante o cliente no Asaas, cria a assinatura e guarda o plano como
 * pendente. Quem aplica o plano é o webhook, quando o pagamento é confirmado.
 */
export async function assinar(
  entrada: z.input<typeof Escolha>,
): Promise<Resposta<{ linkDePagamento: string | null }>> {
  if (!asaasConfigurado) return { erro: SEM_CONFIGURACAO };

  const validado = Escolha.safeParse(entrada);
  if (!validado.success) return { erro: "Escolha um plano e o ciclo de cobrança." };

  const { erro, vinculo } = await empresaDoDono();
  if (erro || !vinculo) return { erro };

  const empresa = vinculo.empresa;
  const documento = empresa.document?.replace(/\D/g, "") ?? "";
  if (documento.length !== 11 && documento.length !== 14) {
    return {
      erro: "Antes de assinar, preencha o CPF ou CNPJ do negócio em Configurações — a cobrança exige.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const plano = validado.data.plano;
  const ciclo = validado.data.ciclo;
  const valorCents = precoDoCiclo(plano, ciclo);

  try {
    let clienteId = empresa.asaas_customer_id;

    if (!clienteId) {
      const cliente = await criarClienteAsaas({
        nome: empresa.name,
        documento,
        email: user?.email,
        cidade: empresa.city,
      });
      clienteId = cliente.id;
      await admin
        .from("organizations")
        .update({ asaas_customer_id: clienteId })
        .eq("id", empresa.id);
    }

    // Já existe assinatura: é troca de plano, não uma nova.
    if (empresa.asaas_subscription_id) {
      await atualizarAssinaturaAsaas(empresa.asaas_subscription_id, {
        valorCents,
        ciclo,
        descricao: `Alicerce ${PLANOS[plano].nome} (${ciclo})`,
      });

      await admin
        .from("organizations")
        .update({ pending_plan: plano, billing_cycle: ciclo })
        .eq("id", empresa.id);

      const cobrancas = await cobrancasDaAssinatura(empresa.asaas_subscription_id);
      revalidatePath("/app/assinatura");
      return {
        aviso: "Plano trocado. Ele passa a valer quando a próxima cobrança for confirmada.",
        dados: { linkDePagamento: cobrancas[0]?.invoiceUrl ?? null },
      };
    }

    const assinatura = await criarAssinaturaAsaas({
      cliente: clienteId,
      valorCents,
      ciclo,
      descricao: `Alicerce ${PLANOS[plano].nome} (${ciclo})`,
      // Primeiro vencimento amanhã: dá tempo de pagar por Pix ou boleto.
      primeiroVencimento: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    });

    await admin
      .from("organizations")
      .update({
        asaas_subscription_id: assinatura.id,
        pending_plan: plano,
        billing_cycle: ciclo,
      })
      .eq("id", empresa.id);

    const cobrancas = await cobrancasDaAssinatura(assinatura.id);

    revalidatePath("/app/assinatura");
    revalidatePath("/app");
    return {
      aviso:
        "Assinatura criada. Pague a primeira cobrança e o plano é liberado assim que o Asaas confirmar.",
      dados: { linkDePagamento: cobrancas[0]?.invoiceUrl ?? null },
    };
  } catch (falha) {
    return {
      erro: `Não conseguimos falar com o Asaas agora: ${
        falha instanceof Error ? falha.message : "erro desconhecido"
      }`,
    };
  }
}

/** Cancelar na cara limpa: sem esconder o botão e sem apagar dados. */
export async function cancelarAssinatura(): Promise<Resposta> {
  const { erro, vinculo } = await empresaDoDono();
  if (erro || !vinculo) return { erro };

  const empresa = vinculo.empresa;
  const admin = createAdminClient();

  if (empresa.asaas_subscription_id && asaasConfigurado) {
    try {
      await cancelarAssinaturaAsaas(empresa.asaas_subscription_id);
    } catch (falha) {
      return {
        erro: `Não conseguimos cancelar no Asaas: ${
          falha instanceof Error ? falha.message : "erro desconhecido"
        }`,
      };
    }
  }

  await admin
    .from("organizations")
    .update({
      subscription_status: "canceled",
      canceled_at: new Date().toISOString(),
      pending_plan: null,
      asaas_subscription_id: null,
    })
    .eq("id", empresa.id);

  revalidatePath("/app/assinatura");
  revalidatePath("/app");
  return {
    aviso:
      "Assinatura cancelada. Seus dados continuam guardados e a exportação segue liberada — dá para voltar quando quiser.",
  };
}

/** Cobranças da assinatura, para a pessoa ver o que já pagou e o que falta. */
export async function historicoDeCobrancas(): Promise<
  Resposta<{ cobrancas: { id: string; status: string; valor: number; vencimento: string; link?: string }[] }>
> {
  const { erro, vinculo } = await empresaDoDono();
  if (erro || !vinculo) return { erro };
  if (!vinculo.empresa.asaas_subscription_id || !asaasConfigurado) {
    return { dados: { cobrancas: [] } };
  }

  try {
    const cobrancas = await cobrancasDaAssinatura(vinculo.empresa.asaas_subscription_id);
    return {
      dados: {
        cobrancas: cobrancas.map((cobranca) => ({
          id: cobranca.id,
          status: cobranca.status,
          valor: cobranca.value,
          vencimento: cobranca.dueDate,
          link: cobranca.invoiceUrl,
        })),
      },
    };
  } catch {
    return { dados: { cobrancas: [] } };
  }
}
