"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { NATUREZAS } from "@/lib/custos/calculo";
import { carregarMovimentoDoPeriodo, janelaDeSeisMeses } from "@/lib/custos/resumo";
import {
  motivoDoQueSobrou,
  planejarSugestao,
  resumoDaSugestao,
  type MotivoSemIa,
} from "@/lib/custos/sugestao";
import {
  classificarComFranquia,
  descricoesAnteriores,
  nomesParaOcultar,
  TAMANHO_DO_LOTE,
} from "@/lib/ia/classificar-custos";
import { iaConfigurada } from "@/lib/ia/cliente";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual, garantirEscrita, usuarioAtual } from "@/lib/supabase/sessao";

export type Resposta<T = undefined> = { erro?: string; aviso?: string; dados?: T };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Lotes por clique: três lotes de 60 em paralelo cabem folgados no maxDuration da página. */
const LOTES_POR_VEZ = 3;

async function exigirDono() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return { erro: "Empresa não encontrada.", vinculo: null };
  if (vinculo.papel !== "dono") return { erro: "Só o dono classifica os custos.", vinculo: null };
  const bloqueio = garantirEscrita(vinculo);
  if (bloqueio) return { erro: bloqueio, vinculo: null };
  return { erro: undefined, vinculo };
}

function limpar() {
  revalidatePath("/app/financeiro/custos");
}

function traduzirErro(mensagem: string) {
  if (mensagem.includes("Só despesas")) {
    return "Só despesas da empresa (fora a retirada do dono) têm classificação de custo.";
  }
  return "Não foi possível salvar a classificação. Tente de novo.";
}

const esquemaNatureza = z.object({
  transacaoId: z.uuid(),
  natureza: z.enum([...NATUREZAS, "padrao"]),
});

/**
 * O dono corrige a natureza de um lançamento (grava a exceção como 'dono') ou
 * volta ao padrão da categoria (apaga a exceção, seja da IA ou dele mesmo).
 */
export async function definirNaturezaDoLancamento(
  entrada: z.input<typeof esquemaNatureza>,
): Promise<Resposta> {
  const validado = esquemaNatureza.safeParse(entrada);
  if (!validado.success) return { erro: "Escolha uma classificação válida." };
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };

  const supabase = await createClient();
  const { transacaoId, natureza } = validado.data;

  if (natureza === "padrao") {
    const { error } = await supabase
      .from("transaction_cost_overrides")
      .delete()
      .eq("organization_id", vinculo.empresa.id)
      .eq("transaction_id", transacaoId);
    if (error) return { erro: traduzirErro(error.message) };
    limpar();
    return { aviso: "O lançamento voltou a seguir a categoria." };
  }

  const { error } = await supabase.from("transaction_cost_overrides").upsert(
    {
      transaction_id: transacaoId,
      organization_id: vinculo.empresa.id,
      cost_behavior: natureza,
      source: "dono",
      reason: null,
    },
    { onConflict: "transaction_id" },
  );
  if (error) return { erro: traduzirErro(error.message) };
  limpar();
  return { aviso: "Classificação salva." };
}

/**
 * "Sugerir classificação": para as despesas pagas no mês sem exceção e cuja
 * categoria não tem comportamento, aplica as regras e manda o resto à IA
 * (se configurada e com franquia). Nunca sobrescreve uma exceção existente —
 * em especial a do dono.
 */
export async function sugerirClassificacao(mes: string): Promise<Resposta> {
  if (!MES.test(mes)) return { erro: "Mês inválido." };
  const { erro, vinculo } = await exigirDono();
  if (erro || !vinculo) return { erro };
  const empresa = vinculo.empresa;
  const supabase = await createClient();

  let movimento;
  try {
    const { de, ate } = janelaDeSeisMeses(mes);
    movimento = await carregarMovimentoDoPeriodo(supabase, empresa.id, de, ate);
  } catch {
    return { erro: "Não foi possível ler as despesas do mês." };
  }

  const plano = planejarSugestao({ empresaId: empresa.id, mes, despesas: movimento.despesas });

  // ignoreDuplicates = "on conflict do nothing": se o dono (ou outra rodada)
  // classificou no meio do caminho, a exceção dele fica.
  if (plano.porRegra.length > 0) {
    const { error } = await supabase
      .from("transaction_cost_overrides")
      .upsert(plano.porRegra, { onConflict: "transaction_id", ignoreDuplicates: true });
    if (error) return { erro: traduzirErro(error.message) };
  }

  let porIa = 0;
  let recusadas = 0;
  let semIa = plano.paraIa.length;
  let motivoSemIa: MotivoSemIa | null = null;
  let erroDaIa: string | null = null;

  if (plano.paraIa.length > 0) {
    if (!iaConfigurada()) {
      motivoSemIa = "nao_configurada";
    } else {
      // Sem a lista de nomes a ocultar, nenhuma descrição sai do servidor.
      let nomes: string[] | null = null;
      const usuario = await usuarioAtual();
      try {
        const clientesLigados = movimento.despesas.flatMap((d) => (d.clienteId ? [d.clienteId] : []));
        nomes = await nomesParaOcultar(supabase, empresa.id, clientesLigados);
      } catch {
        erroDaIa = "Não foi possível preparar as despesas para a IA.";
      }

      if (!usuario) erroDaIa ??= "Sessão expirada. Entre de novo.";

      if (nomes && usuario && !erroDaIa) {
        const resultado = await classificarComFranquia({
          supabase,
          empresa,
          userId: usuario.id,
          despesas: plano.paraIa,
          maximo: TAMANHO_DO_LOTE * LOTES_POR_VEZ,
          anteriores: descricoesAnteriores(movimento.despesas, mes),
          nomes,
        });
        erroDaIa = resultado.erro;
        recusadas = resultado.recusadas.length;

        if (resultado.sugestoes.length > 0) {
          const { error } = await supabase.from("transaction_cost_overrides").upsert(
            resultado.sugestoes.map((sugestao) => ({
              transaction_id: sugestao.transacaoId,
              organization_id: empresa.id,
              cost_behavior: sugestao.natureza,
              source: "ia",
              reason: sugestao.motivo,
            })),
            { onConflict: "transaction_id", ignoreDuplicates: true },
          );
          if (error) erroDaIa ??= traduzirErro(error.message);
          else porIa = resultado.sugestoes.length;
        }

        semIa = plano.paraIa.length - porIa - recusadas;
        if (semIa > 0) {
          motivoSemIa = motivoDoQueSobrou({
            erroDaIa,
            enviados: resultado.enviados,
            total: plano.paraIa.length,
            limitadoPelaFranquia: resultado.limitadoPelaFranquia,
            interrompido: resultado.interrompido,
          });
        }
      } else {
        motivoSemIa = "erro";
      }
    }
  }

  if (plano.porRegra.length > 0 || porIa > 0) limpar();

  const frase = resumoDaSugestao({ porRegra: plano.porRegra.length, porIa, semIa, motivoSemIa, recusadas });
  if (erroDaIa && porIa === 0 && plano.porRegra.length === 0 && recusadas === 0) return { erro: erroDaIa };
  return { aviso: erroDaIa ? `${frase} ${erroDaIa}` : frase };
}
