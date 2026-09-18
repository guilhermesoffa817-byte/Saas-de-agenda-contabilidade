/**
 * Contrato do provedor de NFS-e.
 *
 * A emissão vai por provedor especializado (Focus NFe, PlugNotas/Tecnospeed,
 * Nuvem Fiscal, Notaas e afins): é ele que cuida do leiaute nacional, do DANFSe
 * da NT 008/2026 e dos campos de IBS/CBS. Trocar de provedor deve ser trocar a
 * implementação desta interface, e nada mais.
 *
 * O Alicerce **não calcula imposto**. Os códigos de tributação de cada serviço
 * são configurados pelo contador em `service_tax_codes` e repassados como estão.
 */

export type DadosDoPrestador = {
  razaoSocial: string;
  documento: string; // CPF ou CNPJ, só dígitos
  cidade: string | null;
  estado: string | null;
};

export type DadosDoTomador = {
  nome: string;
  documento: string | null; // opcional: nem toda prefeitura exige
  tipo: "pf" | "pj" | null;
};

export type CodigosDeTributacao = {
  lc116: string | null;
  codigoMunicipal: string | null;
  cnae: string | null;
  descricao: string | null;
};

export type PedidoDeNota = {
  /** Id do lançamento no Alicerce: volta no webhook para fechar o ciclo. */
  referencia: string;
  valorCents: number;
  competencia: string; // AAAA-MM-DD
  prestador: DadosDoPrestador;
  tomador: DadosDoTomador;
  codigos: CodigosDeTributacao;
  descricaoDoServico: string;
};

export type NotaEnviada = {
  /** Id da nota no provedor. É a chave que o webhook traz de volta. */
  idNoProvedor: string;
  status: "processando" | "emitida" | "erro";
  numero?: string | null;
  codigoVerificacao?: string | null;
  urlXml?: string | null;
  urlPdf?: string | null;
  erro?: string | null;
};

export interface ProvedorDeNota {
  readonly nome: string;
  readonly ambiente: "homologacao" | "producao";
  emitir(pedido: PedidoDeNota): Promise<NotaEnviada>;
  consultar(idNoProvedor: string): Promise<NotaEnviada>;
  cancelar(idNoProvedor: string, motivo: string): Promise<NotaEnviada>;
}

/** O que falta para o serviço poder virar nota. Lista vazia = pronto para emitir. */
export function pendenciasParaEmitir(params: {
  prestador: DadosDoPrestador;
  codigos: CodigosDeTributacao;
  valorCents: number;
}) {
  const faltando: string[] = [];

  if (!params.prestador.documento) faltando.push("CPF ou CNPJ do negócio");
  if (!params.prestador.cidade) faltando.push("cidade do negócio");
  if (!params.codigos.lc116 && !params.codigos.codigoMunicipal) {
    faltando.push("código de tributação do serviço (o contador configura)");
  }
  if (!Number.isInteger(params.valorCents) || params.valorCents <= 0) {
    faltando.push("valor do recebimento");
  }

  return faltando;
}

/** Reais com duas casas, que é o que as APIs de nota esperam. */
export function centavosParaReais(cents: number) {
  return Number((cents / 100).toFixed(2));
}
