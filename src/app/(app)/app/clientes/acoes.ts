"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";
import { normalizarTelefone } from "@/lib/telefone";
import { esquemaCliente, type ClienteInput } from "@/lib/validacao/agenda";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

export async function salvarCliente(
  entrada: ClienteInput & { clienteId?: string },
): Promise<Resposta<{ clienteId: string }>> {
  const validado = esquemaCliente.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados do cliente." };
  }

  const { vinculo } = await empresaAtual();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };

  const dados = validado.data;
  const telefone = dados.telefone ? normalizarTelefone(dados.telefone) : null;
  if (dados.telefone && !telefone) {
    return { erro: "Digite o WhatsApp com DDD, por exemplo (66) 99999-9999." };
  }

  const supabase = await createClient();

  // A data do consentimento é gravada junto com o opt-in (exigência da LGPD).
  const registro = {
    organization_id: vinculo.empresa.id,
    name: dados.nome,
    phone_e164: telefone,
    email: dados.email || null,
    document: dados.documento ? dados.documento.replace(/\D/g, "") : null,
    payer_type: dados.tipoPagador,
    whatsapp_opt_in: dados.aceitaWhatsApp,
    whatsapp_opt_in_at: dados.aceitaWhatsApp ? new Date().toISOString() : null,
    notes: dados.anotacoes || null,
  };

  if (entrada.clienteId) {
    const { error } = await supabase
      .from("clients")
      .update(registro)
      .eq("organization_id", vinculo.empresa.id)
      .eq("id", entrada.clienteId);
    if (error) {
      if (error.code === "23505") return { erro: "Já existe um cliente com esse WhatsApp." };
      return { erro: error.message };
    }
    revalidatePath("/app/clientes");
    return { dados: { clienteId: entrada.clienteId }, aviso: "Cliente atualizado." };
  }

  const { data, error } = await supabase.from("clients").insert(registro).select("id").single();
  if (error) {
    if (error.code === "23505") return { erro: "Já existe um cliente com esse WhatsApp." };
    return { erro: error.message };
  }

  revalidatePath("/app/clientes");
  return { dados: { clienteId: data.id }, aviso: "Cliente cadastrado." };
}

/** Exclusão reversível: o histórico de atendimentos continua valendo para o financeiro. */
export async function arquivarCliente(clienteId: string): Promise<Resposta> {
  const { vinculo } = await empresaAtual();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", clienteId);

  if (error) return { erro: error.message };
  revalidatePath("/app/clientes");
  return { aviso: "Cliente arquivado." };
}

/**
 * Apaga os dados pessoais do cliente a pedido dele (LGPD), mantendo o histórico
 * financeiro que o negócio é obrigado a guardar. Não dá para desfazer.
 */
export async function apagarDadosDoCliente(clienteId: string): Promise<Resposta> {
  const { vinculo } = await empresaAtual();
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio || !vinculo) return { erro: bloqueio ?? "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono apaga os dados de um cliente." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("anonimizar_cliente", { p_cliente: clienteId });
  if (error) return { erro: error.message };

  revalidatePath("/app/clientes");
  revalidatePath("/app/agenda");
  return {
    aviso:
      "Dados pessoais apagados. Os atendimentos e os lançamentos continuam, sem identificar a pessoa.",
  };
}

/**
 * Registra quem abriu as anotações de um cliente. Anotação é o campo mais
 * sensível do sistema, e quem olhou fica no log.
 */
export async function registrarLeituraDeAnotacao(clienteId: string): Promise<Resposta> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_leitura_de_anotacao", { p_cliente: clienteId });
  if (error) return { erro: error.message };
  return {};
}
