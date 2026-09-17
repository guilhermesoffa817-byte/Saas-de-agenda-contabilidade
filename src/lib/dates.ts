import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Fusos em uso no Brasil. O sistema mostra tudo no fuso da empresa. */
export const FUSOS_BRASIL = [
  { valor: "America/Sao_Paulo", rotulo: "Brasília (GMT-3) — maior parte do país" },
  { valor: "America/Fortaleza", rotulo: "Fortaleza (GMT-3) — CE, RN, PB, PE, AL, SE, PI, MA" },
  { valor: "America/Belem", rotulo: "Belém (GMT-3) — PA, AP, TO" },
  { valor: "America/Cuiaba", rotulo: "Cuiabá (GMT-4) — MT e MS" },
  { valor: "America/Manaus", rotulo: "Manaus (GMT-4) — AM" },
  { valor: "America/Porto_Velho", rotulo: "Porto Velho (GMT-4) — RO" },
  { valor: "America/Boa_Vista", rotulo: "Boa Vista (GMT-4) — RR" },
  { valor: "America/Rio_Branco", rotulo: "Rio Branco (GMT-5) — AC" },
  { valor: "America/Noronha", rotulo: "Fernando de Noronha (GMT-2)" },
] as const;

export const DIAS_SEMANA = [
  { numero: 0, nome: "Domingo", curto: "Dom" },
  { numero: 1, nome: "Segunda-feira", curto: "Seg" },
  { numero: 2, nome: "Terça-feira", curto: "Ter" },
  { numero: 3, nome: "Quarta-feira", curto: "Qua" },
  { numero: 4, nome: "Quinta-feira", curto: "Qui" },
  { numero: 5, nome: "Sexta-feira", curto: "Sex" },
  { numero: 6, nome: "Sábado", curto: "Sáb" },
] as const;

/** Mesma data, lida no fuso da empresa. */
export function naEmpresa(data: Date | string, fuso: string) {
  return new TZDate(typeof data === "string" ? new Date(data) : data, fuso);
}

export function formatarData(data: Date | string, fuso: string) {
  return format(naEmpresa(data, fuso), "dd/MM/yyyy", { locale: ptBR });
}

export function formatarHora(data: Date | string, fuso: string) {
  return format(naEmpresa(data, fuso), "HH:mm", { locale: ptBR });
}

export function formatarDataHora(data: Date | string, fuso: string) {
  return format(naEmpresa(data, fuso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/** "segunda-feira, 5 de outubro" — para cabeçalho da agenda. */
export function formatarDiaLongo(data: Date | string, fuso: string) {
  return format(naEmpresa(data, fuso), "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function formatarMesAno(data: Date | string, fuso: string) {
  return format(naEmpresa(data, fuso), "MMMM 'de' yyyy", { locale: ptBR });
}

/** Dia no calendário da empresa, no formato "2026-10-05". */
export function diaLocalISO(data: Date | string, fuso: string) {
  return format(naEmpresa(data, fuso), "yyyy-MM-dd");
}

/** Hoje, no calendário da empresa. */
export function hojeNaEmpresa(fuso: string) {
  return diaLocalISO(new Date(), fuso);
}

/** Monta um instante a partir de um dia local ("2026-10-05") e uma hora ("14:30"). */
export function instanteNaEmpresa(dia: string, hora: string, fuso: string) {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return new TZDate(ano, mes - 1, diaDoMes, h, m, 0, fuso);
}

/** Diz se um instante já passou (usado em convites e links com prazo). */
export function jaPassou(instante: Date | string) {
  const valor = typeof instante === "string" ? new Date(instante) : instante;
  return valor.getTime() < Date.now();
}
