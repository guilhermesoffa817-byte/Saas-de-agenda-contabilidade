"use server";

import { createHash } from "node:crypto";

import { addDays, addMinutes } from "date-fns";
import { headers } from "next/headers";
import { z } from "zod";

import { gerarHorariosLivres, type Intervalo } from "@/lib/availability";
import { diaLocalISO, instanteNaEmpresa } from "@/lib/dates";
import { enviarEmail, moldura } from "@/lib/email";
import { formatarBRL } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefone } from "@/lib/telefone";

const ANTECEDENCIA_MINIMA_MIN = 60;
const PASSO_MIN = 15;

/** Limites de abuso: generosos para o cliente de verdade, apertados para robô. */
const LIMITE_POR_IP = 12; // em 10 minutos
const LIMITE_POR_TELEFONE = 3; // em 60 minutos

const Entrada = z.object({
  slug: z.string().min(3),
  serviceId: z.uuid(),
  professionalId: z.uuid(),
  inicioISO: z.iso.datetime({ offset: true }),
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().trim().min(8),
  aceitaWhatsApp: z.boolean(),
  turnstileToken: z.string().optional(),
});

export type HorarioLivre = { inicio: string; profissionalId: string };

export type RespostaPublica<T = undefined> = { ok: boolean; erro?: string; dados?: T };

async function ipDaRequisicao() {
  const cabecalhos = await headers();
  const bruto =
    cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    cabecalhos.get("x-real-ip") ??
    "desconhecido";
  const sal = process.env.SUPABASE_SECRET_KEY ?? "alicerce";
  return createHash("sha256").update(`${bruto}|${sal}`).digest("hex").slice(0, 32);
}

/** Dados da empresa pelo link público. Usa a chave secreta: quem agenda não está logado. */
async function empresaPorSlug(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, slug, timezone, segment, city, state")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

async function calcularHorarios(params: {
  empresaId: string;
  fuso: string;
  servicoId: string;
  profissionalId?: string;
  dia: string;
}): Promise<HorarioLivre[]> {
  const admin = createAdminClient();

  const { data: servico } = await admin
    .from("services")
    .select("id, duration_min, buffer_min, active, bookable_online")
    .eq("organization_id", params.empresaId)
    .eq("id", params.servicoId)
    .maybeSingle();

  if (!servico || !servico.active || !servico.bookable_online) return [];

  let consultaProfissionais = admin
    .from("professionals")
    .select("id, name")
    .eq("organization_id", params.empresaId)
    .eq("active", true)
    .order("name");

  if (params.profissionalId) {
    consultaProfissionais = consultaProfissionais.eq("id", params.profissionalId);
  }

  const { data: profissionais } = await consultaProfissionais;
  if (!profissionais?.length) return [];

  const diaSemana = new Date(`${params.dia}T12:00:00Z`).getUTCDay();
  const inicioDoDia = new Date(instanteNaEmpresa(params.dia, "00:00", params.fuso).getTime());
  const fimDoDia = addDays(inicioDoDia, 1);

  const [{ data: expediente }, { data: atendimentos }, { data: folgas }] = await Promise.all([
    admin
      .from("working_hours")
      .select("professional_id, start_time, end_time")
      .eq("organization_id", params.empresaId)
      .eq("weekday", diaSemana),
    admin
      .from("appointments")
      .select("professional_id, starts_at, ends_at, status")
      .eq("organization_id", params.empresaId)
      .in("status", ["agendado", "confirmado"])
      .lt("starts_at", fimDoDia.toISOString())
      .gt("ends_at", inicioDoDia.toISOString()),
    admin
      .from("time_off")
      .select("professional_id, starts_at, ends_at")
      .eq("organization_id", params.empresaId)
      .lt("starts_at", fimDoDia.toISOString())
      .gt("ends_at", inicioDoDia.toISOString()),
  ]);

  const duracao = servico.duration_min + servico.buffer_min;
  const porHorario = new Map<string, string>();

  for (const profissional of profissionais) {
    const faixas = (expediente ?? [])
      .filter((faixa) => faixa.professional_id === profissional.id)
      .map((faixa) => ({ inicio: faixa.start_time.slice(0, 5), fim: faixa.end_time.slice(0, 5) }));

    if (!faixas.length) continue;

    const ocupados: Intervalo[] = [
      ...(atendimentos ?? [])
        .filter((item) => item.professional_id === profissional.id)
        .map((item) => ({ start: new Date(item.starts_at), end: new Date(item.ends_at) })),
      ...(folgas ?? [])
        .filter((item) => item.professional_id === profissional.id)
        .map((item) => ({ start: new Date(item.starts_at), end: new Date(item.ends_at) })),
    ];

    const livres = gerarHorariosLivres({
      dia: params.dia,
      timezone: params.fuso,
      expediente: faixas,
      ocupados,
      duracaoMin: duracao,
      passoMin: PASSO_MIN,
      antecedenciaMinimaMin: ANTECEDENCIA_MINIMA_MIN,
    });

    for (const horario of livres) {
      const chave = new Date(horario.getTime()).toISOString();
      if (!porHorario.has(chave)) porHorario.set(chave, profissional.id);
    }
  }

  return [...porHorario.entries()]
    .map(([inicio, profissionalId]) => ({ inicio, profissionalId }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Horários livres de um dia, para a página pública. */
export async function horariosDoDia(params: {
  slug: string;
  servicoId: string;
  profissionalId?: string;
  dia: string;
}): Promise<RespostaPublica<HorarioLivre[]>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.dia)) return { ok: false, erro: "Dia inválido." };

  const empresa = await empresaPorSlug(params.slug);
  if (!empresa) return { ok: false, erro: "Página de agendamento não encontrada." };

  const horarios = await calcularHorarios({
    empresaId: empresa.id,
    fuso: empresa.timezone,
    servicoId: params.servicoId,
    profissionalId: params.profissionalId,
    dia: params.dia,
  });

  return { ok: true, dados: horarios };
}

async function turnstileValido(token?: string) {
  const segredo = process.env.TURNSTILE_SECRET_KEY;
  if (!segredo) return true; // sem chave configurada, só o limite por IP protege
  if (!token) return false;

  try {
    const resposta = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: segredo, response: token }),
    });
    const resultado = (await resposta.json()) as { success?: boolean };
    return resultado.success === true;
  } catch {
    return false;
  }
}

