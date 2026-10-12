"use client";

import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { BaseDoMes, ColaboradorDaTela, ContaSimples, PagamentoDaTela } from "./tipos";
import { excluirPagamento, registrarPagamento } from "@/app/(app)/app/equipe/acoes";
import { CampoDinheiro } from "@/components/app/campo-dinheiro";
import { SeletorDeMes } from "@/components/app/financeiro/seletor-mes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PAGAMENTOS_POR_VINCULO,
  ROTULO_PAGAMENTO,
  VINCULOS,
  ativoNoMes,
  categoriaDoPagamento,
  formatarDia,
  limitesDoMes,
  remuneracaoDoVinculo,
  resumirRemuneracao,
  tipoDePagamentoSugerido,
  valorDoTipoDePagamento,
  valorSugeridoDoMes,
  type TipoDePagamento,
  type ValorSugerido,
} from "@/lib/equipe";
import { formatarBRL } from "@/lib/money";
import { ROTULO_FORMA_DE_PAGAMENTO } from "@/lib/validacao/financeiro";

const SEM_CONTA = "sem-conta";
const FORMAS = ["pix", "transferencia", "dinheiro", "boleto", "cartao_debito", "cartao_credito", "outro"] as const;
type Forma = (typeof FORMAS)[number];

const ZERADO: ValorSugerido = { fixoCents: 0, percentualCents: 0, porAtendimentoCents: 0, totalCents: 0 };

function sugestaoDe(colaborador: ColaboradorDaTela, base: BaseDoMes | undefined) {
  const combinado = remuneracaoDoVinculo(colaborador.contrato, colaborador);
  return valorSugeridoDoMes({
    ...combinado,
    baseCents: base?.baseCents ?? 0,
    atendimentos: base?.atendimentos ?? 0,
  });
}

type Abertura = { colaboradorId: string | null };

