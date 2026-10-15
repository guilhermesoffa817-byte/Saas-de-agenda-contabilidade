import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

export const dynamic = "force-dynamic";

/**
 * Portabilidade (LGPD, art. 18): o dono baixa tudo o que é da empresa dele, em
 * JSON, num arquivo só. Vale também como saída sem rancor — quem quiser sair do
 * Bossa leva os dados.
 *
 * Fica de fora o que não é dado da empresa: chave de API, token de cobrança e
 * qualquer segredo do servidor.
 */
const TABELAS = [
  "professionals",
  "services",
  "working_hours",
  "time_off",
  "clients",
  "appointments",
  "accounts",
  "categories",
  "transactions",
  "monthly_closings",
  "document_requests",
  "export_templates",
  "service_tax_codes",
  "invoices",
  "message_logs",
  "audit_logs",
  "staff_members",
  "staff_private",
  "staff_absences",
  "staff_payments",
  "transaction_cost_overrides",
  "ai_conversations",
  "ai_usage_logs",
  "ai_consents",
] as const;

type Tabela = (typeof TABELAS)[number];

/** Ordem estável para paginar: a chave primária (ou a parte dela que varia dentro da empresa). */
const CHAVE: Partial<Record<Tabela, string>> = {
  staff_private: "staff_id",
  service_tax_codes: "service_id",
  transaction_cost_overrides: "transaction_id",
  ai_consents: "user_id",
};

/** O Supabase devolve no máximo 1.000 linhas por consulta: o pacote pede página por página. */
const TAMANHO_DA_PAGINA = 1000;

type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Lê todas as páginas, até vir uma incompleta. Erro em qualquer página vira `{ erro }` no pacote. */
async function lerTudo(pagina: (de: number, ate: number) => Pagina) {
  const linhas: unknown[] = [];
  for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
    const { data, error } = await pagina(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) return { erro: error.message };
    linhas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_DA_PAGINA) return linhas;
  }
}

export async function GET() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) return new Response("não autorizado", { status: 401 });
  if (vinculo.papel !== "dono") {
    return new Response("Só o dono exporta os dados da empresa.", { status: 403 });
  }

  const supabase = await createClient();
  const empresa = vinculo.empresa;

  const pacote: Record<string, unknown> = {
    exportado_em: new Date().toISOString(),
    observacao:
      "Exportação completa dos dados desta empresa no Bossa. Valores em centavos; datas em UTC.",
    empresa: {
      id: empresa.id,
      nome: empresa.name,
      slug: empresa.slug,
      segmento: empresa.segment,
      regime: empresa.tax_regime,
      documento: empresa.document,
      cidade: empresa.city,
      estado: empresa.state,
      fuso: empresa.timezone,
      plano: empresa.plan,
    },
  };

  // A RLS já limita cada consulta à empresa da sessão; o filtro é cinto e suspensório.
  for (const tabela of TABELAS) {
    pacote[tabela] = await lerTudo((de, ate) =>
      supabase
        .from(tabela)
        .select("*")
        .eq("organization_id", empresa.id)
        .order(CHAVE[tabela] ?? "id", { ascending: true })
        .range(de, ate),
    );
  }

  // Mensagens do assistente: só o texto que a pessoa viu. O conteúdo bruto da API
  // (com o raciocínio do modelo) é detalhe interno e fica de fora.
  pacote.ai_messages = await lerTudo((de, ate) =>
    supabase
      .from("ai_messages")
      .select("id, conversation_id, role, display_text, created_at")
      .eq("organization_id", empresa.id)
      .order("id", { ascending: true })
      .range(de, ate),
  );

  const nome = `bossa-${empresa.slug}-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(pacote, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store, private",
    },
  });
}
