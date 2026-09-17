import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { CHAVE_PUBLICA_SUPABASE, URL_SUPABASE, exigirSupabaseConfigurado } from "./config";
import type { Database } from "./database.types";

/** Cliente do servidor (Server Components, Server Actions e rotas). */
export async function createClient() {
  exigirSupabaseConfigurado();
  const cookieStore = await cookies();
  return createServerClient<Database>(URL_SUPABASE, CHAVE_PUBLICA_SUPABASE, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // chamado de Server Component: o proxy renova a sessão
        }
      },
    },
  });
}
