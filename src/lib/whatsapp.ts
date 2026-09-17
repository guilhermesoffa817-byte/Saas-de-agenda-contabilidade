// src/lib/whatsapp.ts
export function linkWhatsApp(telefoneE164: string, mensagem: string) {
  return `https://wa.me/${telefoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

export const mensagemLembrete = (p: { cliente: string; servico: string; data: string; hora: string; empresa: string }) =>
  `Olá, ${p.cliente}! Passando para lembrar do seu horário de ${p.servico} em ${p.data}, às ${p.hora}, na ${p.empresa}. Posso confirmar?`;
