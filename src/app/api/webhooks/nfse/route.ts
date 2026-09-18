import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Webhook do provedor de NFS-e.
 *
 * O provedor avisa quando a prefeitura responde, o que pode levar minutos.
 * A entrega é "pelo menos uma vez": aplicar o mesmo resultado duas vezes tem de
 * dar no mesmo — por isso a escrita é pela função `aplicar_resultado_da_nota`,
 * que é idempotente e casa pela referência que mandamos na emissão.
 */
export async function POST(request: Request) {
  const token = process.env.NFSE_WEBHOOK_TOKEN;
  if (!token || request.headers.get("x-nfse-token") !== token) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let evento: {
    ref?: string;
    status?: string;
    numero?: string;
    codigo_verificacao?: string;
    caminho_xml_nota_fiscal?: string;
    caminho_danfse?: string;
    erros?: { mensagem?: string }[];
    mensagem?: string;
  };

  try {
    evento = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  if (!evento.ref) return NextResponse.json({ erro: "evento sem referência" }, { status: 400 });

  const status = traduzirStatus(evento.status);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("aplicar_resultado_da_nota", {
    p_provedor: process.env.NFSE_PROVIDER ?? "focus",
    p_id_no_provedor: evento.ref,
    p_status: status,
    p_numero: evento.numero ?? null,
    p_codigo: evento.codigo_verificacao ?? null,
    p_xml: evento.caminho_xml_nota_fiscal ?? null,
    p_pdf: evento.caminho_danfse ?? null,
    p_erro: evento.erros?.[0]?.mensagem ?? evento.mensagem ?? null,
  });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Nota que não é nossa devolve null: 200 mesmo assim, para o provedor não repetir.
  return NextResponse.json({ aplicado: Boolean(data) });
}

function traduzirStatus(status: string | undefined) {
  if (status === "autorizado") return "emitida";
  if (status === "cancelado") return "cancelada";
  if (status === "erro_autorizacao") return "erro";
  return "processando";
}
