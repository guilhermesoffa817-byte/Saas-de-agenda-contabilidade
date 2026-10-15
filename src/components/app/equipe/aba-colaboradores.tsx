"use client";

import { CalendarCheck, Loader2, Pencil, Plus, Trash2, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AvisoDaAgenda } from "./aviso-da-agenda";
import { FormularioColaborador } from "./formulario-colaborador";
import type { ColaboradorDaTela, DadosPessoaisDaTela, ProfissionalDaAgenda } from "./tipos";
import {
  carregarDadosPessoais,
  desligarColaborador,
  removerColaborador,
} from "@/app/(app)/app/equipe/acoes";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  VINCULOS,
  estaAtivo,
  formatarDia,
  profissionaisLivres,
  resumirRemuneracao,
  type Contrato,
} from "@/lib/equipe";

type Edicao = { colaborador: ColaboradorDaTela | null; pessoais: DadosPessoaisDaTela | null };

function Situacao({ colaborador, hoje }: { colaborador: ColaboradorDaTela; hoje: string }) {
  if (colaborador.removido) {
    return <span className="text-sm text-muted-foreground">Removido, sem dados pessoais</span>;
  }
  if (colaborador.inicio > hoje) {
    return (
      <span className="text-sm">
        Começa em <span className="font-mono text-xs tabular">{formatarDia(colaborador.inicio)}</span>
      </span>
    );
  }
  if (estaAtivo(colaborador, hoje)) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-success text-success">
          Ativo
        </Badge>
        {colaborador.fim ? (
          <span className="text-xs text-muted-foreground">
            até <span className="font-mono tabular">{formatarDia(colaborador.fim)}</span>
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="text-sm text-muted-foreground">
      Desligado em{" "}
      <span className="font-mono text-xs tabular">{formatarDia(colaborador.fim ?? hoje)}</span>
    </span>
  );
}

export function AbaColaboradores({
  colaboradores,
  profissionais,
  contratos,
  hoje,
}: {
  colaboradores: ColaboradorDaTela[];
  profissionais: ProfissionalDaAgenda[];
  contratos: Contrato[];
  hoje: string;
}) {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [desligando, setDesligando] = useState<ColaboradorDaTela | null>(null);
  const [removendo, setRemovendo] = useState<ColaboradorDaTela | null>(null);
  const [abrindo, iniciarAbertura] = useTransition();
  const [processando, iniciar] = useTransition();

  const nomeDoProfissional = new Map(profissionais.map((p) => [p.id, p.nome]));

  // Ativos e futuros primeiro; depois desligados; ex-colaboradores no fim.
  const ordem = (c: ColaboradorDaTela) =>
    c.removido ? 2 : c.fim !== null && c.fim < hoje ? 1 : 0;
  const lista = [...colaboradores].sort(
    (a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  function abrirEdicao(colaborador: ColaboradorDaTela) {
    iniciarAbertura(async () => {
      const resposta = await carregarDadosPessoais(colaborador.id);
      if (resposta.erro) {
        toast.error(resposta.erro);
        return;
      }
      setEdicao({ colaborador, pessoais: resposta.dados ?? null });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {colaboradores.length
            ? "Quem trabalha com você, o vínculo e o que foi combinado com cada um."
            : null}
        </p>
        <Button onClick={() => setEdicao({ colaborador: null, pessoais: null })}>
          <Plus aria-hidden />
          Novo colaborador
        </Button>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum colaborador ainda. Cadastre quem trabalha com você para acompanhar ausências e
          pagamentos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Combinado</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Agenda</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((colaborador) => {
                const profissional = colaborador.profissionalId
                  ? nomeDoProfissional.get(colaborador.profissionalId)
                  : null;
                const desligado = colaborador.fim !== null && colaborador.fim < hoje;
                return (
                  <TableRow
                    key={colaborador.id}
                    className={colaborador.removido ? "text-muted-foreground" : undefined}
                  >
                    <TableCell>
                      <span className="block font-medium">{colaborador.nome}</span>
                      {colaborador.cargo ? (
                        <span className="text-xs text-muted-foreground">{colaborador.cargo}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{VINCULOS[colaborador.contrato].curto}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {colaborador.removido ? "—" : resumirRemuneracao(colaborador.contrato, colaborador)}
                    </TableCell>
                    <TableCell>
                      <Situacao colaborador={colaborador} hoje={hoje} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {profissional ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarCheck className="size-4 text-success" aria-hidden />
                          {profissional}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {colaborador.removido ? null : (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${colaborador.nome}`}
                            disabled={abrindo}
                            onClick={() => abrirEdicao(colaborador)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          {desligado ? null : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Desligar ${colaborador.nome}`}
                              onClick={() => setDesligando(colaborador)}
                            >
                              <UserMinus aria-hidden />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remover ${colaborador.nome}`}
                            onClick={() => setRemovendo(colaborador)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {edicao ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setEdicao(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {edicao.colaborador ? `Editar ${edicao.colaborador.nome}` : "Novo colaborador"}
              </DialogTitle>
              <DialogDescription>
                O cadastro serve para você acompanhar a equipe e o que paga a cada um. A folha oficial
                continua com o seu contador.
              </DialogDescription>
            </DialogHeader>
            <FormularioColaborador
              colaborador={edicao.colaborador}
              pessoais={edicao.pessoais}
              contratos={
                edicao.colaborador && !contratos.includes(edicao.colaborador.contrato)
                  ? [...contratos, edicao.colaborador.contrato]
                  : contratos
              }
              profissionais={profissionaisLivres(
                profissionais,
                colaboradores,
                edicao.colaborador?.id,
              )}
              hoje={hoje}
              aoFechar={() => setEdicao(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {desligando ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setDesligando(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Desligar {desligando.nome}</DialogTitle>
              <DialogDescription>
                O cadastro e os pagamentos continuam aqui. A partir do dia seguinte, a pessoa deixa de
                aparecer entre os ativos.
              </DialogDescription>
            </DialogHeader>
            <FormularioDesligamento
              colaborador={desligando}
              profissional={
                desligando.profissionalId
                  ? (profissionais.find((p) => p.id === desligando.profissionalId) ?? null)
                  : null
              }
              hoje={hoje}
              aoFechar={() => setDesligando(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {removendo ? (
        <AlertDialog open onOpenChange={(aberto) => !aberto && setRemovendo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover {removendo.nome}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2">
                  <span>
                    Se ainda não há pagamentos registrados, o cadastro some por completo, com as
                    ausências e os bloqueios que elas criaram na agenda.
                  </span>
                  <span>
                    Se já há pagamentos, eles continuam no Financeiro para o contador, com os valores,
                    mas sem identificar a pessoa: o nome vira &quot;Ex-colaborador&quot; (também na
                    descrição dos lançamentos) e são apagados CPF, Pix, contato, observações, as
                    ausências com os bloqueios na agenda e a ligação com o profissional da agenda.
                  </span>
                  {removendo.profissionalId ? (
                    <span>
                      O profissional ligado na agenda é desativado e deixa de receber agendamentos
                      online. Os atendimentos já marcados continuam lá.
                    </span>
                  ) : null}
                  <span>Não dá para desfazer.</span>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={processando}
                variant="destructive"
                onClick={(evento) => {
                  evento.preventDefault();
                  const alvo = removendo;
                  iniciar(async () => {
                    const resposta = await removerColaborador(alvo.id);
                    setRemovendo(null);
                    if (resposta.erro) toast.error(resposta.erro);
                    else toast.success(resposta.aviso ?? "Colaborador removido.");
                  });
                }}
              >
                {processando ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function FormularioDesligamento({
  colaborador,
  profissional,
  hoje,
  aoFechar,
}: {
  colaborador: ColaboradorDaTela;
  profissional: ProfissionalDaAgenda | null;
  hoje: string;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fim, setFim] = useState(colaborador.inicio > hoje ? colaborador.inicio : hoje);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await desligarColaborador({ colaboradorId: colaborador.id, fim });
    setSalvando(false);
    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Desligamento registrado.");
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="desligamento-fim">Último dia de trabalho</Label>
          <Input
            id="desligamento-fim"
            type="date"
            className="font-mono tabular"
            value={fim}
            min={colaborador.inicio}
            onChange={(evento) => setFim(evento.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {colaborador.contrato === "clt" || colaborador.contrato === "estagio"
            ? "Aviso prévio, rescisão e baixa na carteira ou no termo de estágio são feitos pelo contador. Quando ele mandar os valores, registre o pagamento na aba Pagamentos."
            : "Encerrar o contrato de prestação de serviço ou de parceria segue o que foi assinado. Se houver valor a acertar, registre na aba Pagamentos."}
        </p>
        {profissional?.ativo ? <AvisoDaAgenda nome={profissional.nome} fim={fim} hoje={hoje} /> : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Registrar desligamento
        </Button>
      </DialogFooter>
    </>
  );
}
