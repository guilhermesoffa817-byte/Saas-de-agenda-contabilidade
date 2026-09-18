"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";
import { permiteNotaFiscal } from "@/lib/planos";
import { nfseConfigurada, pendenciasParaEmitir, provedorDeNota } from "@/lib/nfse";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

/**
 * Emissão de NFS-e a partir de um recebimento já registrado.
 *
 * Três recusas antes de falar com o provedor, porque nota errada custa caro:
 * o plano precisa ter NFS-e, o provedor precisa estar contratado e os códigos
 * de tributação precisam estar configurados pelo contador. O Alicerce não
 * calcula imposto nenhum — ele repassa o que foi configurado.
 */
export async function emitirNotaFiscal(lancamentoId: string): Promise<Resposta> {
  const { vinculo } = await empresaAtual();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };

  if (vinculo.papel !== "dono") return { erro: "Só o dono emite nota fiscal." };

  if (!permiteNotaFiscal(vinculo.empresa.plan)) {
    return { erro: "A emissão de NFS-e é do plano Negócio. Troque de plano para liberar." };
  }
  if (!nfseConfigurada()) {
    return {
      erro: "A emissão de NFS-e ainda não está ligada nesta instalação. Fale com o suporte.",
    };
  }

  const supabase = await createClient();
  const { data: lancamento } = await supabase
    .from("transactions")
    .select(
      "id, organization_id, kind, description, amount_cents, competence_date, payer_type, nota_fiscal_emitida, appointment_id, clients(name, document)",
    )
    .eq("id", lancamentoId)
    .maybeSingle();

  if (!lancamento) return { erro: "Lançamento não encontrado." };
  if (lancamento.kind !== "receita") return { erro: "Só recebimento vira nota de serviço." };
  if (lancamento.nota_fiscal_emitida) return { aviso: "Esse recebimento já tem nota emitida." };

  // O código de tributação vem do serviço do atendimento, configurado pelo contador.
  const codigos = await codigosDoLancamento(supabase, lancamento.appointment_id);

  const empresa = vinculo.empresa;
  const prestador = {
    razaoSocial: empresa.name,
    documento: (empresa.document ?? "").replace(/\D/g, ""),
    cidade: empresa.city,
    estado: empresa.state,
  };

  const faltando = pendenciasParaEmitir({
    prestador,
    codigos,
    valorCents: lancamento.amount_cents,
  });
  if (faltando.length > 0) {
    return { erro: `Antes de emitir, falta: ${faltando.join(", ")}.` };
  }

  const cliente = umCliente(lancamento.clients);
  const provedor = provedorDeNota();

  // A linha da nota nasce antes do envio: se a resposta se perder, o webhook
  // ainda acha a nota pela referência.
  const admin = createAdminClient();
  const { data: nota, error: erroDaNota } = await admin
    .from("invoices")
    .insert({
      organization_id: empresa.id,
      transaction_id: lancamento.id,
      provider: provedor.nome,
      provider_invoice_id: lancamento.id,
      status: "processando",
    })
    .select("id")
    .single();

  if (erroDaNota || !nota) return { erro: erroDaNota?.message ?? "Não conseguimos abrir a nota." };

  try {
    const enviada = await provedor.emitir({
      referencia: lancamento.id,
      valorCents: lancamento.amount_cents,
      competencia: lancamento.competence_date,
      prestador,
      tomador: {
        nome: cliente?.name ?? "Consumidor não identificado",
        documento: cliente?.document ?? null,
        tipo: (lancamento.payer_type as "pf" | "pj" | null) ?? null,
      },
      codigos,
      descricaoDoServico: lancamento.description,
    });

    await admin
      .from("invoices")
      .update({
        status: enviada.status === "erro" ? "erro" : enviada.status,
        numero: enviada.numero ?? null,
        codigo_verificacao: enviada.codigoVerificacao ?? null,
        error: enviada.erro ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", nota.id);

    if (enviada.status === "emitida") {
      await admin
        .from("transactions")
        .update({ nota_fiscal_emitida: true })
        .eq("id", lancamento.id);
    }

    limpar();

    if (enviada.status === "erro") {
      return { erro: enviada.erro ?? "A prefeitura recusou a nota." };
    }
    return {
      aviso:
        enviada.status === "emitida"
          ? "Nota emitida."
          : "Nota enviada. A prefeitura costuma responder em alguns minutos.",
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao falar com o provedor.";
    await admin
      .from("invoices")
      .update({ status: "erro", error: mensagem.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", nota.id);
    limpar();
    return { erro: mensagem };
  }
}

/** Códigos de tributação do serviço do atendimento que gerou o recebimento. */
async function codigosDoLancamento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  atendimentoId: string | null,
) {
  const vazio = { lc116: null, codigoMunicipal: null, cnae: null, descricao: null };
  if (!atendimentoId) return vazio;

  const { data: atendimento } = await supabase
    .from("appointments")
    .select("service_id")
    .eq("id", atendimentoId)
    .maybeSingle();

  if (!atendimento) return vazio;

  const { data: codigos } = await supabase
    .from("service_tax_codes")
    .select("lc116_code, city_service_code, cnae, description")
    .eq("service_id", atendimento.service_id)
    .maybeSingle();

  if (!codigos) return vazio;
  return {
    lc116: codigos.lc116_code,
    codigoMunicipal: codigos.city_service_code,
    cnae: codigos.cnae,
    descricao: codigos.description,
  };
}

function umCliente(relacao: { name: string; document: string | null } | { name: string; document: string | null }[] | null) {
  if (!relacao) return null;
  return Array.isArray(relacao) ? (relacao[0] ?? null) : relacao;
}

function limpar() {
  revalidatePath("/app/financeiro");
  revalidatePath("/app/financeiro/lancamentos");
}
