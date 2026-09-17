/**
 * Telefone brasileiro no formato E.164 (+5566999999999), que é o que o WhatsApp usa.
 * Guardamos sempre normalizado; a formatação bonita é só na tela.
 */
export function normalizarTelefone(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  if (digitos === "") return null;

  const sem55 = digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
  // DDD (2) + celular (9) ou fixo (8)
  if (sem55.length !== 10 && sem55.length !== 11) return null;
  const ddd = Number(sem55.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;

  return `+55${sem55}`;
}

export function formatarTelefone(e164: string | null | undefined) {
  if (!e164) return "";
  const digitos = e164.replace(/\D/g, "");
  const sem55 = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (sem55.length === 11) {
    return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 7)}-${sem55.slice(7)}`;
  }
  if (sem55.length === 10) {
    return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 6)}-${sem55.slice(6)}`;
  }
  return e164;
}
