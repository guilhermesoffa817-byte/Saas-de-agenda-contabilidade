import { Document, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Tabela } from "../tipos";

const cores = {
  tinta: "#1C1F1D",
  suave: "#5B605B",
  verde: "#0F3D2E",
  papel: "#FBF9F4",
  borda: "#E2DDD0",
  terracota: "#B3432B",
};

const estilos = StyleSheet.create({
  pagina: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 9,
    color: cores.tinta,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  marca: { fontSize: 12, fontFamily: "Helvetica-Bold", color: cores.verde },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 12 },
  subtitulo: { fontSize: 9, color: cores.suave, marginTop: 2, marginBottom: 14 },
  empresa: { fontSize: 9, color: cores.suave },
  resumoCaixa: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderStyle: "solid",
    backgroundColor: cores.papel,
    padding: 10,
    marginBottom: 14,
  },
  resumoLinha: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  resumoRotulo: { color: cores.suave },
  resumoDestaque: { fontFamily: "Helvetica-Bold", color: cores.tinta },
  cabecalho: {
    flexDirection: "row",
    backgroundColor: cores.verde,
    color: cores.papel,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  celulaCabecalho: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  linha: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
    borderBottomStyle: "solid",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  linhaTotal: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: cores.tinta,
    borderTopStyle: "solid",
    fontFamily: "Helvetica-Bold",
  },
  aviso: { marginTop: 12, fontSize: 8, color: cores.suave },
  rodape: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: cores.suave,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

const dinheiro = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const data = (iso: string) => iso.split("-").reverse().join("/");

function celula(valor: string | number | null, tipo: string) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (tipo === "dinheiro" && typeof valor === "number") return dinheiro(valor);
  if (tipo === "data" && typeof valor === "string") return data(valor);
  return String(valor);
}

/** Relatório em PDF: sóbrio, legível na impressora e com a marca discreta. */
export function DocumentoDeRelatorio({
  tabela,
  empresa,
  geradoEm,
}: {
  tabela: Tabela;
  empresa: { nome: string; documento?: string | null };
  geradoEm: string;
}): ReactElement<DocumentProps> {
  const larguras = tabela.colunas.map((coluna) =>
    coluna.tipo === "texto" ? 2.4 : coluna.tipo === "data" ? 1 : 1.2,
  );
  const soma = larguras.reduce((total, peso) => total + peso, 0);

  return (
    <Document title={`${tabela.titulo} — ${empresa.nome}`} author="Alicerce">
      <Page size="A4" orientation={tabela.colunas.length > 6 ? "landscape" : "portrait"} style={estilos.pagina}>
        <Text style={estilos.marca}>Alicerce</Text>
        <Text style={estilos.empresa}>
          {empresa.nome}
          {empresa.documento ? ` · ${empresa.documento}` : ""}
        </Text>
        <Text style={estilos.titulo}>{tabela.titulo}</Text>
        {tabela.subtitulo ? <Text style={estilos.subtitulo}>{tabela.subtitulo}</Text> : null}

        {tabela.resumo?.length ? (
          <View style={estilos.resumoCaixa}>
            {tabela.resumo.map((item) => (
              <View key={item.rotulo} style={estilos.resumoLinha}>
                <Text style={item.destaque ? estilos.resumoDestaque : estilos.resumoRotulo}>
                  {item.rotulo}
                </Text>
                <Text
                  style={[
                    item.destaque ? estilos.resumoDestaque : {},
                    item.negativo ? { color: cores.terracota } : {},
                  ]}
                >
                  {item.negativo ? "− " : ""}
                  {dinheiro(item.valorCents)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={estilos.cabecalho} fixed>
          {tabela.colunas.map((coluna, indice) => (
            <Text
              key={coluna.chave}
              style={[
                estilos.celulaCabecalho,
                { width: `${(larguras[indice] / soma) * 100}%` },
                coluna.alinhamento === "direita" ? { textAlign: "right" } : {},
              ]}
            >
              {coluna.rotulo}
            </Text>
          ))}
        </View>

        {tabela.linhas.map((linha, indiceDaLinha) => (
          <View key={indiceDaLinha} style={estilos.linha} wrap={false}>
            {tabela.colunas.map((coluna, indice) => (
              <Text
                key={coluna.chave}
                style={[
                  { width: `${(larguras[indice] / soma) * 100}%` },
                  coluna.alinhamento === "direita" ? { textAlign: "right" } : {},
                ]}
              >
                {celula(linha[coluna.chave], coluna.tipo)}
              </Text>
            ))}
          </View>
        ))}

        {tabela.totais ? (
          <View style={estilos.linhaTotal}>
            {tabela.colunas.map((coluna, indice) => {
              const total = tabela.totais?.[coluna.chave];
              return (
                <Text
                  key={coluna.chave}
                  style={[
                    { width: `${(larguras[indice] / soma) * 100}%` },
                    coluna.alinhamento === "direita" ? { textAlign: "right" } : {},
                  ]}
                >
                  {indice === 0 ? "TOTAL" : total === undefined ? "" : celula(total, coluna.tipo)}
                </Text>
              );
            })}
          </View>
        ) : null}

        {tabela.linhas.length === 0 ? (
          <Text style={estilos.aviso}>Nenhum lançamento no período.</Text>
        ) : null}

        {tabela.avisos?.map((aviso) => (
          <Text key={aviso} style={estilos.aviso}>
            {aviso}
          </Text>
        ))}

        <View style={estilos.rodape} fixed>
          <Text>
            Gerado pelo Alicerce em {geradoEm}. Não substitui a contabilidade nem calcula impostos.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
