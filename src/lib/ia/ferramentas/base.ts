import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths, format, subDays } from "date-fns";
import { z } from "zod";

import { instanteNaEmpresa } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import type { Database, Tables } from "@/lib/supabase/database.types";

/**
 * O que toda ferramenta do assistente recebe do SERVIDOR. A empresa e o fuso
 * vêm da sessão — nunca da entrada que o modelo manda. O cliente do Supabase é
 * o da sessão (RLS do dono), então a IA nunca enxerga mais do que o dono veria.
 */
export type ContextoFerramenta = {
  supabase: SupabaseClient<Database>;
  empresa: Pick<Tables<"organizations">, "id" | "timezone" | "tax_regime" | "opened_on">;
  /** Hoje, no calendário da empresa ("2026-10-12"). */
  hoje: string;
};

export type Ferramenta<S extends z.ZodType = z.ZodType> = {
  nome: string;
  descricao: string;
  /** Texto curto que a tela mostra enquanto a ferramenta roda. */
  status: string;
  esquema: S;
  executar: (entrada: z.infer<S>, ctx: ContextoFerramenta) => Promise<unknown>;
};

export function ferramenta<S extends z.ZodType>(f: Ferramenta<S>) {
  return f;
}

/* ------------------------------------------------------------------ datas */

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Maior período que uma ferramenta aceita. Mais que isso é caro e raramente útil. */
export const MESES_MAXIMOS = 24;

/** Dia ao meio-dia UTC: a conversa de fuso nunca muda o dia. */
export const diaParaData = (dia: string) => new Date(`${dia}T12:00:00Z`);
export const dataParaDia = (data: Date) => format(data, "yyyy-MM-dd");

function diaValido(dia: string) {
  if (!DIA.test(dia)) return false;
  const data = diaParaData(dia);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === dia;
}

export const esquemaPeriodo = z
  .object({
    inicio: z.string().describe("Primeiro dia do período, AAAA-MM-DD, no calendário da empresa."),
    fim: z.string().describe("Último dia do período (inclusive), AAAA-MM-DD."),
  })
  .superRefine((p, ctx) => {
    if (!diaValido(p.inicio)) {
      ctx.addIssue({ code: "custom", path: ["inicio"], message: "Data inicial inválida: use AAAA-MM-DD." });
      return;
    }
    if (!diaValido(p.fim)) {
      ctx.addIssue({ code: "custom", path: ["fim"], message: "Data final inválida: use AAAA-MM-DD." });
      return;
    }
    if (p.fim < p.inicio) {
      ctx.addIssue({ code: "custom", path: ["fim"], message: "A data final vem antes da inicial." });
      return;
    }
    if (diaParaData(p.fim) >= addMonths(diaParaData(p.inicio), MESES_MAXIMOS)) {
      ctx.addIssue({
        code: "custom",
        path: ["fim"],
        message: `Período longo demais: o máximo é ${MESES_MAXIMOS} meses.`,
      });
    }
  });

export type Periodo = z.infer<typeof esquemaPeriodo>;

export const esquemaMes = z.object({
  mes: z
    .string()
    .regex(MES, "Mês inválido: use AAAA-MM.")
    .describe("Mês no formato AAAA-MM, no calendário da empresa."),
});

export function diasDoPeriodo(p: Periodo) {
  return differenceInCalendarDays(diaParaData(p.fim), diaParaData(p.inicio)) + 1;
}

/** O período começa no dia 1º e termina no último dia de um mês? */
function mesesInteiros(p: Periodo) {
  return p.inicio.endsWith("-01") && p.fim === periodoDoMes(p.fim.slice(0, 7)).fim;
}

/**
 * O período imediatamente anterior, para comparar. Mês(es) inteiro(s) se
 * comparam com o(s) mês(es) civil(is) anterior(es) — outubro com setembro
 * inteiro, jul–set com abr–jun —, como pensa o dono e como custos_operacionais
 * compara. Nos demais casos, o mesmo número de dias logo antes.
 */
export function periodoAnterior(p: Periodo): Periodo {
  const inicio = diaParaData(p.inicio);
  const fim = subDays(inicio, 1);
  if (mesesInteiros(p)) {
    const meses = differenceInCalendarMonths(diaParaData(p.fim), inicio) + 1;
    return { inicio: dataParaDia(addMonths(inicio, -meses)), fim: dataParaDia(fim) };
  }
  const dias = diasDoPeriodo(p);
  return { inicio: dataParaDia(subDays(fim, dias - 1)), fim: dataParaDia(fim) };
}

