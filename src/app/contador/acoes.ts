"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { enviarEmail, moldura } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";
import { enderecoDoSite } from "@/lib/url";

export type Resposta = { erro?: string; aviso?: string };

const Codigo = z.object({
  categoriaId: z.uuid(),
  codigo: z.string().trim().max(30),
});

const Pedido = z.object({
  empresaId: z.uuid(),
  mensagem: z.string().trim().min(5, "Escreva o que está faltando.").max(400),
  lancamentoId: z.uuid().optional(),
});

/** O contador só pode mexer no código contábil — a função no banco garante isso. */
export async function definirCodigoContabil(entrada: z.input<typeof Codigo>): Promise<Resposta> {
  const validado = Codigo.safeParse(entrada);
  if (!validado.success) return { erro: "Código inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_codigo_contabil", {
    p_categoria: validado.data.categoriaId,
    p_codigo: validado.data.codigo,
  });
  if (error) return { erro: error.message };

  revalidatePath("/contador");
  revalidatePath("/app/financeiro/categorias");
  return { aviso: "Código contábil salvo." };
}

/** Pedir comprovante: cria o pedido e avisa o dono por e-mail. */
export async function pedirComprovante(entrada: z.input<typeof Pedido>): Promise<Resposta> {
  const validado = Pedido.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira a mensagem." };
  }

  const { vinculos } = await empresaAtual();
  const vinculo = vinculos.find((item) => item.empresa.id === validado.data.empresaId);
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (vinculo.papel !== "contador" && vinculo.papel !== "dono") {
    return { erro: "Sem permissão para pedir comprovante." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("document_requests").insert({
    organization_id: validado.data.empresaId,
    transaction_id: validado.data.lancamentoId ?? null,
    requested_by: user?.id ?? null,
    message: validado.data.mensagem,
  });
  if (error) return { erro: error.message };

  // Avisa os donos da empresa.
  const admin = createAdminClient();
  const { data: donos } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", validado.data.empresaId)
    .eq("role", "dono");

  const site = await enderecoDoSite();
  for (const dono of donos ?? []) {
    const { data } = await admin.auth.admin.getUserById(dono.user_id);
    if (!data.user?.email) continue;

    await enviarEmail({
      para: data.user.email,
      assunto: `Seu contador pediu um comprovante`,
      texto: `${validado.data.mensagem}\n\nAnexe em ${site}/app/financeiro/lancamentos`,
      html: moldura({
        titulo: "Seu contador pediu um comprovante",
        corpo: `<p>${validado.data.mensagem}</p><p>Anexe a foto do recibo no lançamento e ele aparece na hora para o escritório.</p>`,
        botao: { texto: "Abrir os lançamentos", url: `${site}/app/financeiro/lancamentos` },
      }),
    });
  }

  revalidatePath(`/contador/${validado.data.empresaId}`);
  return { aviso: "Pedido enviado ao dono do negócio." };
}

export async function marcarPedidoResolvido(pedidoId: string, empresaId: string): Promise<Resposta> {
  const { vinculos } = await empresaAtual();
  const vinculo = vinculos.find((item) => item.empresa.id === empresaId);
  if (!vinculo || vinculo.papel !== "dono") return { erro: "Só o dono resolve o pedido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("document_requests")
    .update({ resolved_at: new Date().toISOString() })
    .eq("organization_id", empresaId)
    .eq("id", pedidoId);

  if (error) return { erro: error.message };
  revalidatePath("/app/financeiro");
  return { aviso: "Pedido marcado como resolvido." };
}

const CodigosDoServico = z.object({
  empresaId: z.uuid(),
  servicoId: z.uuid(),
  lc116: z.string().trim().max(10),
  codigoMunicipal: z.string().trim().max(20),
  cnae: z.string().trim().max(10),
  descricao: z.string().trim().max(400),
});

/**
 * Códigos de tributação por serviço, para a NFS-e. Quem preenche é o contador,
 * que é quem entende — o Alicerce só repassa ao provedor o que está aqui, sem
 * calcular imposto nenhum.
 */
export async function salvarCodigosDeTributacao(
  entrada: z.input<typeof CodigosDoServico>,
): Promise<Resposta> {
  const validado = CodigosDoServico.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira os códigos." };
  }

  const { vinculos } = await empresaAtual();
  const podeConfigurar = vinculos.some(
    (item) =>
      item.empresa.id === validado.data.empresaId &&
      (item.papel === "contador" || item.papel === "dono"),
  );
  if (!podeConfigurar) return { erro: "Você não tem acesso a essa empresa." };

  const vazioVira = (valor: string) => (valor.length > 0 ? valor : null);
  const supabase = await createClient();

  const { error } = await supabase.from("service_tax_codes").upsert(
    {
      service_id: validado.data.servicoId,
      organization_id: validado.data.empresaId,
      lc116_code: vazioVira(validado.data.lc116),
      city_service_code: vazioVira(validado.data.codigoMunicipal),
      cnae: vazioVira(validado.data.cnae),
      description: vazioVira(validado.data.descricao),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "service_id" },
  );

  if (error) return { erro: error.message };

  revalidatePath(`/contador/${validado.data.empresaId}`);
  revalidatePath("/app/servicos");
  return { aviso: "Códigos de tributação salvos." };
}
