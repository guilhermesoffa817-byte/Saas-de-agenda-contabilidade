"use server";

import { revalidatePath } from "next/cache";

import { limiteDeProfissionais, planoDe } from "@/lib/planos";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita } from "@/lib/supabase/sessao";
import { esquemaServicoCadastro, type ServicoCadastroInput } from "@/lib/validacao/agenda";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

async function exigirDono() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." as const, vinculo: null };
  if (vinculo.papel !== "dono") {
    return { erro: "Só o dono altera os serviços." as const, vinculo: null };
  }
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio) return { erro: bloqueio, vinculo: null };
  return { erro: undefined, vinculo };
}

export async function salvarServico(
  entrada: ServicoCadastroInput & { servicoId?: string },
): Promise<Resposta<{ servicoId: string }>> {
  const validado = esquemaServicoCadastro.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os dados do serviço." };
  }

  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const registro = {
    organization_id: vinculo.empresa.id,
    name: validado.data.nome,
    duration_min: validado.data.duracao,
    buffer_min: validado.data.buffer,
    price_cents: validado.data.preco,
    bookable_online: validado.data.online,
    active: validado.data.ativo,
  };

  if (entrada.servicoId) {
    const { error } = await supabase
      .from("services")
      .update(registro)
      .eq("organization_id", vinculo.empresa.id)
      .eq("id", entrada.servicoId);
    if (error) return { erro: error.message };
    revalidatePath("/app/servicos");
    revalidatePath("/app");
    return { dados: { servicoId: entrada.servicoId }, aviso: "Serviço atualizado." };
  }

  const { data, error } = await supabase.from("services").insert(registro).select("id").single();
  if (error) return { erro: error.message };

  revalidatePath("/app/servicos");
  revalidatePath("/app");
  return { dados: { servicoId: data.id }, aviso: "Serviço cadastrado." };
}

export async function alternarServico(servicoId: string, ativo: boolean): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ active: ativo })
    .eq("organization_id", vinculo.empresa.id)
    .eq("id", servicoId);

  if (error) return { erro: error.message };
  revalidatePath("/app/servicos");
  revalidatePath("/app");
  return { aviso: ativo ? "Serviço ativado." : "Serviço desativado." };
}

/** Profissionais: cadastro simples, usado pela agenda e pelo expediente. */
export async function salvarProfissional(entrada: {
  profissionalId?: string;
  nome: string;
  cor: string;
  ativo: boolean;
}): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const nome = entrada.nome.trim();
  if (nome.length < 2) return { erro: "Digite o nome do profissional." };
  if (!/^#[0-9a-fA-F]{6}$/.test(entrada.cor)) return { erro: "Cor inválida." };

  const supabase = await createClient();

  // Limite do plano: conferido no servidor, nunca só na tela.
  if (!entrada.profissionalId && entrada.ativo) {
    const { count } = await supabase
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", vinculo.empresa.id)
      .eq("active", true);

    const limite = limiteDeProfissionais(vinculo.empresa.plan);
    if ((count ?? 0) >= limite) {
      const plano = planoDe(vinculo.empresa.plan);
      return {
        erro: `Seu plano${plano ? ` ${plano.nome}` : ""} permite ${limite} ${
          limite === 1 ? "profissional" : "profissionais"
        }. Troque de plano em Assinatura para cadastrar mais.`,
      };
    }
  }

  const registro = {
    organization_id: vinculo.empresa.id,
    name: nome,
    color: entrada.cor,
    active: entrada.ativo,
  };

  if (entrada.profissionalId) {
    const { error } = await supabase
      .from("professionals")
      .update(registro)
      .eq("organization_id", vinculo.empresa.id)
      .eq("id", entrada.profissionalId);
    if (error) return { erro: error.message };
  } else {
    const { error } = await supabase.from("professionals").insert(registro);
    if (error) return { erro: error.message };
  }

  revalidatePath("/app/servicos");
  revalidatePath("/app/agenda");
  return { aviso: "Profissional salvo." };
}

/** Expediente de um profissional: reescreve as faixas do dia da semana. */
export async function salvarExpedienteDoProfissional(entrada: {
  profissionalId: string;
  faixas: { dia: number; inicio: string; fim: string }[];
}): Promise<Resposta> {
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { error: erroApagar } = await supabase
    .from("working_hours")
    .delete()
    .eq("organization_id", vinculo.empresa.id)
    .eq("professional_id", entrada.profissionalId);
  if (erroApagar) return { erro: erroApagar.message };

  if (entrada.faixas.length) {
    const { error } = await supabase.from("working_hours").insert(
      entrada.faixas.map((faixa) => ({
        organization_id: vinculo.empresa.id,
        professional_id: entrada.profissionalId,
        weekday: faixa.dia,
        start_time: faixa.inicio,
        end_time: faixa.fim,
      })),
    );
    if (error) return { erro: error.message };
  }

  revalidatePath("/app/servicos");
  revalidatePath("/app/agenda");
  return { aviso: "Expediente salvo." };
}
