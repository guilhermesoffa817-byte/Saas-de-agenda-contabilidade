import "server-only";

import { centavosParaReais, type NotaEnviada, type PedidoDeNota, type ProvedorDeNota } from "./tipos";

export * from "./tipos";

/**
 * Escolha do provedor pelo ambiente. Enquanto nenhum estiver contratado, o
 * Alicerce não promete emissão: a tela avisa e o botão fica desligado.
 */
export function nfseConfigurada() {
  return Boolean(process.env.NFSE_PROVIDER && process.env.NFSE_API_KEY);
}

export function ambienteDaNota(): "homologacao" | "producao" {
  return process.env.NFSE_ENV === "producao" ? "producao" : "homologacao";
}

/**
 * Focus NFe é o primeiro provedor ligado. A API dele recebe a nota com uma
 * referência nossa na URL e devolve o resultado por webhook — que é o modelo
 * que os outros também seguem, então trocar é implementar `ProvedorDeNota`.
 */
class FocusNFe implements ProvedorDeNota {
  readonly nome = "focus";
  readonly ambiente = ambienteDaNota();

  private get base() {
    return this.ambiente === "producao"
      ? "https://api.focusnfe.com.br/v2"
      : "https://homologacao.focusnfe.com.br/v2";
  }

  private async chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const token = process.env.NFSE_API_KEY;
    if (!token) throw new Error("Falta NFSE_API_KEY no ambiente.");

    const res = await fetch(`${this.base}${caminho}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // O provedor autentica por Basic com o token no lugar do usuário.
        Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
        ...init.headers,
      },
      cache: "no-store",
    });

    const texto = await res.text();
    if (!res.ok) throw new Error(`NFS-e ${res.status}: ${texto}`);
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  async emitir(pedido: PedidoDeNota): Promise<NotaEnviada> {
    const corpo = {
      data_emissao: new Date().toISOString(),
      prestador: {
        cnpj: pedido.prestador.documento,
        codigo_municipio: pedido.prestador.cidade,
      },
      tomador: {
        cpf: pedido.tomador.tipo === "pf" ? pedido.tomador.documento : undefined,
        cnpj: pedido.tomador.tipo === "pj" ? pedido.tomador.documento : undefined,
        razao_social: pedido.tomador.nome,
      },
      servico: {
        // Repassado como o contador configurou. O Alicerce não calcula imposto.
        item_lista_servico: pedido.codigos.lc116,
        codigo_tributario_municipio: pedido.codigos.codigoMunicipal,
        codigo_cnae: pedido.codigos.cnae,
        discriminacao: pedido.codigos.descricao ?? pedido.descricaoDoServico,
        valor_servicos: centavosParaReais(pedido.valorCents),
      },
    };

    const resposta = await this.chamar<RespostaDoFocus>(
      `/nfse?ref=${encodeURIComponent(pedido.referencia)}`,
      { method: "POST", body: JSON.stringify(corpo) },
    );

    return traduzir(pedido.referencia, resposta);
  }

  async consultar(idNoProvedor: string): Promise<NotaEnviada> {
    const resposta = await this.chamar<RespostaDoFocus>(
      `/nfse/${encodeURIComponent(idNoProvedor)}`,
    );
    return traduzir(idNoProvedor, resposta);
  }

  async cancelar(idNoProvedor: string, motivo: string): Promise<NotaEnviada> {
    const resposta = await this.chamar<RespostaDoFocus>(
      `/nfse/${encodeURIComponent(idNoProvedor)}`,
      { method: "DELETE", body: JSON.stringify({ justificativa: motivo }) },
    );
    return { ...traduzir(idNoProvedor, resposta), status: "emitida" };
  }
}

type RespostaDoFocus = {
  status?: string;
  numero?: string;
  codigo_verificacao?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfse?: string;
  erros?: { mensagem?: string }[];
  mensagem?: string;
};

/** Converte o vocabulário do provedor para o nosso, que é o que vai ao banco. */
export function traduzir(referencia: string, resposta: RespostaDoFocus): NotaEnviada {
  const status =
    resposta.status === "autorizado"
      ? "emitida"
      : resposta.status === "erro_autorizacao" || resposta.status === "cancelado"
        ? "erro"
        : "processando";

  return {
    idNoProvedor: referencia,
    status,
    numero: resposta.numero ?? null,
    codigoVerificacao: resposta.codigo_verificacao ?? null,
    urlXml: resposta.caminho_xml_nota_fiscal ?? null,
    urlPdf: resposta.caminho_danfse ?? null,
    erro: resposta.erros?.[0]?.mensagem ?? resposta.mensagem ?? null,
  };
}

export function provedorDeNota(): ProvedorDeNota {
  const escolhido = process.env.NFSE_PROVIDER;
  if (escolhido === "focus") return new FocusNFe();
  throw new Error(
    `Provedor de NFS-e "${escolhido ?? "(vazio)"}" não está ligado. Configure NFSE_PROVIDER.`,
  );
}
