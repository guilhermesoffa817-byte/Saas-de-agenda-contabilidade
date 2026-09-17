"use client";

import { ArrowLeft, CalendarCheck, CheckCircle2, Clock, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { criarAgendamentoPublico, horariosDoDia, type HorarioLivre } from "./acoes";
import { Turnstile } from "@/components/app/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DIAS_SEMANA, formatarDiaLongo, formatarHora } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export type EmpresaPublica = {
  nome: string;
  slug: string;
  fuso: string;
  cidade: string | null;
  estado: string | null;
};

export type ServicoPublico = { id: string; nome: string; duracao: number; preco: number };
export type ProfissionalPublico = { id: string; nome: string };

const QUALQUER = "qualquer";

function proximosDias(fuso: string, quantidade = 21) {
  const hoje = new Date();
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date(hoje.getTime() + indice * 86_400_000);
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(data);
    const diaSemana = new Date(`${iso}T12:00:00Z`).getUTCDay();
    return {
      iso,
      numero: iso.slice(8, 10),
      mes: iso.slice(5, 7),
      nome: DIAS_SEMANA[diaSemana].curto,
    };
  });
}

export function AgendamentoPublico({
  empresa,
  servicos,
  profissionais,
}: {
  empresa: EmpresaPublica;
  servicos: ServicoPublico[];
  profissionais: ProfissionalPublico[];
}) {
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const [servicoId, setServicoId] = useState("");
  const [profissionalId, setProfissionalId] = useState(
    profissionais.length === 1 ? profissionais[0].id : QUALQUER,
  );
  const [dia, setDia] = useState("");
  const [horarios, setHorarios] = useState<HorarioLivre[]>([]);
  const [escolhido, setEscolhido] = useState<HorarioLivre | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aceita, setAceita] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{ inicio: string; profissional: string; servico: string } | null>(
    null,
  );

  const servico = servicos.find((item) => item.id === servicoId);
  const dias = proximosDias(empresa.fuso);

  async function carregarHorarios(diaEscolhido: string) {
    setErro(null);
    setCarregando(true);
    setDia(diaEscolhido);
    setEscolhido(null);

    const resposta = await horariosDoDia({
      slug: empresa.slug,
      servicoId,
      profissionalId: profissionalId === QUALQUER ? undefined : profissionalId,
      dia: diaEscolhido,
    });
    setCarregando(false);

    if (!resposta.ok) {
      setErro(resposta.erro ?? "Não conseguimos carregar os horários.");
      return;
    }
    setHorarios(resposta.dados ?? []);
    setPasso(3);
  }

  async function confirmar() {
    if (!escolhido || !servico) return;
    setErro(null);
    setCarregando(true);

    const resposta = await criarAgendamentoPublico({
      slug: empresa.slug,
      serviceId: servico.id,
      professionalId: escolhido.profissionalId,
      inicioISO: escolhido.inicio,
      nome,
      telefone,
      aceitaWhatsApp: aceita,
      turnstileToken: token ?? undefined,
    });
    setCarregando(false);

    if (!resposta.ok) {
      setErro(resposta.erro ?? "Não conseguimos concluir.");
      return;
    }
    setConcluido(resposta.dados ?? null);
  }

  if (concluido) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Horário marcado!</h1>
          <p className="text-muted-foreground">
            {concluido.servico} com {concluido.profissional}
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-center">
          <span className="text-sm text-muted-foreground first-letter:uppercase">
            {formatarDiaLongo(concluido.inicio, empresa.fuso)}
          </span>
          <span className="font-mono text-3xl tabular">
            {formatarHora(concluido.inicio, empresa.fuso)}
          </span>
          <span className="text-sm text-muted-foreground">{empresa.nome}</span>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Se precisar desmarcar, fale com {empresa.nome} pelo WhatsApp.
        </p>
      </div>
    );
  }

  const PASSOS = ["Serviço", "Profissional", "Dia", "Horário", "Seus dados"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{empresa.nome}</h1>
        {empresa.cidade ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            {empresa.cidade}
            {empresa.estado ? `, ${empresa.estado}` : ""}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{PASSOS[passo]}</span>
          <span className="text-xs text-muted-foreground">
            {passo + 1} de {PASSOS.length}
          </span>
        </div>
        <Progress value={((passo + 1) / PASSOS.length) * 100} />
      </div>

      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      {passo === 0 ? (
        <div className="flex flex-col gap-2">
          {servicos.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setServicoId(item.id);
                setPasso(profissionais.length > 1 ? 1 : 2);
              }}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{item.nome}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {item.duracao} minutos
                </span>
              </span>
              <span className="font-mono tabular">{formatarBRL(item.preco)}</span>
            </button>
          ))}
          {!servicos.length ? (
            <Alert>
              <AlertDescription>
                Este negócio ainda não liberou serviços para agendamento online.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}

      {passo === 1 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setProfissionalId(QUALQUER);
              setPasso(2);
            }}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors hover:bg-accent",
              profissionalId === QUALQUER ? "border-primary bg-primary/5" : "border-border bg-card",
            )}
          >
            <span className="block font-medium">Qualquer profissional</span>
            <span className="text-xs text-muted-foreground">Mostra todos os horários livres</span>
          </button>
          {profissionais.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setProfissionalId(item.id);
                setPasso(2);
              }}
              className={cn(
                "rounded-lg border p-4 text-left font-medium transition-colors hover:bg-accent",
                profissionalId === item.id ? "border-primary bg-primary/5" : "border-border bg-card",
              )}
            >
              {item.nome}
            </button>
          ))}
        </div>
      ) : null}

      {passo === 2 ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {dias.map((item) => (
              <button
                key={item.iso}
                type="button"
                disabled={carregando}
                onClick={() => carregarHorarios(item.iso)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border p-2 transition-colors hover:bg-accent",
                  dia === item.iso ? "border-primary bg-primary/5" : "border-border bg-card",
                )}
              >
                <span className="text-xs text-muted-foreground">{item.nome}</span>
                <span className="font-mono text-lg tabular">{item.numero}</span>
                <span className="text-[10px] text-muted-foreground">/{item.mes}</span>
              </button>
            ))}
          </div>
          {carregando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Buscando horários livres…
            </p>
          ) : null}
        </div>
      ) : null}

      {passo === 3 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {formatarDiaLongo(`${dia}T12:00:00Z`, empresa.fuso)}
          </p>

          {horarios.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {horarios.map((horario) => (
                <button
                  key={horario.inicio}
                  type="button"
                  onClick={() => {
                    setEscolhido(horario);
                    setPasso(4);
                  }}
                  className="rounded-lg border border-border bg-card py-3 font-mono text-sm tabular transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  {formatarHora(horario.inicio, empresa.fuso)}
                </button>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                Nenhum horário livre nesse dia. Escolha outro dia.
              </AlertDescription>
            </Alert>
          )}

          <Button variant="ghost" className="w-fit" onClick={() => setPasso(2)}>
            <ArrowLeft aria-hidden />
            Trocar o dia
          </Button>
        </div>
      ) : null}

      {passo === 4 && escolhido && servico ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-secondary/50 p-4">
            <span className="font-medium">{servico.nome}</span>
            <span className="text-sm text-muted-foreground first-letter:uppercase">
              {formatarDiaLongo(escolhido.inicio, empresa.fuso)} às{" "}
              {formatarHora(escolhido.inicio, empresa.fuso)}
            </span>
            <span className="font-mono text-sm tabular">{formatarBRL(servico.preco)}</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nome-publico">Seu nome</Label>
            <Input
              id="nome-publico"
              value={nome}
              autoComplete="name"
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Como devemos te chamar"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="telefone-publico">Seu WhatsApp</Label>
            <Input
              id="telefone-publico"
              value={telefone}
              inputMode="tel"
              autoComplete="tel"
              onChange={(evento) => setTelefone(evento.target.value)}
              placeholder="(66) 99999-9999"
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="optin-publico"
              checked={aceita}
              onCheckedChange={(marcado) => setAceita(marcado === true)}
            />
            <Label htmlFor="optin-publico" className="font-normal leading-snug">
              Aceito receber lembretes deste agendamento pelo WhatsApp.
            </Label>
          </div>

          <Turnstile onToken={setToken} />

          <Button
            onClick={confirmar}
            disabled={carregando || nome.trim().length < 2 || telefone.trim().length < 8}
          >
            {carregando ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarCheck aria-hidden />}
            Confirmar agendamento
          </Button>

          <p className="text-xs text-muted-foreground">
            Seus dados são usados por {empresa.nome} só para este atendimento. Veja a{" "}
            <Link href="/privacidade" className="underline underline-offset-4">
              política de privacidade do Alicerce
            </Link>
            .
          </p>

          <Button variant="ghost" className="w-fit" onClick={() => setPasso(3)}>
            <ArrowLeft aria-hidden />
            Trocar o horário
          </Button>
        </div>
      ) : null}

      {passo > 0 && passo < 3 ? (
        <Button variant="ghost" className="w-fit" onClick={() => setPasso(passo - 1)}>
          <ArrowLeft aria-hidden />
          Voltar
        </Button>
      ) : null}
    </div>
  );
}
