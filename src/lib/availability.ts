// src/lib/availability.ts
import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { TZDate } from "@date-fns/tz";

export type Intervalo = { start: Date; end: Date };

export function gerarHorariosLivres(params: {
  dia: string;                                   // "2026-10-05", data local da empresa
  timezone: string;                              // "America/Cuiaba"
  expediente: { inicio: string; fim: string }[]; // faixas do dia da semana, ex.: [{ inicio: "08:00", fim: "12:00" }]
  ocupados: Intervalo[];                         // agendamentos ativos + folgas
  duracaoMin: number;                            // duração + buffer do serviço
  passoMin?: number;                             // de quanto em quanto oferecer horários
  agora?: Date;
  antecedenciaMinimaMin?: number;
}): Date[] {
  const { dia, timezone, expediente, ocupados, duracaoMin } = params;
  const passoMin = params.passoMin ?? 15;
  const limite = addMinutes(params.agora ?? new Date(), params.antecedenciaMinimaMin ?? 60);
  const [ano, mes, d] = dia.split("-").map(Number);
  const livres: Date[] = [];

  for (const faixa of expediente) {
    const [hi, mi] = faixa.inicio.split(":").map(Number);
    const [hf, mf] = faixa.fim.split(":").map(Number);
    const inicio = new TZDate(ano, mes - 1, d, hi, mi, 0, timezone).getTime();
    const fim = new TZDate(ano, mes - 1, d, hf, mf, 0, timezone).getTime();

    for (let t = inicio; t + duracaoMin * 60_000 <= fim; t += passoMin * 60_000) {
      const candidato = { start: new Date(t), end: new Date(t + duracaoMin * 60_000) };
      if (candidato.start < limite) continue;
      if (ocupados.some((o) => areIntervalsOverlapping(candidato, o))) continue;
      livres.push(candidato.start);
    }
  }
  return livres;
}
