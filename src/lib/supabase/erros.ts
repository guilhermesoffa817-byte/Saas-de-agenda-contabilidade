/**
 * Traduz os erros do Supabase Auth para frases que o dono do negócio entende.
 * A lista de códigos vem de https://supabase.com/docs/guides/auth/debugging/error-codes
 */
const MENSAGENS: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  email_exists: "Já existe uma conta com esse e-mail. Tente entrar.",
  user_already_exists: "Já existe uma conta com esse e-mail. Tente entrar.",
  weak_password: "Essa senha é fraca. Use pelo menos 8 caracteres, com letras e números.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_email_send_rate_limit: "Enviamos muitos e-mails para esse endereço. Espere alguns minutos e tente de novo.",
  over_request_rate_limit: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
  otp_expired: "Esse link expirou. Peça um novo.",
  validation_failed: "Confira os dados digitados.",
  user_not_found: "Não encontramos uma conta com esse e-mail.",
  signup_disabled: "O cadastro está temporariamente desativado.",
  session_expired: "Sua sessão expirou. Entre novamente.",
};

export function mensagemDeErro(erro: { code?: string; message?: string } | null | undefined) {
  if (!erro) return "Não conseguimos concluir. Tente de novo.";
  if (erro.code && MENSAGENS[erro.code]) return MENSAGENS[erro.code];
  if (erro.message?.toLowerCase().includes("invalid login credentials")) {
    return MENSAGENS.invalid_credentials;
  }
  return erro.message ?? "Não conseguimos concluir. Tente de novo.";
}
