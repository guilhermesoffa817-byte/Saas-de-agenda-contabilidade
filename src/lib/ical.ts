/**
 * Arquivo .ics (RFC 5545) com os atendimentos de um profissional.
 *
 * O Google Agenda e o calendário do iPhone assinam um endereço e releem de
 * tempos em tempos. Regras que o formato exige e que costumam passar batido:
 * quebra de linha CRLF, linha com no máximo 75 octetos (dobra com um espaço),
 * escape de vírgula, ponto e vírgula, barra invertida e quebra de linha.
 */

const CRLF = "\r\n";

/** Instante em UTC no formato do iCal: 20261005T143000Z. */
export function paraInstanteICal(data: Date | string) {
  const d = typeof data === "string" ? new Date(data) : data;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapa o que o formato reserva. A ordem importa: a barra vem primeiro. */
export function escaparTexto(valor: string) {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Dobra a linha em 75 octetos, continuando com um espaço, como manda o RFC. */
export function dobrarLinha(linha: string) {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;

  const partes: string[] = [];
  let inicio = 0;
  let limite = 75;

  while (inicio < bytes.length) {
    let fim = Math.min(inicio + limite, bytes.length);
    // Não corta no meio de um caractere de vários bytes.
    while (fim > inicio && fim < bytes.length && (bytes[fim] & 0b1100_0000) === 0b1000_0000) {
      fim -= 1;
    }
    partes.push(bytes.subarray(inicio, fim).toString("utf8"));
    inicio = fim;
    limite = 74; // as continuações começam com um espaço
  }

  return partes.join(`${CRLF} `);
}

export type EventoDaAgenda = {
  id: string;
  inicio: string;
  fim: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  cancelado?: boolean;
  atualizadoEm?: string | null;
};

export function montarICal(params: {
  nomeDaAgenda: string;
  dominio: string;
  eventos: EventoDaAgenda[];
  agora?: Date;
}) {
  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alicerce//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparTexto(params.nomeDaAgenda)}`,
    // Quanto tempo o app espera antes de reler. 15 minutos é o que o Google aceita bem.
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];

  for (const evento of params.eventos) {
    linhas.push(
      "BEGIN:VEVENT",
      `UID:${evento.id}@${params.dominio}`,
      `DTSTAMP:${paraInstanteICal(evento.atualizadoEm ?? params.agora ?? new Date())}`,
      `DTSTART:${paraInstanteICal(evento.inicio)}`,
      `DTEND:${paraInstanteICal(evento.fim)}`,
      `SUMMARY:${escaparTexto(evento.titulo)}`,
      `STATUS:${evento.cancelado ? "CANCELLED" : "CONFIRMED"}`,
    );
    if (evento.descricao) linhas.push(`DESCRIPTION:${escaparTexto(evento.descricao)}`);
    if (evento.local) linhas.push(`LOCATION:${escaparTexto(evento.local)}`);
    linhas.push("END:VEVENT");
  }

  linhas.push("END:VCALENDAR");

  return linhas.map(dobrarLinha).join(CRLF) + CRLF;
}
