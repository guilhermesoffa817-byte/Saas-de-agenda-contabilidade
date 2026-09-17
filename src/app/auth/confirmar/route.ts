import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Destino dos links que o Supabase manda por e-mail (confirmação de cadastro,
 * link de acesso e recuperação de senha). Troca o token por uma sessão e segue
 * para a tela pedida.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const destinoPedido = searchParams.get("voltar");
  const destino = destinoPedido?.startsWith("/") && !destinoPedido.startsWith("//") ? destinoPedido : "/app";

  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destino, origin));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, origin));
  }

  const erro = new URL("/entrar", origin);
  erro.searchParams.set("erro", "link-invalido");
  return NextResponse.redirect(erro);
}
