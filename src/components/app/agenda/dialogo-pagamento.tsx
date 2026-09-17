"use client";

import { Copy, Loader2, QrCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { concluirComPagamento } from "@/app/(app)/app/financeiro/acoes";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pixCopiaECola } from "@/lib/pix";
import { formatarBRL } from "@/lib/money";
import { ROTULO_FORMA_DE_PAGAMENTO } from "@/lib/validacao/financeiro";
import type { ContextoFinanceiro } from "@/lib/agenda";

const SEM_CONTA = "sem-conta";

/**
 * Registrar pagamento ao concluir o atendimento: é aqui que a agenda encontra o
 * financeiro. Uma operação só, feita pelo banco, sem digitar o valor duas vezes.
 */
export function DialogoPagamento({
  atendimento,
  financeiro,
  nomeDaEmpresa,
  aoFechar,
}: {
  atendimento: { id: string; cliente: string; servico: string; precoCents: number };
  financeiro: ContextoFinanceiro;
  nomeDaEmpresa: string;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [valor, setValor] = useState(atendimento.precoCents);
  const [forma, setForma] = useState("pix");
  const [contaId, setContaId] = useState(financeiro.contas[0]?.id ?? SEM_CONTA);

  const mostrarPix = forma === "pix" && Boolean(financeiro.chavePix);
  const codigoPix = mostrarPix
    ? pixCopiaECola({
        chave: financeiro.chavePix!,
        nome: nomeDaEmpresa,
        cidade: financeiro.cidade ?? "BRASIL",
        valorCents: valor,
      })
    : null;

  async function copiarPix() {
    if (!codigoPix) return;
    try {
      await navigator.clipboard.writeText(codigoPix);
      toast.success("Código Pix copiado. Mande para o cliente pagar.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            {atendimento.servico} · {atendimento.cliente}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {erro ? (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="valor-pagamento">Valor recebido</Label>
            <CampoDinheiro id="valor-pagamento" valor={valor} onChange={setValor} />
            {valor !== atendimento.precoCents ? (
              <p className="text-xs text-muted-foreground">
                O preço do serviço é {formatarBRL(atendimento.precoCents)}.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="forma-pagamento">Como recebeu</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger id="forma-pagamento" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROTULO_FORMA_DE_PAGAMENTO).map(([chave, rotulo]) => (
                    <SelectItem key={chave} value={chave}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="conta-pagamento">Entrou em</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger id="conta-pagamento" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CONTA}>Não informar</SelectItem>
                  {financeiro.contas.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mostrarPix && codigoPix ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="size-4" aria-hidden />
                Pix copia e cola de {formatarBRL(valor)}
              </span>
              <code className="max-h-24 overflow-y-auto rounded-md bg-card p-2 font-mono text-[11px] break-all">
                {codigoPix}
              </code>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={copiarPix}>
                <Copy aria-hidden />
                Copiar código Pix
              </Button>
              <p className="text-xs text-muted-foreground">
                O código é gerado com a chave Pix da empresa. A confirmação do pagamento continua
                sendo sua: o Alicerce não fala com o banco.
              </p>
            </div>
          ) : null}

          {forma === "pix" && !financeiro.chavePix ? (
            <p className="text-xs text-muted-foreground">
              Cadastre a chave Pix em Configurações para gerar o código copia e cola aqui.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            disabled={salvando || valor <= 0}
            onClick={async () => {
              setErro(null);
              setSalvando(true);
              const resposta = await concluirComPagamento({
                atendimentoId: atendimento.id,
                valor,
                formaDePagamento: forma as "pix",
                contaId: contaId === SEM_CONTA ? "" : contaId,
              });
              setSalvando(false);
              if (resposta.erro) {
                setErro(resposta.erro);
                return;
              }
              toast.success(resposta.aviso ?? "Atendimento concluído.");
              aoFechar();
            }}
          >
            {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Concluir e lançar {formatarBRL(valor)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
