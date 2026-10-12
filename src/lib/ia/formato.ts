import "server-only";

import type { AutoParseableBetaOutputFormat } from "@anthropic-ai/sdk/lib/beta-parser";
import { z } from "zod";

/**
 * Igual ao betaZodOutputFormat do SDK, mas mantém `enum` no schema enviado (o do
 * SDK empurra o enum para a descrição, e aí a gramática não garante o valor).
 * Valida com Zod no parse.
 */
export function formatoZod<T extends z.ZodType>(esquema: T): AutoParseableBetaOutputFormat<z.infer<T>> {
  const schema = z.toJSONSchema(esquema) as Record<string, unknown>;
  delete schema.$schema;
  return { type: "json_schema", schema, parse: (texto: string) => esquema.parse(JSON.parse(texto)) };
}
