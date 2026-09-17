import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import { DocumentoDeRelatorio } from "./documento";
import type { Tabela } from "../tipos";

/** Gera o PDF do relatório no servidor. */
export async function tabelaParaPDF(
  tabela: Tabela,
  empresa: { nome: string; documento?: string | null },
  geradoEm: string,
) {
  return renderToBuffer(
    <DocumentoDeRelatorio tabela={tabela} empresa={empresa} geradoEm={geradoEm} />,
  );
}
