"use client";

import { Loader2, Paperclip, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { salvarLancamento } from "@/app/(app)/app/financeiro/acoes";
import { CampoDinheiro } from "@/components/app/campo-dinheiro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { ROTULO_FORMA_DE_PAGAMENTO } from "@/lib/validacao/financeiro";

export type CategoriaSimples = { id: string; nome: string; tipo: "receita" | "despesa"; dedutivel: boolean };
export type ContaSimples = { id: string; nome: string };

export type LancamentoParaEditar = {
  id: string;
  tipo: "receita" | "despesa";
  descricao: string;
  valorCents: number;
  pago: boolean;
  pagoEm: string | null;
  vencimento: string | null;
  competencia: string;
  formaDePagamento: string | null;
  categoriaId: string | null;
  contaId: string | null;
  comprovante: string | null;
};

const SEM_CATEGORIA = "sem-categoria";
const SEM_CONTA = "sem-conta";

export function DialogoLancamento({
  empresaId,
  categorias,
  contas,
  tipoInicial,
  lancamento,
  aoFechar,
}: {
  empresaId: string;
  categorias: CategoriaSimples[];
  contas: ContaSimples[];
  tipoInicial: "receita" | "despesa";
  lancamento?: LancamentoParaEditar;
  aoFechar: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);

  const [tipo, setTipo] = useState<"receita" | "despesa">(lancamento?.tipo ?? tipoInicial);
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [valor, setValor] = useState(lancamento?.valorCents ?? 0);
  const [pago, setPago] = useState(lancamento?.pago ?? true);
  const [dataPagamento, setDataPagamento] = useState(lancamento?.pagoEm ?? hoje);
  const [dataVencimento, setDataVencimento] = useState(lancamento?.vencimento ?? hoje);
  const [competencia, setCompetencia] = useState(lancamento?.competencia ?? hoje);
  const [forma, setForma] = useState(lancamento?.formaDePagamento ?? "pix");
  const [categoriaId, setCategoriaId] = useState(lancamento?.categoriaId ?? SEM_CATEGORIA);
  const [contaId, setContaId] = useState(lancamento?.contaId ?? SEM_CONTA);
  const [comprovante, setComprovante] = useState(lancamento?.comprovante ?? "");
  const [repetir, setRepetir] = useState(1);

  const doTipo = categorias.filter((categoria) => categoria.tipo === tipo);
  const categoriaEscolhida = doTipo.find((categoria) => categoria.id === categoriaId);

  async function enviarComprovante(arquivo: File) {
    setErro(null);
    setEnviandoArquivo(true);
    try {
      const supabase = createClient();
      const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const caminho = `${empresaId}/${crypto.randomUUID()}.${extensao}`;
      const { error } = await supabase.storage.from("comprovantes").upload(caminho, arquivo, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        setErro(`Não conseguimos enviar o comprovante: ${error.message}`);
        return;
      }
      setComprovante(caminho);
      toast.success("Comprovante anexado.");
    } finally {
      setEnviandoArquivo(false);
    }
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await salvarLancamento({
      lancamentoId: lancamento?.id,
      tipo,
      descricao,
      valor,
      pago,
      dataPagamento: pago ? dataPagamento : "",
      dataVencimento: pago ? "" : dataVencimento,
      competencia,
      formaDePagamento: pago ? (forma as "pix") : undefined,
      categoriaId: categoriaId === SEM_CATEGORIA ? "" : categoriaId,
      contaId: contaId === SEM_CONTA ? "" : contaId,
      comprovante,
      repetirMeses: lancamento ? 1 : repetir,
    });
    setSalvando(false);

    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Lançamento salvo.");
    aoFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lancamento ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Valores em reais. O mês de competência é o mês a que o lançamento pertence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {erro ? (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tipo-lancamento">Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(valor) => {
                  setTipo(valor as "receita" | "despesa");
                  setCategoriaId(SEM_CATEGORIA);
                }}
              >
                <SelectTrigger id="tipo-lancamento" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Entrada (receita)</SelectItem>
                  <SelectItem value="despesa">Saída (despesa)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="valor-lancamento">Valor</Label>
              <CampoDinheiro id="valor-lancamento" valor={valor} onChange={setValor} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="descricao-lancamento">Descrição</Label>
            <Input
              id="descricao-lancamento"
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              placeholder={tipo === "receita" ? "Venda de produtos" : "Aluguel do espaço"}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="categoria-lancamento">Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger id="categoria-lancamento" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                {doTipo.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoriaEscolhida?.dedutivel ? (
              <p className="text-xs text-muted-foreground">
                Costuma ser dedutível no Livro-Caixa — confirme com seu contador.
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Switch id="pago-lancamento" checked={pago} onCheckedChange={setPago} />
            <Label htmlFor="pago-lancamento" className="font-normal">
              {tipo === "receita" ? "Já recebi este valor" : "Já paguei este valor"}
            </Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {pago ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="data-pagamento">
                  {tipo === "receita" ? "Data do recebimento" : "Data do pagamento"}
                </Label>
                <Input
                  id="data-pagamento"
                  type="date"
                  value={dataPagamento}
                  className="font-mono tabular"
                  onChange={(evento) => setDataPagamento(evento.target.value)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="data-vencimento">Vencimento</Label>
                <Input
                  id="data-vencimento"
                  type="date"
                  value={dataVencimento}
                  className="font-mono tabular"
                  onChange={(evento) => setDataVencimento(evento.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="competencia-lancamento">Mês de competência</Label>
              <Input
                id="competencia-lancamento"
                type="date"
                value={competencia}
                className="font-mono tabular"
                onChange={(evento) => setCompetencia(evento.target.value)}
              />
            </div>
          </div>

          {pago ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="forma-lancamento">Forma de pagamento</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger id="forma-lancamento" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROTULO_FORMA_DE_PAGAMENTO).map(([valor, rotulo]) => (
                      <SelectItem key={valor} value={valor}>
                        {rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="conta-lancamento">Conta</Label>
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger id="conta-lancamento" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CONTA}>Sem conta</SelectItem>
                    {contas.map((conta) => (
                      <SelectItem key={conta.id} value={conta.id}>
                        {conta.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {!lancamento ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="repetir-lancamento">Repetir nos próximos meses</Label>
              <Select value={String(repetir)} onValueChange={(valor) => setRepetir(Number(valor))}>
                <SelectTrigger id="repetir-lancamento" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Não repetir</SelectItem>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Para aluguel, internet e outras contas que chegam todo mês.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="comprovante-lancamento">Comprovante</Label>
            {comprovante ? (
              <div className="flex items-center gap-2 text-sm">
                <Paperclip className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {comprovante.split("/").pop()}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover comprovante"
                  onClick={() => setComprovante("")}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ) : (
              <Input
                id="comprovante-lancamento"
                type="file"
                accept="image/*,application/pdf"
                disabled={enviandoArquivo}
                onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  if (arquivo) void enviarComprovante(arquivo);
                }}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Foto do recibo pelo celular já serve. Fica guardado em pasta privada da sua empresa.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || enviandoArquivo || valor <= 0}>
            {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Salvar lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
