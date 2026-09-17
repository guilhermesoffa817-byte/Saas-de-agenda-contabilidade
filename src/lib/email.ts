import "server-only";

import { Resend } from "resend";

/**
 * Envio de e-mail pelo Resend. Enquanto a chave não estiver no .env.local, nada é
 * enviado e quem chamou recebe `enviado: false` — o sistema segue funcionando e
 * mostra o link na tela para a pessoa mandar por WhatsApp.
 */
const REMETENTE = process.env.RESEND_FROM ?? "Alicerce <nao-responda@alicerce.com.br>";

export async function enviarEmail(mensagem: {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { enviado: false as const, motivo: "RESEND_API_KEY não configurada" };

  try {
    const resend = new Resend(chave);
    const { error } = await resend.emails.send({
      from: REMETENTE,
      to: mensagem.para,
      subject: mensagem.assunto,
      html: mensagem.html,
      text: mensagem.texto,
    });
    if (error) return { enviado: false as const, motivo: error.message };
    return { enviado: true as const };
  } catch (erro) {
    return { enviado: false as const, motivo: erro instanceof Error ? erro.message : "erro desconhecido" };
  }
}

/** Moldura simples e sóbria, sem imagem, para os e-mails do sistema. */
export function moldura(conteudo: { titulo: string; corpo: string; botao?: { texto: string; url: string } }) {
  const botao = conteudo.botao
    ? `<p style="margin:24px 0"><a href="${conteudo.botao.url}" style="background:#0F3D2E;color:#FBF9F4;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${conteudo.botao.texto}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#FBF9F4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1C1F1D">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:18px;font-weight:700;margin:0 0 24px">Alicerce</p>
    <h1 style="font-size:22px;margin:0 0 12px">${conteudo.titulo}</h1>
    <div style="font-size:15px;line-height:1.6">${conteudo.corpo}</div>
    ${botao}
    <p style="font-size:12px;color:#5B605B;margin-top:32px">
      Você recebeu este e-mail porque alguém usa o Alicerce para organizar a agenda e o financeiro do negócio.
    </p>
  </div></body></html>`;
}
