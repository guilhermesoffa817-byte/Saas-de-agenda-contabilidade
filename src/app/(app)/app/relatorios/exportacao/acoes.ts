"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COLUNAS_DISPONIVEIS } from "@/lib/reports/exportacao-contabil";
import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

const chaves = COLUNAS_DISPONIVEIS.map((coluna) => coluna.chave);

const Esquema = z.object({
  empresaId: z.uuid(),
  colunas: z.array(z.enum(chaves as [string, ...string[]])).min(1, "Escolha ao menos uma coluna."),
  separador: z.enum([";", ",", "|", "\t"]),
  formatoDeData: z.enum(["dd/MM/yyyy", "yyyy-MM-dd", "ddMMyyyy"]),
  decimalComVirgula: z.boolean(),
});

export type Resposta = { erro?: string; aviso?: string };

/** O contador (ou o dono) define o leiaute que o sistema contábil dele espera. */
export async function salvarModeloDeExportacao(entrada: z.input<typeof Esquema>): Promise<Resposta> {
  const validado = Esquema.safeParse(entrada);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Confira as opções." };
  }

  const { vinculos } = await empresaAtual();
  const vinculo = vinculos.find((item) => item.empresa.id === validado.data.empresaId);
  if (!vinculo) return { erro: "Empresa não encontrada." };
  if (vinculo.papel !== "dono" && vinculo.papel !== "contador") {
    return { erro: "Só o dono e o contador configuram a exportação." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("export_templates").upsert(
    {
      organization_id: validado.data.empresaId,
      name: "Padrão",
      columns: validado.data.colunas,
      separator: validado.data.separador,
      date_format: validado.data.formatoDeData,
      decimal_comma: validado.data.decimalComVirgula,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,name" },
  );

  if (error) return { erro: error.message };

  revalidatePath("/app/relatorios/exportacao");
  revalidatePath("/contador");
  return { aviso: "Modelo de exportação salvo." };
}
