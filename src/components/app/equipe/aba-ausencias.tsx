"use client";

import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AusenciaDaTela, ColaboradorDaTela } from "./tipos";
import { excluirAusencia, registrarAusencia } from "@/app/(app)/app/equipe/acoes";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AUSENCIAS_POR_VINCULO,
  ROTULO_AUSENCIA,
  diasNoPeriodo,
  formatarDia,
  type TipoDeAusencia,
} from "@/lib/equipe";

export function AbaAusencias({
  mes,
  rotuloDoMes,
  hoje,
  ausencias,
  colaboradores,
}: {
  mes: string;
  rotuloDoMes: string;
  hoje: string;
  ausencias: AusenciaDaTela[];
  /** Todo o cadastro: para dar nome às ausências e escolher quem se ausenta. */
  colaboradores: ColaboradorDaTela[];
}) {
  const [novaAberta, setNovaAberta] = useState(false);
  const [excluindo, setExcluindo] = useState<AusenciaDaTela | null>(null);
  const [processando, iniciar] = useTransition();

  const porId = new Map(colaboradores.map((c) => [c.id, c]));
  // Pode se ausentar quem não foi removido e ainda não tinha saído no começo do mês exibido.
  const disponiveis = colaboradores.filter(
    (c) => !c.removido && (c.fim === null || c.fim >= `${mes}-01`),
  );
  const diaPadrao = hoje.startsWith(mes) ? hoje : `${mes}-01`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorDeMes mes={mes} rotulo={rotuloDoMes} />
        <Button onClick={() => setNovaAberta(true)} disabled={!disponiveis.length}>
          <Plus aria-hidden />
          Registrar ausência
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Férias, folgas e afastamentos de quem é empregado; recesso de estagiário; e os dias em que
        prestadores e parceiros não atendem. Quem atende na agenda tem os horários bloqueados no
        período.
      </p>

      {ausencias.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {colaboradores.length
            ? "Nenhuma ausência neste mês."
            : "Nenhum colaborador ainda. Cadastre a equipe na aba Equipe para registrar ausências."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead>Agenda</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ausencias.map((ausencia) => {
                const nome = porId.get(ausencia.colaboradorId)?.nome ?? "Ex-colaborador";
                return (
                  <TableRow key={ausencia.id}>
                    <TableCell className="font-medium">{nome}</TableCell>
                    <TableCell>{ROTULO_AUSENCIA[ausencia.tipo]}</TableCell>
                    <TableCell className="font-mono text-xs tabular">
                      {ausencia.inicio === ausencia.fim
                        ? formatarDia(ausencia.inicio)
                        : `${formatarDia(ausencia.inicio)} a ${formatarDia(ausencia.fim)}`}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">
                      {diasNoPeriodo(ausencia.inicio, ausencia.fim)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ausencia.bloqueouAgenda ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarOff className="size-4 text-muted-foreground" aria-hidden />
                          Horários bloqueados
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ausência de ${nome}`}
                        onClick={() => setExcluindo(ausencia)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {novaAberta ? (
        <Dialog open onOpenChange={setNovaAberta}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar ausência</DialogTitle>
              <DialogDescription>
                Fica registrado o tipo e o período. Os tipos mudam com o vínculo de cada pessoa.
              </DialogDescription>
            </DialogHeader>
            <FormularioAusencia
              colaboradores={disponiveis}
              diaPadrao={diaPadrao}
              aoFechar={() => setNovaAberta(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {excluindo ? (
        <AlertDialog open onOpenChange={(aberto) => !aberto && setExcluindo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta ausência?</AlertDialogTitle>
              <AlertDialogDescription>
                {excluindo.bloqueouAgenda
                  ? "O bloqueio que ela criou na agenda também sai, e os horários voltam a ficar livres."
                  : "O registro some da lista."}
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
                    const resposta = await excluirAusencia(alvo.id);
                    setExcluindo(null);
                    if (resposta.erro) toast.error(resposta.erro);
                    else toast.success(resposta.aviso ?? "Ausência excluída.");
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

function FormularioAusencia({
  colaboradores,
  diaPadrao,
  aoFechar,
}: {
  colaboradores: ColaboradorDaTela[];
  diaPadrao: string;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [colaboradorId, setColaboradorId] = useState(colaboradores[0]?.id ?? "");
  const colaborador = colaboradores.find((c) => c.id === colaboradorId) ?? null;
  const tipos = colaborador ? AUSENCIAS_POR_VINCULO[colaborador.contrato] : [];
  const [tipo, setTipo] = useState<TipoDeAusencia | "">(tipos[0] ?? "");
  const [inicio, setInicio] = useState(diaPadrao);
  const [fim, setFim] = useState(diaPadrao);

  function escolherColaborador(id: string) {
    setColaboradorId(id);
    const novo = colaboradores.find((c) => c.id === id);
    setTipo(novo ? AUSENCIAS_POR_VINCULO[novo.contrato][0] : "");
  }

  async function salvar() {
    setErro(null);
    if (!tipo) {
      setErro("Escolha o tipo.");
      return;
    }
    setSalvando(true);
    const resposta = await registrarAusencia({ colaboradorId, tipo, inicio, fim });
    setSalvando(false);
    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Ausência registrada.");
    aoFechar();
  }

  const empregado = colaborador?.contrato === "clt" || colaborador?.contrato === "estagio";

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
            <Label htmlFor="ausencia-colaborador">Colaborador</Label>
            <Select value={colaboradorId} onValueChange={escolherColaborador}>
              <SelectTrigger id="ausencia-colaborador" className="w-full">
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
            <Label htmlFor="ausencia-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(valor) => setTipo(valor as TipoDeAusencia)}>
              <SelectTrigger id="ausencia-tipo" className="w-full">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {ROTULO_AUSENCIA[opcao]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ausencia-inicio">Primeiro dia</Label>
            <Input
              id="ausencia-inicio"
              type="date"
              className="font-mono tabular"
              value={inicio}
              onChange={(evento) => {
                setInicio(evento.target.value);
                if (fim < evento.target.value) setFim(evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ausencia-fim">Último dia</Label>
            <Input
              id="ausencia-fim"
              type="date"
              className="font-mono tabular"
              value={fim}
              min={inicio}
              onChange={(evento) => setFim(evento.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          {colaborador?.profissionalId ? (
            <p>
              {colaborador.nome} atende na agenda: os horários do período ficam bloqueados com o
              motivo &quot;Ausência&quot;. Recepção e profissionais não veem o tipo.
            </p>
          ) : colaborador ? (
            <p>{colaborador.nome} não está ligado à agenda, então nenhum horário é bloqueado.</p>
          ) : null}
          {colaborador && !empregado ? (
            <p>
              Para prestadores e parceiros, o Bossa registra só os dias em que a pessoa não atende —
              sem férias, faltas ou folgas, que são próprias de quem é empregado.
            </p>
          ) : null}
          {tipo === "atestado" ? (
            <p>Atestado entra só como período. Não registre diagnóstico, CID nem detalhes de saúde.</p>
          ) : null}
          {tipo === "ferias" || tipo === "recesso" ? (
            <p>O cálculo e o pagamento das férias ou do recesso ficam com o contador.</p>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando || !colaborador}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Registrar ausência
        </Button>
      </DialogFooter>
    </>
  );
}