/** Primeiro e último dia de um mês "AAAA-MM". */
export function periodoDoMes(mes: string): Periodo {
  const inicio = `${mes}-01`;
  const fim = subDays(addMonths(diaParaData(inicio), 1), 1);
  return { inicio, fim: dataParaDia(fim) };
}

/** Instantes (UTC) de meia-noite a meia-noite no fuso da empresa: [de, ate). */
export function instantesDoPeriodo(p: Periodo, fuso: string) {
  const depois = dataParaDia(addDays(diaParaData(p.fim), 1));
  return {
    de: instanteNaEmpresa(p.inicio, "00:00", fuso).toISOString(),
    ate: instanteNaEmpresa(depois, "00:00", fuso).toISOString(),
  };
}

/* --------------------------------------------------------------- números */

/** Dinheiro para o modelo: centavos inteiros e o texto já pronto (ele não divide nada). */
export function brl(cents: number) {
  return { cents, texto: formatarBRL(cents) };
}

const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** Parte de um total, como texto ("12,5%"). Sem total, não há percentual. */
export function percentual(parte: number, total: number) {
  return total > 0 ? porcento.format(parte / total) : null;
}

/** Variação de um período para o outro ("+12,5%"). */
export function variacao(atual: number, anterior: number) {
  if (anterior === 0) return atual === 0 ? "sem variação" : "sem base de comparação";
  const texto = porcento.format((atual - anterior) / Math.abs(anterior));
  return atual >= anterior ? `+${texto}` : texto;
}

/** Divisão inteira arredondada (média de centavos continua em centavos). */
export function media(total: number, quantidade: number) {
  return quantidade > 0 ? Math.round(total / quantidade) : 0;
}

/**
 * Só o primeiro nome do profissional (LGPD: o mínimo necessário). Dois com o
 * mesmo primeiro nome viram "Ana" e "Ana (2)".
 */
export function primeirosNomes(profissionais: { id: string; name: string }[]) {
  const usados = new Map<string, number>();
  const nomes = new Map<string, string>();
  for (const p of [...profissionais].sort((a, b) => a.id.localeCompare(b.id))) {
    const primeiro = p.name.trim().split(/\s+/)[0] || "Profissional";
    const vezes = (usados.get(primeiro) ?? 0) + 1;
    usados.set(primeiro, vezes);
    nomes.set(p.id, vezes === 1 ? primeiro : `${primeiro} (${vezes})`);
  }
  return nomes;
}

/* ----------------------------------------------------------- paginação */

const TAMANHO_DA_PAGINA = 1000; // teto padrão do PostgREST por resposta
export const LINHAS_MAXIMAS = 20_000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * O Supabase devolve no máximo 1.000 linhas por consulta. Para 24 meses de
 * lançamentos isso não basta: pede de página em página (a consulta precisa
 * ter `order` estável) até acabar ou chegar ao teto.
 */
export async function buscarTodas<T>(pagina: (de: number, ate: number) => Pagina<T>) {
  const linhas: T[] = [];
  for (let de = 0; de < LINHAS_MAXIMAS; de += TAMANHO_DA_PAGINA) {
    const { data, error } = await pagina(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) throw new Error(`Falha ao consultar: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_DA_PAGINA) return { linhas, cortado: false };
  }
  return { linhas, cortado: true };
}

export const AVISO_CORTADO =
  "Há mais registros do que o assistente consegue ler de uma vez; os números deste período estão incompletos. Use um período menor.";

/* --------------------------------------------------------- nomes */

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tira de um texto livre os nomes de pessoas que o Bossa conhece (profissionais
 * e equipe): cada parte do nome com 3 letras ou mais vira "[nome]". Complementa
 * o sanitizarParaIA, que pega documento e contato, mas não nome.
 */
export function ocultarNomes(texto: string, nomes: string[]) {
  const partes = [
    ...new Set(
      nomes.flatMap((nome) =>
        nome
          .trim()
          .split(/\s+/)
          .filter((parte) => parte.length >= 3),
      ),
    ),
  ].sort((a, b) => b.length - a.length);
  if (partes.length === 0) return texto;
  const padrao = new RegExp(`(?<![\\p{L}\\p{N}])(?:${partes.map(escapar).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return texto.replace(padrao, "[nome]").replace(/\[nome\](\s+\[nome\])+/g, "[nome]");
}
