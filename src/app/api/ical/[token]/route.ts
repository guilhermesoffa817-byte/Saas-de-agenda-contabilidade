import { createAdminClient } from "@/lib/supabase/admin";
import { montarICal, type EventoDaAgenda } from "@/lib/ical";
import { supabaseConfigurado } from "@/lib/supabase/config";

/** O feed lê o banco a cada visita: nada de cache de build. */
export const dynamic = "force-dynamic";

/** Quanto do passado e do futuro vai no arquivo. */
const DIAS_ATRAS = 30;
const DIAS_A_FRENTE = 120;

/**
 * Agenda do profissional para assinar no celular.
 *
 * O endereço é o segredo: quem tem o link lê a agenda. Por isso o token é
 * sorteado, é trocável pelo dono ("Gerar novo link") e nunca aparece numa
 * página pública. O feed não expõe telefone nem anotação — só quem, o quê e
 * quando, que é o que serve no calendário.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  if (!supabaseConfigurado) {
    return new Response("agenda indisponível", { status: 503 });
  }
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return new Response("link inválido", { status: 404 });
  }

  const supabase = createAdminClient();

  const { data: profissional } = await supabase
    .from("professionals")
    .select("id, name, organization_id")
    .eq("ical_token", token)
    .maybeSingle();

  if (!profissional) return new Response("link inválido", { status: 404 });

  const { data: empresa } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profissional.organization_id)
    .maybeSingle();

  const agora = Date.now();
  const de = new Date(agora - DIAS_ATRAS * 86_400_000).toISOString();
  const ate = new Date(agora + DIAS_A_FRENTE * 86_400_000).toISOString();

  const { data: atendimentos } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, clients(name), services(name)")
    .eq("professional_id", profissional.id)
    .gte("starts_at", de)
    .lte("starts_at", ate)
    .order("starts_at");

  const eventos: EventoDaAgenda[] = (atendimentos ?? []).map((item) => {
    const cliente = umNome(item.clients);
    const servico = umNome(item.services);
    return {
      id: item.id,
      inicio: item.starts_at,
      fim: item.ends_at,
      titulo: [servico, cliente].filter(Boolean).join(" — ") || "Atendimento",
      local: empresa?.name ?? null,
      cancelado: item.status === "cancelado",
    };
  });

  const arquivo = montarICal({
    nomeDaAgenda: [profissional.name, empresa?.name].filter(Boolean).join(" · "),
    dominio: "alicerce.com.br",
    eventos,
  });

  return new Response(arquivo, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="agenda-alicerce.ics"',
      // Link secreto: nenhum intermediário deve guardar nem indexar.
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

/** O Supabase devolve a relação como objeto ou lista, dependendo da consulta. */
function umNome(relacao: { name: string } | { name: string }[] | null) {
  if (!relacao) return null;
  return Array.isArray(relacao) ? (relacao[0]?.name ?? null) : relacao.name;
}
