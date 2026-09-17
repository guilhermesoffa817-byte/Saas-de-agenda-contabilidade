"use server";

import { endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { revalidatePath } from "next/cache";

import { carregarLancamentosParaRelatorio } from "@/app/(app)/app/relatorios/dados";
import { enviarEmail, moldura } from "@/lib/email";
import { formatarBRL } from "@/lib/money";
import { montarDRE } from "@/lib/reports/dre";
import { tabelaParaCSV } from "@/lib/reports/csv";
import { tabelaParaPDF } from "@/lib/reports/pdf/gerar";
import { tabelaParaExcel } from "@/lib/reports/xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";
import { enderecoDoSite } from "@/lib/url";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const SETE_DIAS_EM_SEGUNDOS = 60 * 60 * 24 * 7;

/**
 * Fechar o mês em um clique: trava o mês no banco, gera o pacote de relatórios
 * (PDF, Excel e CSV) no bucket privado e avisa o contador por e-mail com um link
 * que expira em 7 dias.
 */
export async function fecharMes(mes: string): Promise<Resposta<{ pacote: string | null }>> {
  if (!MES.test(mes)) return { erro: "Mês inválido." };

  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono fecha o mês." };

  const empresa = vinculo.empresa;
  const supabase = await createClient();

  const { error } = await supabase.rpc("fechar_mes", {
    p_org: empresa.id,
    p_mes: `${mes}-01`,
  });
  if (error) return { erro: error.message };

  // Pacote de relatórios do mês fechado.
  const de = `${mes}-01`;
  const ate = format(endOfMonth(new Date(`${de}T12:00:00Z`)), "yyyy-MM-dd");
  const periodo = format(new Date(`${de}T12:00:00Z`), "MMMM 'de' yyyy", { locale: ptBR });

  const lancamentos = await carregarLancamentosParaRelatorio({
    empresaId: empresa.id,
    de,
    ate,
    por: "pagamento",
  });
  const tabela = montarDRE({ lancamentos, periodo });

  const geradoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: empresa.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const pasta = `${empresa.id}/${mes}`;
  let caminhoDoPdf: string | null = null;

  try {
    const [pdf, excel] = await Promise.all([
      tabelaParaPDF(tabela, { nome: empresa.name, documento: empresa.document }, geradoEm),
      tabelaParaExcel(tabela),
    ]);
    const csv = tabelaParaCSV(tabela);

    const arquivos: { caminho: string; conteudo: Uint8Array | string; tipo: string }[] = [
      { caminho: `${pasta}/resumo-${mes}.pdf`, conteudo: new Uint8Array(pdf), tipo: "application/pdf" },
      {
        caminho: `${pasta}/resumo-${mes}.xlsx`,
        conteudo: new Uint8Array(excel),
        tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { caminho: `${pasta}/resumo-${mes}.csv`, conteudo: csv, tipo: "text/csv; charset=utf-8" },
    ];

    for (const arquivo of arquivos) {
      const { error: erroUpload } = await supabase.storage
        .from("fechamentos")
        .upload(arquivo.caminho, arquivo.conteudo, {
          contentType: arquivo.tipo,
          upsert: true,
        });
      if (erroUpload) throw new Error(erroUpload.message);
    }

    caminhoDoPdf = arquivos[0].caminho;

    await supabase
      .from("monthly_closings")
      .update({ package_path: pasta })
      .eq("organization_id", empresa.id)
      .eq("month", de);
  } catch (erro) {
    // O mês continua fechado mesmo se o pacote falhar; o dono pode gerar de novo.
    limpar();
    return {
      aviso: `Mês fechado. O pacote de relatórios não pôde ser gerado agora (${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }). Você ainda pode baixar os relatórios na tela de Relatórios.`,
      dados: { pacote: null },
    };
  }

  // Aviso ao contador, com link temporário.
  const admin = createAdminClient();
  const { data: contadores } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", empresa.id)
    .eq("role", "contador");

  const { data: link } = caminhoDoPdf
    ? await admin.storage.from("fechamentos").createSignedUrl(caminhoDoPdf, SETE_DIAS_EM_SEGUNDOS)
    : { data: null };

  const enviados: string[] = [];
  for (const contador of contadores ?? []) {
    const { data } = await admin.auth.admin.getUserById(contador.user_id);
    const email = data.user?.email;
    if (!email) continue;

    const envio = await enviarEmail({
      para: email,
      assunto: `${empresa.name} fechou ${periodo}`,
      texto: `O mês de ${periodo} de ${empresa.name} foi fechado. Portal: ${await enderecoDoSite()}/contador`,
      html: moldura({
        titulo: `${empresa.name} fechou ${periodo}`,
        corpo: `<p>Os relatórios do mês estão prontos no portal do contador.</p>
                <p>Receitas: ${formatarBRL(tabela.resumo?.[0]?.valorCents ?? 0)} · Resultado do mês: ${formatarBRL(
                  tabela.resumo?.find((item) => item.destaque)?.valorCents ?? 0,
                )}</p>
                <p>O link direto do PDF vale por 7 dias.</p>`,
        botao: link?.signedUrl
          ? { texto: "Baixar o resumo do mês", url: link.signedUrl }
          : { texto: "Abrir o portal do contador", url: `${await enderecoDoSite()}/contador` },
      }),
    });
    if (envio.enviado) enviados.push(email);
  }

  await admin.from("audit_logs").insert({
    organization_id: empresa.id,
    user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
    action: "fechamento.concluido",
    metadata: { mes, pacote: pasta, avisados: enviados.join(", ") },
  });

  limpar();

  return {
    aviso:
      enviados.length > 0
        ? `Mês fechado e pacote enviado para ${enviados.join(", ")}.`
        : "Mês fechado e pacote gerado. Nenhum contador convidado ainda — convide em Configurações.",
    dados: { pacote: pasta },
  };
}

export async function reabrirMes(mes: string): Promise<Resposta> {
  if (!MES.test(mes)) return { erro: "Mês inválido." };

  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (vinculo.papel !== "dono") return { erro: "Só o dono reabre o mês." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reabrir_mes", {
    p_org: vinculo.empresa.id,
    p_mes: `${mes}-01`,
  });
  if (error) return { erro: error.message };

  limpar();
  return { aviso: "Mês reaberto. A reabertura fica registrada na auditoria." };
}

/** Link temporário para baixar um arquivo do pacote de fechamento. */
export async function linkDoPacote(caminho: string): Promise<Resposta<{ url: string }>> {
  const { vinculos } = await empresaAtual();
  const daEmpresa = vinculos.some((item) => caminho.startsWith(`${item.empresa.id}/`));
  if (!daEmpresa) return { erro: "Pacote de outra empresa." };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("fechamentos")
    .createSignedUrl(caminho, 60 * 10);

  if (error || !data) return { erro: "Não conseguimos abrir o pacote." };
  return { dados: { url: data.signedUrl } };
}

function limpar() {
  revalidatePath("/app/financeiro");
  revalidatePath("/app/financeiro/fechamento");
  revalidatePath("/app/financeiro/lancamentos");
  revalidatePath("/contador");
}
