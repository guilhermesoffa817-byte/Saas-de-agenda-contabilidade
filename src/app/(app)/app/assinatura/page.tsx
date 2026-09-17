import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { historicoDeCobrancas } from "./acoes";
import { PlanosEAssinatura } from "@/components/app/assinatura/planos-e-assinatura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asaasConfigurado } from "@/lib/asaas";
import { formatarData } from "@/lib/dates";
import { planoDe } from "@/lib/planos";
import { empresaAtual, situacaoDaEmpresa } from "@/lib/supabase/sessao";

export const metadata: Metadata = { title: "Assinatura — Alicerce" };

const SITUACAO_DA_COBRANCA: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  RECEIVED: "Pago",
  CONFIRMED: "Pago",
  OVERDUE: "Vencido",
  REFUNDED: "Devolvido",
  RECEIVED_IN_CASH: "Pago em dinheiro",
};

export default async function PaginaAssinatura() {
  const { vinculo } = await empresaAtual();
  if (!vinculo) redirect("/comecar");
  if (vinculo.papel !== "dono") redirect("/app");

  const empresa = vinculo.empresa;
  const situacao = situacaoDaEmpresa(empresa);
  const plano = planoDe(empresa.plan);
  const historico = await historicoDeCobrancas();
  const cobrancas = historico.dados?.cobrancas ?? [];
  const proxima = cobrancas.find((cobranca) => cobranca.status === "PENDING");

  const Icone =
    situacao.modo === "ativa"
      ? CheckCircle2
      : situacao.modo === "teste"
        ? Clock
        : AlertTriangle;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          O acesso do seu contador é gratuito em qualquer plano.
        </p>
      </div>

      <Card
        className={
          situacao.modo === "somente_leitura"
            ? "border-destructive/50"
            : situacao.modo === "aviso"
              ? "border-warning/60"
              : undefined
        }
      >
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Icone
              className={`size-4 ${
                situacao.modo === "somente_leitura"
                  ? "text-destructive"
                  : situacao.modo === "aviso"
                    ? "text-warning"
                    : "text-success"
              }`}
              aria-hidden
            />
            {situacao.titulo}
          </CardDescription>
          <CardTitle className="text-lg">
            {plano ? `Plano ${plano.nome}` : "Teste grátis"}
            {empresa.billing_cycle ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                cobrança {empresa.billing_cycle}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{situacao.mensagem}</p>

          {empresa.pending_plan ? (
            <Badge variant="outline" className="w-fit border-gold text-gold-ink">
              {planoDe(empresa.pending_plan)?.nome} aguardando confirmação do pagamento
            </Badge>
          ) : null}

          {proxima ? (
            <p className="text-sm">
              Próxima cobrança:{" "}
              <span className="font-mono tabular">
                {formatarData(`${proxima.vencimento}T12:00:00Z`, empresa.timezone)}
              </span>{" "}
              · R$ {proxima.valor.toFixed(2).replace(".", ",")}
              {proxima.link ? (
                <Button asChild variant="link" size="sm" className="px-2">
                  <a href={proxima.link} target="_blank" rel="noreferrer">
                    Pagar
                  </a>
                </Button>
              ) : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <PlanosEAssinatura
        planoAtual={empresa.plan}
        cicloAtual={(empresa.billing_cycle as "mensal" | "anual" | null) ?? null}
        planoPendente={empresa.pending_plan}
        temAssinatura={Boolean(empresa.asaas_subscription_id)}
        cobrancaConfigurada={asaasConfigurado}
      />

      {cobrancas.length ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Suas cobranças</h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {cobrancas.map((cobranca) => (
              <li
                key={cobranca.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-xs tabular">
                  {formatarData(`${cobranca.vencimento}T12:00:00Z`, empresa.timezone)}
                </span>
                <span>{SITUACAO_DA_COBRANCA[cobranca.status] ?? cobranca.status}</span>
                <span className="font-mono tabular">
                  R$ {cobranca.valor.toFixed(2).replace(".", ",")}
                </span>
                {cobranca.link ? (
                  <Button asChild variant="ghost" size="xs">
                    <a href={cobranca.link} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
