import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { CABECALHOS_FIXOS, montarCSP, rotaDinamica } from "@/lib/seguranca";
import {
  CHAVE_PUBLICA_SUPABASE,
  URL_SUPABASE,
  supabaseConfigurado,
} from "@/lib/supabase/config";

const PROTEGIDAS = ["/app", "/contador", "/comecar"];

export async function proxy(request: NextRequest) {
  // Um nonce por requisição: é ele que deixa o script do Next carregar sem
  // precisar liberar script inline para o site inteiro.
  const nonce = btoa(crypto.randomUUID());
  const csp = montarCSP({
    nonce,
    desenvolvimento: process.env.NODE_ENV === "development",
    dinamica: rotaDinamica(request.nextUrl.pathname),
  });

  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-nonce", nonce);
  cabecalhos.set("Content-Security-Policy", csp);

  const comSeguranca = (resposta: NextResponse) => {
    resposta.headers.set("Content-Security-Policy", csp);
    for (const { chave, valor } of CABECALHOS_FIXOS) resposta.headers.set(chave, valor);
    return resposta;
  };

  // Sem as chaves do Supabase não há sessão para renovar: as telas do sistema
  // mostram o aviso de configuração e o resto do site continua público.
  if (!supabaseConfigurado) {
    return comSeguranca(NextResponse.next({ request: { headers: cabecalhos } }));
  }

  let response = NextResponse.next({ request: { headers: cabecalhos } });

  const supabase = createServerClient(URL_SUPABASE, CHAVE_PUBLICA_SUPABASE, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: cabecalhos } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const protegida = PROTEGIDAS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && protegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("voltar", request.nextUrl.pathname);
    return comSeguranca(NextResponse.redirect(url));
  }
  return comSeguranca(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
