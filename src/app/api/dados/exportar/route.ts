import { createClient } from "@/lib/supabase/server";
import { empresaAtual } from "@/lib/supabase/sessao";

export const dynamic = "force-dynamic";

/**
 * Portabilidade (LGPD, art. 18): o dono baixa tudo o que é da empresa dele, em
 * JSON, num arquivo só. Vale também como saída sem rancor — quem quiser sair do
 * Alicerce leva os dados.
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
] as const;

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
      "Exportação completa dos dados desta empresa no Alicerce. Valores em centavos; datas em UTC.",
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
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .eq("organization_id", empresa.id);
    pacote[tabela] = error ? { erro: error.message } : (data ?? []);
  }

  const nome = `alicerce-${empresa.slug}-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(pacote, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store, private",
    },
  });
}
