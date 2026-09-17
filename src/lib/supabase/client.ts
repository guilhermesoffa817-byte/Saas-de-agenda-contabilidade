import { createBrowserClient } from "@supabase/ssr";

import { CHAVE_PUBLICA_SUPABASE, URL_SUPABASE, exigirSupabaseConfigurado } from "./config";
import type { Database } from "./database.types";

/** Cliente do navegador (componentes com "use client"). */
export function createClient() {
  exigirSupabaseConfigurado();
  return createBrowserClient<Database>(URL_SUPABASE, CHAVE_PUBLICA_SUPABASE);
}
