"use client";

import {
  Bean,
  Dumbbell,
  Flower2,
  HeartPulse,
  Plus,
  Scissors,
  Stethoscope,
  Store,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { CampoDinheiro } from "@/components/app/campo-dinheiro";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DIAS_SEMANA, FUSOS_BRASIL } from "@/lib/dates";
import { REGIMES, SEGMENTOS, type Segmento } from "@/lib/segmentos";
import { cn } from "@/lib/utils";
import type { Enums } from "@/lib/supabase/database.types";

const ICONES: Record<string, LucideIcon> = {
  Scissors,
  Bean,
  Stethoscope,
  HeartPulse,
  Dumbbell,
  Flower2,
  Store,
};

export type FaixaDia = { dia: number; aberto: boolean; inicio: string; fim: string };
export type ServicoForm = {
  nome: string;
  duracao: number;
  buffer: number;
  preco: number;
  online: boolean;
  escolhido: boolean;
};

export function PassoNegocio({
  nome,
  segmento,
  fuso,
  onChange,
}: {
  nome: string;
  segmento: Segmento;
  fuso: string;
  onChange: (mudanca: { nome?: string; segmento?: Segmento; fuso?: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nome-do-negocio">Nome do seu negócio</Label>
        <Input
          id="nome-do-negocio"
          value={nome}
          onChange={(evento) => onChange({ nome: evento.target.value })}
          placeholder="Studio Ana Ribeiro"
          autoComplete="organization"
        />
        <p className="text-xs text-muted-foreground">
          É o nome que seus clientes vão ver na página de agendamento.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label>Que tipo de negócio é?</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SEGMENTOS.map((item) => {
            const Icone = ICONES[item.icone] ?? Store;
            const ativo = segmento === item.valor;
            return (
              <button
                key={item.valor}
                type="button"
                onClick={() => onChange({ segmento: item.valor })}
                aria-pressed={ativo}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                  ativo
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                <Icone className={cn("size-5", ativo ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="text-sm font-medium">{item.nome}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fuso">Fuso horário</Label>
        <Select value={fuso} onValueChange={(valor) => onChange({ fuso: valor })}>
          <SelectTrigger id="fuso" className="w-full">
            <SelectValue placeholder="Escolha o fuso" />
          </SelectTrigger>
          <SelectContent>
            {FUSOS_BRASIL.map((item) => (
              <SelectItem key={item.valor} value={item.valor}>
                {item.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Todos os horários da agenda aparecem neste fuso.
        </p>
      </div>
    </div>
  );
}

export function PassoRegime({
  regime,
  onChange,
}: {
  regime: Enums<"tax_regime">;
  onChange: (regime: Enums<"tax_regime">) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {REGIMES.map((item) => {
        const ativo = regime === item.valor;
        return (
          <button
            key={item.valor}
            type="button"
            onClick={() => onChange(item.valor)}
            aria-pressed={ativo}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors",
              ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent",
            )}
          >
            <span className="font-medium">{item.nome}</span>
            <span className="text-sm text-muted-foreground">{item.explicacao}</span>
          </button>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Isso muda só os relatórios que o Alicerce prepara para o seu contador. Dá para trocar depois
        nas configurações.
      </p>
    </div>
  );
}

export function PassoExpediente({
  profissionais,
  dias,
  onProfissionais,
  onDias,
}: {
  profissionais: { nome: string }[];
  dias: FaixaDia[];
  onProfissionais: (lista: { nome: string }[]) => void;
  onDias: (lista: FaixaDia[]) => void;
}) {
  function alterarDia(dia: number, mudanca: Partial<FaixaDia>) {
    onDias(dias.map((item) => (item.dia === dia ? { ...item, ...mudanca } : item)));
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Label>Quem atende</Label>
        <div className="flex flex-col gap-2">
          {profissionais.map((profissional, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <Input
                value={profissional.nome}
                aria-label={`Nome do profissional ${indice + 1}`}
                placeholder="Nome de quem atende"
                onChange={(evento) =>
                  onProfissionais(
                    profissionais.map((item, i) =>
                      i === indice ? { nome: evento.target.value } : item,
                    ),
                  )
                }
              />
              {profissionais.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${profissional.nome || "profissional"}`}
                  onClick={() => onProfissionais(profissionais.filter((_, i) => i !== indice))}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onProfissionais([...profissionais, { nome: "" }])}
        >
          <Plus aria-hidden />
          Adicionar profissional
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <Label>Horário de funcionamento</Label>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {DIAS_SEMANA.map((dia) => {
            const faixa = dias.find((item) => item.dia === dia.numero);
            if (!faixa) return null;
            return (
              <div key={dia.numero} className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex min-w-36 items-center gap-3">
                  <Switch
                    id={`dia-${dia.numero}`}
                    checked={faixa.aberto}
                    onCheckedChange={(marcado) => alterarDia(dia.numero, { aberto: marcado })}
                  />
                  <Label htmlFor={`dia-${dia.numero}`} className="font-normal">
                    {dia.nome}
                  </Label>
                </div>
                {faixa.aberto ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={faixa.inicio}
                      aria-label={`Abre ${dia.nome}`}
                      className="w-28 font-mono tabular"
                      onChange={(evento) => alterarDia(dia.numero, { inicio: evento.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">às</span>
                    <Input
                      type="time"
                      value={faixa.fim}
                      aria-label={`Fecha ${dia.nome}`}
                      className="w-28 font-mono tabular"
                      onChange={(evento) => alterarDia(dia.numero, { fim: evento.target.value })}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Esse é o horário padrão de todos os profissionais. Folgas e exceções entram na agenda.
        </p>
      </div>
    </div>
  );
}

export function PassoServicos({
  servicos,
  onChange,
}: {
  servicos: ServicoForm[];
  onChange: (lista: ServicoForm[]) => void;
}) {
  function alterar(indice: number, mudanca: Partial<ServicoForm>) {
    onChange(servicos.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Deixe marcados os que você faz e ajuste duração e preço. Dá para acrescentar outros depois.
      </p>

      <div className="flex flex-col gap-3">
        {servicos.map((servico, indice) => (
          <div
            key={indice}
            className={cn(
              "flex flex-col gap-3 rounded-lg border p-3 transition-colors",
              servico.escolhido ? "border-border bg-card" : "border-dashed border-border bg-transparent",
            )}
          >
            <div className="flex items-center gap-3">
              <Checkbox
                id={`servico-${indice}`}
                checked={servico.escolhido}
                onCheckedChange={(marcado) => alterar(indice, { escolhido: marcado === true })}
                aria-label={`Oferecer ${servico.nome || "serviço"}`}
              />
              <Input
                value={servico.nome}
                aria-label={`Nome do serviço ${indice + 1}`}
                placeholder="Nome do serviço"
                onChange={(evento) => alterar(indice, { nome: evento.target.value })}
              />
              {servicos.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${servico.nome || "serviço"}`}
                  onClick={() => onChange(servicos.filter((_, i) => i !== indice))}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3 pl-9">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`duracao-${indice}`} className="text-xs text-muted-foreground">
                  Duração (minutos)
                </Label>
                <Input
                  id={`duracao-${indice}`}
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  value={servico.duracao}
                  className="w-28 font-mono tabular"
                  onChange={(evento) => alterar(indice, { duracao: Number(evento.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`preco-${indice}`} className="text-xs text-muted-foreground">
                  Preço
                </Label>
                <CampoDinheiro
                  id={`preco-${indice}`}
                  valor={servico.preco}
                  className="w-36"
                  onChange={(centavos) => alterar(indice, { preco: centavos })}
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id={`online-${indice}`}
                  checked={servico.online}
                  onCheckedChange={(marcado) => alterar(indice, { online: marcado })}
                />
                <Label htmlFor={`online-${indice}`} className="font-normal text-muted-foreground">
                  Aparece no link de agendamento
                </Label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() =>
          onChange([
            ...servicos,
            { nome: "", duracao: 60, buffer: 0, preco: 10000, online: true, escolhido: true },
          ])
        }
      >
        <Plus aria-hidden />
        Adicionar serviço
      </Button>
    </div>
  );
}
