"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { COOKIE_EMPRESA } from "@/lib/supabase/sessao";

/** Troca a empresa selecionada no seletor do topo. */
export async function selecionarEmpresa(empresaId: string) {
  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app");
}
