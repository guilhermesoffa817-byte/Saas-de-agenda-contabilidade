"use client";

import { CalendarCheck, FileText, Lock, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DialogoLancamento,
  type CategoriaSimples,
  type ContaSimples,
  type LancamentoParaEditar,
} from "./dialogo-lancamento";
import { darBaixa, excluirLancamento, linkDoComprovante } from "@/app/(app)/app/financeiro/acoes";
import { emitirNotaFiscal } from "@/app/(app)/app/financeiro/acoes-nota";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ROTULO_FORMA_DE_PAGAMENTO } from "@/lib/validacao/financeiro";

export type LinhaDeLancamento = {
  id: string;
  tipo: "receita" | "despesa";
  situacao: "pendente" | "pago" | "cancelado";
  descricao: string;
  valorCents: number;
  competencia: string;
  vencimento: string | null;
  pagoEm: string | null;
  formaDePagamento: string | null;
  categoria: string | null;
  categoriaId: string | null;
  conta: string | null;
  contaId: string | null;
  comprovante: string | null;
  doAtendimento: boolean;
  notaFiscalEmitida: boolean;
};

const TODOS = "todos";

export function ListaDeLancamentos({
  empresaId,
  fuso,
  lancamentos,
  categorias,
  contas,
  filtros,
  mesFechado,
  podeEmitirNota = false,
}: {
  empresaId: string;
  fuso: string;
  lancamentos: LinhaDeLancamento[];
  categorias: CategoriaSimples[];
  contas: ContaSimples[];
  filtros: { tipo?: string; categoria?: string; situacao?: string };
  mesFechado: boolean;
  /** Só o plano Negócio, com o provedor contratado, mostra o botão de nota. */
  podeEmitirNota?: boolean;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();

  const [novo, setNovo] = useState<"receita" | "despesa" | null>(null);
  const [editando, setEditando] = useState<LancamentoParaEditar | null>(null);
  const [processando, iniciar] = useTransition();

  function filtrar(chave: string, valor: string) {
    const novos = new URLSearchParams(parametros.toString());
    if (valor === TODOS) novos.delete(chave);
    else novos.set(chave, valor);
    router.push(`${caminho}?${novos.toString()}`);
  }

  async function abrirComprovante(caminhoDoArquivo: string) {
    const resposta = await linkDoComprovante(caminhoDoArquivo);
    if (resposta.erro || !resposta.dados) {
      toast.error(resposta.erro ?? "Não conseguimos abrir o comprovante.");
      return;
    }
    window.open(resposta.dados.url, "_blank", "noopener");
  }

  const total = lancamentos.reduce(
    (soma, item) => soma + (item.tipo === "receita" ? item.valorCents : -item.valorCents),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtros.tipo ?? TODOS} onValueChange={(valor) => filtrar("tipo", valor)}>
            <SelectTrigger className="w-40" aria-label="Filtrar por tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Entradas e saídas</SelectItem>
              <SelectItem value="receita">Só entradas</SelectItem>
              <SelectItem value="despesa">Só saídas</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filtros.categoria ?? TODOS}
            onValueChange={(valor) => filtrar("categoria", valor)}
          >
            <SelectTrigger className="w-52" aria-label="Filtrar por categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as categorias</SelectItem>
              {categorias.map((categoria) => (
                <SelectItem key={categoria.id} value={categoria.id}>
                  {categoria.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtros.situacao ?? TODOS}
            onValueChange={(valor) => filtrar("situacao", valor)}
          >
            <SelectTrigger className="w-40" aria-label="Filtrar por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Qualquer situação</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
              <SelectItem value="pendente">Em aberto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mesFechado ? (
            <Badge variant="outline" className="border-gold text-gold-ink">
              <Lock className="size-3" aria-hidden />
              Mês fechado
            </Badge>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setNovo("despesa")}>
                <Plus aria-hidden />
                Saída
              </Button>
              <Button size="sm" onClick={() => setNovo("receita")}>
                <Plus aria-hidden />
                Entrada
              </Button>
            </>
          )}
        </div>
      </div>

      {lancamentos.length ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.map((lancamento) => (
                  <TableRow key={lancamento.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate">{lancamento.descricao}</span>
                        {lancamento.doAtendimento ? (
                          <Badge variant="secondary" className="shrink-0">
                            <CalendarCheck className="size-3" aria-hidden />
                            da agenda
                          </Badge>
                        ) : null}
                      </span>
                      {lancamento.conta ? (
                        <span className="text-xs text-muted-foreground">{lancamento.conta}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{lancamento.categoria ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs tabular whitespace-nowrap">
                      {lancamento.pagoEm
                        ? formatarData(`${lancamento.pagoEm}T12:00:00Z`, fuso)
                        : lancamento.vencimento
                          ? `vence ${formatarData(`${lancamento.vencimento}T12:00:00Z`, fuso)}`
                          : formatarData(`${lancamento.competencia}T12:00:00Z`, fuso)}
                      {lancamento.formaDePagamento ? (
                        <span className="block font-sans text-muted-foreground">
                          {ROTULO_FORMA_DE_PAGAMENTO[lancamento.formaDePagamento]}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {lancamento.situacao === "pago" ? (
                        <Badge variant="secondary">Pago</Badge>
                      ) : lancamento.situacao === "pendente" ? (
                        <Badge variant="outline">Em aberto</Badge>
                      ) : (
                        <Badge variant="outline">Cancelado</Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular whitespace-nowrap",
                        lancamento.tipo === "receita" ? "text-success" : "text-destructive",
                      )}
                    >
                      {lancamento.tipo === "receita" ? "+" : "−"}
                      {formatarBRL(lancamento.valorCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {lancamento.comprovante ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Ver comprovante"
                            onClick={() => abrirComprovante(lancamento.comprovante!)}
                          >
                            <Paperclip aria-hidden />
                          </Button>
                        ) : null}

                        {podeEmitirNota &&
                        lancamento.tipo === "receita" &&
                        lancamento.situacao === "pago" ? (
                          lancamento.notaFiscalEmitida ? (
                            <Badge variant="outline" className="border-gold text-gold-ink">
                              <FileText className="size-3" aria-hidden />
                              Nota emitida
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={processando}
                              onClick={() =>
                                iniciar(async () => {
                                  const resposta = await emitirNotaFiscal(lancamento.id);
                                  if (resposta.erro) toast.error(resposta.erro);
                                  else toast.success(resposta.aviso ?? "Nota enviada.");
                                  router.refresh();
                                })
                              }
                            >
                              <FileText aria-hidden />
                              Emitir NFS-e
                            </Button>
                          )
                        ) : null}

                        {!mesFechado && lancamento.situacao === "pendente" ? (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={processando}
                            onClick={() =>
                              iniciar(async () => {
                                const resposta = await darBaixa({
                                  lancamentoId: lancamento.id,
                                  dataPagamento: new Date().toISOString().slice(0, 10),
                                  formaDePagamento: "pix",
                                  contaId: "",
                                });
                                if (resposta.erro) toast.error(resposta.erro);
                                else toast.success(resposta.aviso ?? "Pagamento registrado.");
                              })
                            }
                          >
                            Dar baixa
                          </Button>
                        ) : null}

                        {!mesFechado ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar ${lancamento.descricao}`}
                              onClick={() =>
                                setEditando({
                                  id: lancamento.id,
                                  tipo: lancamento.tipo,
                                  descricao: lancamento.descricao,
                                  valorCents: lancamento.valorCents,
                                  pago: lancamento.situacao === "pago",
                                  pagoEm: lancamento.pagoEm,
                                  vencimento: lancamento.vencimento,
                                  competencia: lancamento.competencia,
                                  formaDePagamento: lancamento.formaDePagamento,
                                  categoriaId: lancamento.categoriaId,
                                  contaId: lancamento.contaId,
                                  comprovante: lancamento.comprovante,
                                })
                              }
                            >
                              <Pencil aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Excluir ${lancamento.descricao}`}
                              disabled={processando}
                              onClick={() =>
                                iniciar(async () => {
                                  const resposta = await excluirLancamento(lancamento.id);
                                  if (resposta.erro) toast.error(resposta.erro);
                                  else toast.success(resposta.aviso ?? "Lançamento excluído.");
                                })
                              }
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-sm text-muted-foreground">
            {lancamentos.length} {lancamentos.length === 1 ? "lançamento" : "lançamentos"} no
            período · saldo{" "}
            <span
              className={cn("font-mono tabular", total < 0 ? "text-destructive" : "text-success")}
            >
              {formatarBRL(total)}
            </span>
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento com esses filtros.
        </p>
      )}

      {novo ? (
        <DialogoLancamento
          empresaId={empresaId}
          categorias={categorias}
          contas={contas}
          tipoInicial={novo}
          aoFechar={() => setNovo(null)}
        />
      ) : null}

      {editando ? (
        <DialogoLancamento
          empresaId={empresaId}
          categorias={categorias}
          contas={contas}
          tipoInicial={editando.tipo}
          lancamento={editando}
          aoFechar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}
