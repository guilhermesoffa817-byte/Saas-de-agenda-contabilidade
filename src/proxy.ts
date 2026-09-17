import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  CHAVE_PUBLICA_SUPABASE,
  URL_SUPABASE,
  supabaseConfigurado,
} from "@/lib/supabase/config";

const PROTEGIDAS = ["/app", "/contador", "/comecar"];

export async function proxy(request: NextRequest) {
  // Sem as chaves do Supabase não há sessão para renovar: as telas do sistema
  // mostram o aviso de configuração e o resto do site continua público.
  if (!supabaseConfigurado) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(URL_SUPABASE, CHAVE_PUBLICA_SUPABASE, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
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
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
