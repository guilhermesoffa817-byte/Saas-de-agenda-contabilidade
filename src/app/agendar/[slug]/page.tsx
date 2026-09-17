import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgendamentoPublico } from "./agendamento";
import { AvisoConfiguracao } from "@/components/app/aviso-configuracao";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigurado } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

async function buscarEmpresa(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, slug, timezone, city, state")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!supabaseConfigurado) return { title: "Agendar — Alicerce" };
  const { slug } = await params;
  const empresa = await buscarEmpresa(slug);
  return {
    title: empresa ? `Agendar em ${empresa.name}` : "Agendar — Alicerce",
    description: empresa
      ? `Escolha o serviço, o dia e o horário para ser atendido em ${empresa.name}.`
      : undefined,
  };
}

export default async function PaginaAgendamentoPublico({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!supabaseConfigurado) return <AvisoConfiguracao />;

  const { slug } = await params;
  const empresa = await buscarEmpresa(slug);
  if (!empresa) notFound();

  const admin = createAdminClient();
  const [{ data: servicos }, { data: profissionais }] = await Promise.all([
    admin
      .from("services")
      .select("id, name, duration_min, price_cents")
      .eq("organization_id", empresa.id)
      .eq("active", true)
      .eq("bookable_online", true)
      .order("price_cents"),
    admin
      .from("professionals")
      .select("id, name")
      .eq("organization_id", empresa.id)
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-6 py-10">
      <AgendamentoPublico
        empresa={{
          nome: empresa.name,
          slug: empresa.slug,
          fuso: empresa.timezone,
          cidade: empresa.city,
          estado: empresa.state,
        }}
        servicos={(servicos ?? []).map((servico) => ({
          id: servico.id,
          nome: servico.name,
          duracao: servico.duration_min,
          preco: servico.price_cents,
        }))}
        profissionais={(profissionais ?? []).map((profissional) => ({
          id: profissional.id,
          nome: profissional.name,
        }))}
      />

      <footer className="mt-auto flex flex-col items-center gap-1 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        <span>
          Agenda por{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Alicerce
          </Link>
        </span>
        <Link href="/privacidade" className="underline underline-offset-4">
          Política de privacidade
        </Link>
      </footer>
    </div>
  );
}
