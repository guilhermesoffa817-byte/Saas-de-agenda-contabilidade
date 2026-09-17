import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { URL_SUPABASE } from "./config";
import type { Database } from "./database.types";

/**
 * Cliente com a chave secreta: ignora a RLS.
 * Só para webhooks, tarefas agendadas e o agendamento público — nunca em componentes.
 */
export function createAdminClient() {
  const chaveSecreta = process.env.SUPABASE_SECRET_KEY;
  if (!URL_SUPABASE || !chaveSecreta) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY no .env.local (a chave secreta nunca leva o prefixo NEXT_PUBLIC).",
    );
  }
  return createSupabaseClient<Database>(URL_SUPABASE, chaveSecreta, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
