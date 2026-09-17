import { headers } from "next/headers";

/** Endereço público do site (usado nos links de agendamento e de convite). */
export async function enderecoDoSite() {
  const configurado = process.env.NEXT_PUBLIC_APP_URL;
  if (configurado) return configurado.replace(/\/+$/, "");
  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}
