import { createAdminClient } from "@/lib/supabase/admin";
import { formatarData, formatarHora } from "@/lib/dates";
import { limiteDeLembretes } from "@/lib/planos";
import { situacaoDaAssinatura } from "@/lib/assinatura";
import { MODELO_LEMBRETE, enviarLembrete, whatsappConfigurado } from "@/lib/whatsapp/cloud";

/** Tarefa agendada: lê e escreve a cada chamada, nunca é pré-renderizada. */
export const dynamic = "force-dynamic";

/** Janela do lembrete: entre 23h e 24h antes do atendimento. */
const DE_HORAS = 23;
const ATE_HORAS = 24;

type Reservado = {
  id: string;
  organization_id: string;
  starts_at: string;
  client_id: string;
  service_id: string;
};

/**
 * Chamada pelo Supabase Cron a cada 5 minutos (veja o agendamento no README).
 *
 * A reserva vem antes do envio: o `update ... returning` marca `reminder_sent_at`
 * numa tacada só, então duas execuções ao mesmo tempo nunca pegam o mesmo
 * atendimento. Se o envio falhar de verdade, a reserva volta para null e a
 * próxima execução tenta de novo.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("x-cron-secret") !== segredo) {
    return new Response("não autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const agora = Date.now();
  const de = new Date(agora + DE_HORAS * 3_600_000).toISOString();
  const ate = new Date(agora + ATE_HORAS * 3_600_000).toISOString();

  const { data: pendentes, error } = await supabase
    .from("appointments")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("status", "agendado")
    .is("reminder_sent_at", null)
    .gte("starts_at", de)
    .lt("starts_at", ate)
    .select("id, organization_id, starts_at, client_id, service_id");

  if (error) return Response.json({ erro: error.message }, { status: 500 });

  const reservados = (pendentes ?? []) as Reservado[];
  const resumo = {
    reservados: reservados.length,
    enviados: 0,
    semOptIn: 0,
    semFranquia: 0,
    somenteLeitura: 0,
    falharam: 0,
  };

  if (reservados.length === 0) return Response.json(resumo);

  if (!whatsappConfigurado()) {
    // Sem as chaves da Meta nada sai: devolve a reserva para não perder o lembrete.
    await liberar(supabase, reservados.map((item) => item.id));
    return Response.json(
      { ...resumo, erro: "Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID." },
      { status: 503 },
    );
  }

  // Uma busca por conjunto de ids, em vez de uma por atendimento.
  const [empresas, clientes, servicos] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, timezone, plan, subscription_status, trial_ends_at, past_due_since")
      .in("id", unicos(reservados.map((item) => item.organization_id))),
    supabase
      .from("clients")
      .select("id, name, phone_e164, whatsapp_opt_in")
      .in("id", unicos(reservados.map((item) => item.client_id))),
    supabase
      .from("services")
      .select("id, name")
      .in("id", unicos(reservados.map((item) => item.service_id))),
  ]);

  const porId = <T extends { id: string }>(lista: T[] | null) =>
    new Map((lista ?? []).map((item) => [item.id, item]));

  const empresaPor = porId(empresas.data);
  const clientePor = porId(clientes.data);
  const servicoPor = porId(servicos.data);

  const usadosNoMes = await contarEnviosDoMes(
    supabase,
    unicos(reservados.map((item) => item.organization_id)),
  );

  const devolver: string[] = [];

  for (const atendimento of reservados) {
    const empresa = empresaPor.get(atendimento.organization_id);
    const cliente = clientePor.get(atendimento.client_id);
    const servico = servicoPor.get(atendimento.service_id);

    if (!empresa || !cliente || !servico) {
      resumo.falharam += 1;
      devolver.push(atendimento.id);
      continue;
    }

    // Conta parada ou em teste vencido não manda mensagem em nome de ninguém.
    if (!situacaoDaAssinatura(empresa).podeEscrever) {
      resumo.somenteLeitura += 1;
      continue;
    }

    // Só quem autorizou recebe. Sem opt-in, não existe lembrete automático.
    if (!cliente.whatsapp_opt_in || !cliente.phone_e164) {
      resumo.semOptIn += 1;
      continue;
    }

    const limite = limiteDeLembretes(empresa.plan);
    const usados = usadosNoMes.get(empresa.id) ?? 0;
    if (usados >= limite) {
      resumo.semFranquia += 1;
      continue;
    }

    try {
      const idNaMeta = await enviarLembrete({
        telefoneE164: cliente.phone_e164,
        atendimentoId: atendimento.id,
        variaveis: {
          cliente: primeiroNome(cliente.name),
          servico: servico.name,
          data: formatarData(atendimento.starts_at, empresa.timezone),
          hora: formatarHora(atendimento.starts_at, empresa.timezone),
        },
      });

      await supabase.from("message_logs").insert({
        organization_id: empresa.id,
        appointment_id: atendimento.id,
        template: MODELO_LEMBRETE,
        provider_message_id: idNaMeta,
        status: "enviado",
      });

      usadosNoMes.set(empresa.id, usados + 1);
      resumo.enviados += 1;
    } catch (erro) {
      // Falha de envio devolve a reserva: o lembrete ainda tem horas de janela.
      resumo.falharam += 1;
      devolver.push(atendimento.id);
      await supabase.from("message_logs").insert({
        organization_id: empresa.id,
        appointment_id: atendimento.id,
        template: MODELO_LEMBRETE,
        status: "falhou",
        error: erro instanceof Error ? erro.message.slice(0, 500) : "erro desconhecido",
      });
    }
  }

  await liberar(supabase, devolver);
  return Response.json(resumo);
}

function unicos(lista: string[]) {
  return [...new Set(lista)];
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

async function liberar(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
) {
  if (ids.length === 0) return;
  await supabase.from("appointments").update({ reminder_sent_at: null }).in("id", ids);
}

/** Quantos lembretes cada empresa já mandou no mês corrente, para a franquia do plano. */
async function contarEnviosDoMes(
  supabase: ReturnType<typeof createAdminClient>,
  empresas: string[],
) {
  const inicioDoMes = new Date();
  inicioDoMes.setUTCDate(1);
  inicioDoMes.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("message_logs")
    .select("organization_id")
    .eq("template", MODELO_LEMBRETE)
    .neq("status", "falhou")
    .gte("created_at", inicioDoMes.toISOString())
    .in("organization_id", empresas);

  const contagem = new Map<string, number>();
  for (const linha of data ?? []) {
    contagem.set(linha.organization_id, (contagem.get(linha.organization_id) ?? 0) + 1);
  }
  return contagem;
}