export async function criarAgendamentoPublico(
  entrada: z.input<typeof Entrada>,
): Promise<RespostaPublica<{ inicio: string; profissional: string; servico: string }>> {
  const validado = Entrada.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, erro: "Confira os dados preenchidos." };
  }
  const dados = validado.data;

  const telefone = normalizarTelefone(dados.telefone);
  if (!telefone) {
    return { ok: false, erro: "Digite o WhatsApp com DDD, por exemplo (66) 99999-9999." };
  }

  const empresa = await empresaPorSlug(dados.slug);
  if (!empresa) return { ok: false, erro: "Página de agendamento não encontrada." };

  const admin = createAdminClient();
  const ipHash = await ipDaRequisicao();
  const agora = new Date();

  async function registrarTentativa(sucesso: boolean) {
    await admin.from("booking_attempts").insert({
      organization_id: empresa!.id,
      ip_hash: ipHash,
      phone_e164: telefone,
      sucesso,
    });
  }

  const [{ count: tentativasIp }, { count: tentativasTelefone }] = await Promise.all([
    admin
      .from("booking_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(agora.getTime() - 10 * 60_000).toISOString()),
    admin
      .from("booking_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone_e164", telefone)
      .eq("sucesso", true)
      .gte("created_at", new Date(agora.getTime() - 60 * 60_000).toISOString()),
  ]);

  if ((tentativasIp ?? 0) >= LIMITE_POR_IP) {
    return { ok: false, erro: "Muitas tentativas em pouco tempo. Tente de novo em alguns minutos." };
  }
  if ((tentativasTelefone ?? 0) >= LIMITE_POR_TELEFONE) {
    return {
      ok: false,
      erro: "Já existem agendamentos recentes para esse WhatsApp. Fale direto com o estabelecimento.",
    };
  }

  if (!(await turnstileValido(dados.turnstileToken))) {
    await registrarTentativa(false);
    return { ok: false, erro: "Não conseguimos confirmar que você não é um robô. Tente novamente." };
  }

  const { data: servico } = await admin
    .from("services")
    .select("id, name, duration_min, buffer_min, price_cents, active, bookable_online")
    .eq("organization_id", empresa.id)
    .eq("id", dados.serviceId)
    .maybeSingle();

  if (!servico || !servico.active || !servico.bookable_online) {
    await registrarTentativa(false);
    return { ok: false, erro: "Esse serviço não está disponível para agendamento online." };
  }

  const { data: profissional } = await admin
    .from("professionals")
    .select("id, name, active")
    .eq("organization_id", empresa.id)
    .eq("id", dados.professionalId)
    .maybeSingle();

  if (!profissional || !profissional.active) {
    await registrarTentativa(false);
    return { ok: false, erro: "Esse profissional não está atendendo." };
  }

  // O horário é recalculado no servidor: a lista que o navegador tinha pode estar velha.
  const inicio = new Date(dados.inicioISO);
  const dia = diaLocalISO(inicio, empresa.timezone);
  const livres = await calcularHorarios({
    empresaId: empresa.id,
    fuso: empresa.timezone,
    servicoId: servico.id,
    profissionalId: profissional.id,
    dia,
  });

  const aindaLivre = livres.some((horario) => horario.inicio === inicio.toISOString());
  if (!aindaLivre) {
    await registrarTentativa(false);
    return { ok: false, erro: "Esse horário acabou de ser ocupado. Escolha outro." };
  }

  const { data: existente } = await admin
    .from("clients")
    .select("id, whatsapp_opt_in")
    .eq("organization_id", empresa.id)
    .eq("phone_e164", telefone)
    .maybeSingle();

  let clienteId = existente?.id ?? null;

  if (clienteId) {
    // Só grava consentimento novo; nunca desmarca o que o cliente já autorizou antes.
    if (dados.aceitaWhatsApp && !existente?.whatsapp_opt_in) {
      await admin
        .from("clients")
        .update({ whatsapp_opt_in: true, whatsapp_opt_in_at: agora.toISOString() })
        .eq("id", clienteId);
    }
  } else {
    const { data: novo, error } = await admin
      .from("clients")
      .insert({
        organization_id: empresa.id,
        name: dados.nome,
        phone_e164: telefone,
        whatsapp_opt_in: dados.aceitaWhatsApp,
        whatsapp_opt_in_at: dados.aceitaWhatsApp ? agora.toISOString() : null,
      })
      .select("id")
      .single();

    if (error || !novo) {
      await registrarTentativa(false);
      return { ok: false, erro: "Não conseguimos concluir. Tente novamente." };
    }
    clienteId = novo.id;
  }

  const fim = addMinutes(inicio, servico.duration_min + servico.buffer_min);

  const { error: erroAgendamento } = await admin.from("appointments").insert({
    organization_id: empresa.id,
    professional_id: profissional.id,
    client_id: clienteId,
    service_id: servico.id,
    starts_at: inicio.toISOString(),
    ends_at: fim.toISOString(),
    price_cents: servico.price_cents,
    source: "link_publico",
  });

  if (erroAgendamento) {
    await registrarTentativa(false);
    if (erroAgendamento.code === "23P01") {
      return { ok: false, erro: "Esse horário acabou de ser ocupado. Escolha outro." };
    }
    return { ok: false, erro: "Não conseguimos concluir. Tente novamente." };
  }

  await registrarTentativa(true);

  // Avisa o negócio. Se o Resend não estiver configurado, segue sem erro.
  const { data: donos } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", empresa.id)
    .eq("role", "dono");

  const emails: string[] = [];
  for (const dono of donos ?? []) {
    const { data } = await admin.auth.admin.getUserById(dono.user_id);
    if (data.user?.email) emails.push(data.user.email);
  }

  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: empresa.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(inicio);

  for (const email of emails) {
    await enviarEmail({
      para: email,
      assunto: `Novo agendamento: ${dados.nome} — ${quando}`,
      texto: `${dados.nome} agendou ${servico.name} com ${profissional.name} em ${quando}. Valor: ${formatarBRL(servico.price_cents)}.`,
      html: moldura({
        titulo: "Novo agendamento pelo seu link",
        corpo: `<p><strong>${dados.nome}</strong> agendou <strong>${servico.name}</strong> com ${profissional.name}.</p>
                <p>Quando: <strong>${quando}</strong><br>Valor: ${formatarBRL(servico.price_cents)}<br>WhatsApp: ${telefone}</p>`,
      }),
    });
  }

  return {
    ok: true,
    dados: { inicio: inicio.toISOString(), profissional: profissional.name, servico: servico.name },
  };
}
