// src/lib/pix.ts — Pix "copia e cola" estático (BR Code), sem integração bancária.
// Chave: CPF/CNPJ só números, e-mail, telefone no formato +5566999999999, ou chave aleatória.
// Teste em apps de bancos reais antes de lançar.
function campo(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const limpar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function pixCopiaECola(p: { chave: string; nome: string; cidade: string; valorCents?: number; txid?: string }) {
  const txid = (p.txid ?? "***").replace(/[^A-Za-z0-9*]/g, "").slice(0, 25) || "***";
  const payload =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", p.chave)) +
    campo("52", "0000") +
    campo("53", "986") +
    (p.valorCents ? campo("54", (p.valorCents / 100).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", limpar(p.nome).slice(0, 25)) +
    campo("60", limpar(p.cidade).slice(0, 15)) +
    campo("62", campo("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