export function AbaPagamentos({
  mes,
  rotuloDoMes,
  hoje,
  colaboradores,
  pagamentos,
  bases,
  contas,
  mesesFechados,
}: {
  mes: string;
  rotuloDoMes: string;
  hoje: string;
  colaboradores: ColaboradorDaTela[];
  pagamentos: PagamentoDaTela[];
  bases: Record<string, BaseDoMes>;
  contas: ContaSimples[];
  mesesFechados: string[];
}) {
  const [abertura, setAbertura] = useState<Abertura | null>(null);
  const [excluindo, setExcluindo] = useState<PagamentoDaTela | null>(null);
  const [processando, iniciar] = useTransition();

  const porId = new Map(colaboradores.map((c) => [c.id, c]));
  const doMes = colaboradores.filter((c) => !c.removido && ativoNoMes(c, mes));
  // Rescisão ou acerto de quem já saiu também entra: qualquer um que não foi removido.
  const pagaveis = colaboradores.filter((c) => !c.removido && c.inicio <= limitesDoMes(mes).ate);

  const pagoPorColaborador = new Map<string, number>();
  for (const pagamento of pagamentos) {
    pagoPorColaborador.set(
      pagamento.colaboradorId,
      (pagoPorColaborador.get(pagamento.colaboradorId) ?? 0) + pagamento.valorCents,
    );
  }
  const totalPago = pagamentos.reduce((soma, p) => soma + p.valorCents, 0);
  const totalSugerido = doMes.reduce((soma, c) => soma + sugestaoDe(c, bases[c.id]).totalCents, 0);

  const temPorAtendimento = doMes.some((c) => remuneracaoDoVinculo(c.contrato, c).porAtendimentoCents > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorDeMes mes={mes} rotulo={rotuloDoMes} />
        <Button onClick={() => setAbertura({ colaboradorId: null })} disabled={!pagaveis.length}>
          <Plus aria-hidden />
          Registrar pagamento
        </Button>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-combinado">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-combinado" className="text-lg font-semibold">
            Combinado do mês
          </h2>
          <p className="text-sm text-muted-foreground">
            A sugestão é só a conta do que foi combinado: valor fixo, mais o percentual sobre o que
            entrou dos atendimentos no mês, mais o valor por atendimento. Para CLT e estágio, registre
            o valor que o contador mandou — o Bossa não calcula salário líquido, descontos nem
            encargos.
          </p>
        </div>

        {doMes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {colaboradores.length
              ? "Ninguém da equipe trabalhou neste mês."
              : "Nenhum colaborador ainda. Cadastre a equipe na aba Equipe para acompanhar os pagamentos."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Combinado</TableHead>
                  <TableHead className="text-right">Entrou dos atendimentos</TableHead>
                  {temPorAtendimento ? (
                    <TableHead className="text-right">Atendimentos</TableHead>
                  ) : null}
                  <TableHead className="text-right">Sugerido</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doMes.map((colaborador) => {
                  const combinado = remuneracaoDoVinculo(colaborador.contrato, colaborador);
                  const base = bases[colaborador.id];
                  const sugerido = sugestaoDe(colaborador, base);
                  const usaBase = combinado.percentualBps > 0 || combinado.porAtendimentoCents > 0;
                  return (
                    <TableRow key={colaborador.id}>
                      <TableCell>
                        <span className="block font-medium">{colaborador.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {VINCULOS[colaborador.contrato].curto}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {resumirRemuneracao(colaborador.contrato, combinado)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {!usaBase ? (
                          <span className="text-muted-foreground">—</span>
                        ) : colaborador.profissionalId ? (
                          combinado.percentualBps > 0 ? (
                            formatarBRL(base?.baseCents ?? 0)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        ) : (
                          <span className="font-sans text-xs text-muted-foreground">
                            Não ligado à agenda
                          </span>
                        )}
                      </TableCell>
                      {temPorAtendimento ? (
                        <TableCell className="text-right font-mono tabular">
                          {combinado.porAtendimentoCents > 0 && base?.atendimentos != null
                            ? base.atendimentos
                            : "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right font-mono tabular">
                        {sugerido.totalCents > 0 ? formatarBRL(sugerido.totalCents) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {formatarBRL(pagoPorColaborador.get(colaborador.id) ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAbertura({ colaboradorId: colaborador.id })}
                        >
                          Registrar pagamento
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={temPorAtendimento ? 4 : 3}>Total do mês</TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {formatarBRL(totalSugerido)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {formatarBRL(totalPago)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-pagamentos">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-pagamentos" className="text-lg font-semibold">
            Pagamentos registrados
          </h2>
          <p className="text-sm text-muted-foreground">
            Com referência a {rotuloDoMes}. Cada pagamento já entra no Financeiro como despesa paga.
          </p>
        </div>

        {pagamentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum pagamento registrado com referência a este mês.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagamentos.map((pagamento) => {
                  const nome = porId.get(pagamento.colaboradorId)?.nome ?? "Ex-colaborador";
                  const fechado = mesesFechados.includes(pagamento.pagoEm.slice(0, 7));
                  return (
                    <TableRow key={pagamento.id}>
                      <TableCell className="font-medium">{nome}</TableCell>
                      <TableCell>{ROTULO_PAGAMENTO[pagamento.tipo]}</TableCell>
                      <TableCell className="font-mono text-xs tabular">
                        {formatarDia(pagamento.pagoEm)}
                        {fechado ? (
                          <Badge variant="outline" className="ml-2 border-gold text-gold-ink">
                            <Lock className="size-3" aria-hidden />
                            Mês fechado
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular text-destructive">
                        {formatarBRL(pagamento.valorCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir pagamento de ${nome}`}
                          onClick={() => setExcluindo(pagamento)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total pago</TableCell>
                  <TableCell className="text-right font-mono tabular">{formatarBRL(totalPago)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      {abertura ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setAbertura(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar pagamento</DialogTitle>
              <DialogDescription>
                O valor já vem com a conta do combinado. Confira e ajuste antes de salvar.
              </DialogDescription>
            </DialogHeader>
            <FormularioPagamento
              colaboradores={pagaveis}
              colaboradorInicial={abertura.colaboradorId}
              sugestoes={Object.fromEntries(
                pagaveis.map((c) => [c.id, ativoNoMes(c, mes) ? sugestaoDe(c, bases[c.id]) : ZERADO]),
              )}
              mes={mes}
              hoje={hoje}
              contas={contas}
              mesesFechados={mesesFechados}
              aoFechar={() => setAbertura(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {excluindo ? (
        <AlertDialog open onOpenChange={(aberto) => !aberto && setExcluindo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este pagamento?</AlertDialogTitle>
              <AlertDialogDescription>
                A despesa de {formatarBRL(excluindo.valorCents)} lançada no Financeiro também é
                apagada. Se o mês do pagamento já foi fechado, reabra o fechamento antes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={processando}
                onClick={(evento) => {
                  evento.preventDefault();
                  const alvo = excluindo;
                  iniciar(async () => {
                    const resposta = await excluirPagamento(alvo.id);
                    setExcluindo(null);
                    if (resposta.erro) toast.error(resposta.erro);
                    else toast.success(resposta.aviso ?? "Pagamento excluído.");
                  });
                }}
              >
                {processando ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function FormularioPagamento({
  colaboradores,
  colaboradorInicial,
  sugestoes,
  mes,
  hoje,
  contas,
  mesesFechados,
  aoFechar,
}: {
  colaboradores: ColaboradorDaTela[];
  colaboradorInicial: string | null;
  sugestoes: Record<string, ValorSugerido>;
  mes: string;
  hoje: string;
  contas: ContaSimples[];
  mesesFechados: string[];
  aoFechar: () => void;
}) {
  const inicial = colaboradores.find((c) => c.id === colaboradorInicial) ?? colaboradores[0] ?? null;
  const tipoInicial = inicial
    ? tipoDePagamentoSugerido(inicial.contrato, remuneracaoDoVinculo(inicial.contrato, inicial))
    : "outro";

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [colaboradorId, setColaboradorId] = useState(inicial?.id ?? "");
  const [tipo, setTipo] = useState<TipoDePagamento>(tipoInicial);
  const [mesDeReferencia, setMesDeReferencia] = useState(mes);
  const [valorCents, setValorCents] = useState(
    inicial ? valorDoTipoDePagamento(tipoInicial, sugestoes[inicial.id] ?? ZERADO) : 0,
  );
  const [pagoEm, setPagoEm] = useState(hoje);
  const [contaId, setContaId] = useState(contas[0]?.id ?? SEM_CONTA);
  const [forma, setForma] = useState<Forma>("pix");

  const colaborador = colaboradores.find((c) => c.id === colaboradorId) ?? null;
  const tipos = colaborador ? PAGAMENTOS_POR_VINCULO[colaborador.contrato] : [];
  const pagoEmFechado = mesesFechados.includes(pagoEm.slice(0, 7));

  function sugestaoPara(id: string, novoTipo: TipoDePagamento) {
    return valorDoTipoDePagamento(novoTipo, sugestoes[id] ?? ZERADO);
  }

  function escolherColaborador(id: string) {
    setColaboradorId(id);
    const novo = colaboradores.find((c) => c.id === id);
    if (!novo) return;
    const novoTipo = tipoDePagamentoSugerido(novo.contrato, remuneracaoDoVinculo(novo.contrato, novo));
    setTipo(novoTipo);
    setValorCents(sugestaoPara(id, novoTipo));
  }

  function escolherTipo(novoTipo: TipoDePagamento) {
    setTipo(novoTipo);
    setValorCents(sugestaoPara(colaboradorId, novoTipo));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await registrarPagamento({
      colaboradorId,
      tipo,
      mes: mesDeReferencia,
      valorCents,
      pagoEm,
      contaId: contaId === SEM_CONTA ? "" : contaId,
      forma,
    });
    setSalvando(false);
    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Pagamento registrado.");
    aoFechar();
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-colaborador">Colaborador</Label>
            <Select value={colaboradorId} onValueChange={escolherColaborador}>
              <SelectTrigger id="pagamento-colaborador" className="w-full">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(valor) => escolherTipo(valor as TipoDePagamento)}>
              <SelectTrigger id="pagamento-tipo" className="w-full">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {ROTULO_PAGAMENTO[opcao]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-valor">Valor pago</Label>
            <CampoDinheiro id="pagamento-valor" valor={valorCents} onChange={setValorCents} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-referencia">Mês de referência</Label>
            <Input
              id="pagamento-referencia"
              type="month"
              className="font-mono tabular"
              value={mesDeReferencia}
              onChange={(evento) => setMesDeReferencia(evento.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-data">Pago em</Label>
            <Input
              id="pagamento-data"
              type="date"
              className="font-mono tabular"
              value={pagoEm}
              onChange={(evento) => setPagoEm(evento.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-conta">Saiu da conta</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger id="pagamento-conta" className="w-full">
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-forma">Forma</Label>
            <Select value={forma} onValueChange={(valor) => setForma(valor as Forma)}>
              <SelectTrigger id="pagamento-forma" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {ROTULO_FORMA_DE_PAGAMENTO[opcao]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>
            Entra no Financeiro como despesa paga, na categoria{" "}
            <span className="font-medium text-foreground">{categoriaDoPagamento(tipo)}</span>. A
            descrição leva o tipo e o nome abreviado, sem CPF.
          </p>
          {colaborador?.contrato === "clt" || colaborador?.contrato === "estagio" ? (
            <p>
              Use o valor do holerite, do recibo ou da guia que o contador mandou. O valor que vem
              preenchido é o combinado bruto e pode ser diferente do que foi pago.
            </p>
          ) : null}
          {colaborador?.contrato === "parceria" ? (
            <p>
              Confira com seu contador como a cota-parte do profissional-parceiro entra na receita
              bruta do salão.
            </p>
          ) : null}
          {pagoEmFechado ? (
            <p className="text-warning">
              O mês dessa data de pagamento já foi fechado. Reabra o fechamento no Financeiro antes de
              registrar.
            </p>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando || !colaborador}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Registrar pagamento
        </Button>
      </DialogFooter>
    </>
  );
}
