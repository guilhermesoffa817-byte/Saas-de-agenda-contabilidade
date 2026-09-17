"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  alternarServico,
  salvarExpedienteDoProfissional,
  salvarProfissional,
  salvarServico,
} from "./acoes";
import { CampoDinheiro } from "@/components/app/campo-dinheiro";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DIAS_SEMANA } from "@/lib/dates";
import { formatarBRL } from "@/lib/money";

export type ServicoDaTabela = {
  id: string;
  nome: string;
  duracao: number;
  buffer: number;
  preco: number;
  online: boolean;
  ativo: boolean;
};

export type ProfissionalDaTabela = {
  id: string;
  nome: string;
  cor: string;
  ativo: boolean;
  faixas: { dia: number; inicio: string; fim: string }[];
};

function FormularioServico({
  servico,
  aoFechar,
}: {
  servico: ServicoDaTabela | null;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [duracao, setDuracao] = useState(servico?.duracao ?? 60);
  const [buffer, setBuffer] = useState(servico?.buffer ?? 0);
  const [preco, setPreco] = useState(servico?.preco ?? 10000);
  const [online, setOnline] = useState(servico?.online ?? true);
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await salvarServico({
      servicoId: servico?.id,
      nome,
      duracao,
      buffer,
      preco,
      online,
      ativo,
    });
    setSalvando(false);
    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Serviço salvo.");
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
          <Label htmlFor="servico-nome">Nome</Label>
          <Input
            id="servico-nome"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Corte + barba"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="servico-duracao">Duração (min)</Label>
            <Input
              id="servico-duracao"
              type="number"
              min={5}
              max={600}
              step={5}
              value={duracao}
              className="font-mono tabular"
              onChange={(evento) => setDuracao(Number(evento.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="servico-buffer">Preparo (min)</Label>
            <Input
              id="servico-buffer"
              type="number"
              min={0}
              max={120}
              step={5}
              value={buffer}
              className="font-mono tabular"
              onChange={(evento) => setBuffer(Number(evento.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="servico-preco">Preço</Label>
            <CampoDinheiro id="servico-preco" valor={preco} onChange={setPreco} />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <Switch id="servico-online" checked={online} onCheckedChange={setOnline} />
            <Label htmlFor="servico-online" className="font-normal">
              Aparece no link de agendamento
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="servico-ativo" checked={ativo} onCheckedChange={setAtivo} />
            <Label htmlFor="servico-ativo" className="font-normal">
              Serviço ativo
            </Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          O tempo de preparo entra na agenda depois do atendimento: a reserva total fica de{" "}
          {duracao + buffer} minutos.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar serviço
        </Button>
      </DialogFooter>
    </>
  );
}

function ExpedienteDoProfissional({ profissional }: { profissional: ProfissionalDaTabela }) {
  const [salvando, iniciar] = useTransition();
  const [faixas, setFaixas] = useState(() =>
    DIAS_SEMANA.map((dia) => {
      const existente = profissional.faixas.find((faixa) => faixa.dia === dia.numero);
      return {
        dia: dia.numero,
        aberto: Boolean(existente),
        inicio: existente?.inicio ?? "09:00",
        fim: existente?.fim ?? "18:00",
      };
    }),
  );

  function alterar(dia: number, mudanca: Partial<(typeof faixas)[number]>) {
    setFaixas((atuais) =>
      atuais.map((faixa) => (faixa.dia === dia ? { ...faixa, ...mudanca } : faixa)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {faixas.map((faixa) => {
          const nome = DIAS_SEMANA[faixa.dia].nome;
          return (
            <div key={faixa.dia} className="flex flex-wrap items-center gap-3 p-3">
              <div className="flex min-w-36 items-center gap-3">
                <Switch
                  id={`exp-${profissional.id}-${faixa.dia}`}
                  checked={faixa.aberto}
                  onCheckedChange={(marcado) => alterar(faixa.dia, { aberto: marcado })}
                />
                <Label htmlFor={`exp-${profissional.id}-${faixa.dia}`} className="font-normal">
                  {nome}
                </Label>
              </div>
              {faixa.aberto ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={faixa.inicio}
                    aria-label={`${nome}: começa`}
                    className="w-28 font-mono tabular"
                    onChange={(evento) => alterar(faixa.dia, { inicio: evento.target.value })}
                  />
                  <span className="text-sm text-muted-foreground">às</span>
                  <Input
                    type="time"
                    value={faixa.fim}
                    aria-label={`${nome}: termina`}
                    className="w-28 font-mono tabular"
                    onChange={(evento) => alterar(faixa.dia, { fim: evento.target.value })}
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Não atende</span>
              )}
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        className="w-fit"
        disabled={salvando}
        onClick={() =>
          iniciar(async () => {
            const invalida = faixas.find((faixa) => faixa.aberto && faixa.fim <= faixa.inicio);
            if (invalida) {
              toast.error("O horário de terminar precisa ser depois do de começar.");
              return;
            }
            const resposta = await salvarExpedienteDoProfissional({
              profissionalId: profissional.id,
              faixas: faixas
                .filter((faixa) => faixa.aberto)
                .map((faixa) => ({ dia: faixa.dia, inicio: faixa.inicio, fim: faixa.fim })),
            });
            if (resposta.erro) toast.error(resposta.erro);
            else toast.success(resposta.aviso ?? "Expediente salvo.");
          })
        }
      >
        {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar expediente de {profissional.nome}
      </Button>
    </div>
  );
}

export function GestaoDeServicos({
  servicos,
  profissionais,
}: {
  servicos: ServicoDaTabela[];
  profissionais: ProfissionalDaTabela[];
}) {
  const [novoServico, setNovoServico] = useState(false);
  const [emEdicao, setEmEdicao] = useState<ServicoDaTabela | null>(null);
  const [novoProfissional, setNovoProfissional] = useState("");
  const [processando, iniciar] = useTransition();
  const [escolhido, setEscolhido] = useState(profissionais[0]?.id ?? "");

  const profissional = profissionais.find((item) => item.id === escolhido);

  return (
    <Tabs defaultValue="servicos">
      <TabsList>
        <TabsTrigger value="servicos">Serviços</TabsTrigger>
        <TabsTrigger value="equipe">Quem atende e quando</TabsTrigger>
      </TabsList>

      <TabsContent value="servicos" className="flex flex-col gap-4 pt-6">
        <div className="flex justify-end">
          <Button onClick={() => setNovoServico(true)}>
            <Plus aria-hidden />
            Novo serviço
          </Button>
        </div>

        {servicos.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead>No link público</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicos.map((servico) => (
                  <TableRow key={servico.id}>
                    <TableCell>{servico.nome}</TableCell>
                    <TableCell className="font-mono text-xs tabular">
                      {servico.duracao} min
                      {servico.buffer > 0 ? ` + ${servico.buffer}` : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">
                      {formatarBRL(servico.preco)}
                    </TableCell>
                    <TableCell>
                      {servico.online ? (
                        <Badge variant="outline">Sim</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Só interno</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={servico.ativo}
                        aria-label={`${servico.nome} ativo`}
                        disabled={processando}
                        onCheckedChange={(marcado) =>
                          iniciar(async () => {
                            const resposta = await alternarServico(servico.id, marcado);
                            if (resposta.erro) toast.error(resposta.erro);
                            else toast.success(resposta.aviso ?? "Serviço atualizado.");
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${servico.nome}`}
                        onClick={() => setEmEdicao(servico)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum serviço cadastrado.
          </p>
        )}
      </TabsContent>

      <TabsContent value="equipe" className="flex flex-col gap-6 pt-6">
        <div className="flex flex-col gap-3">
          <Label htmlFor="novo-profissional">Adicionar profissional</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="novo-profissional"
              value={novoProfissional}
              className="w-64"
              placeholder="Nome de quem atende"
              onChange={(evento) => setNovoProfissional(evento.target.value)}
            />
            <Button
              variant="secondary"
              disabled={processando || novoProfissional.trim().length < 2}
              onClick={() =>
                iniciar(async () => {
                  const resposta = await salvarProfissional({
                    nome: novoProfissional,
                    cor: "#0F3D2E",
                    ativo: true,
                  });
                  if (resposta.erro) toast.error(resposta.erro);
                  else {
                    toast.success(resposta.aviso ?? "Profissional salvo.");
                    setNovoProfissional("");
                  }
                })
              }
            >
              <Plus aria-hidden />
              Adicionar
            </Button>
          </div>
        </div>

        {profissionais.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              {profissionais.map((item) => (
                <Button
                  key={item.id}
                  variant={item.id === escolhido ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEscolhido(item.id)}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: item.cor }}
                    aria-hidden
                  />
                  {item.nome}
                  {item.ativo ? "" : " (inativo)"}
                </Button>
              ))}
            </div>

            {profissional ? (
              <ExpedienteDoProfissional key={profissional.id} profissional={profissional} />
            ) : null}
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Cadastre quem atende para a agenda funcionar.
          </p>
        )}
      </TabsContent>

      {novoServico ? (
        <Dialog open onOpenChange={setNovoServico}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo serviço</DialogTitle>
              <DialogDescription>Duração e preço que o cliente vê ao agendar.</DialogDescription>
            </DialogHeader>
            <FormularioServico servico={null} aoFechar={() => setNovoServico(false)} />
          </DialogContent>
        </Dialog>
      ) : null}

      {emEdicao ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setEmEdicao(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{emEdicao.nome}</DialogTitle>
              <DialogDescription>Alterar duração, preço e visibilidade.</DialogDescription>
            </DialogHeader>
            <FormularioServico servico={emEdicao} aoFechar={() => setEmEdicao(null)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </Tabs>
  );
}
