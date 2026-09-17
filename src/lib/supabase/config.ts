/**
 * O Supabase só existe depois que as chaves do projeto estiverem no .env.local.
 * Enquanto não estiverem, a página de vendas continua funcionando e as telas do
 * sistema mostram o aviso de configuração em vez de quebrar.
 */
export const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const CHAVE_PUBLICA_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabaseConfigurado = URL_SUPABASE !== "" && CHAVE_PUBLICA_SUPABASE !== "";

export function exigirSupabaseConfigurado() {
  if (!supabaseConfigurado) {
    throw new Error(
      "Faltam as chaves do Supabase. Copie .env.example para .env.local e preencha " +
        "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}
