"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { criarAtendimento } from "@/app/(app)/app/agenda/acoes";
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
import { formatarTelefone } from "@/lib/telefone";
import type { ProfissionalDaAgenda, ServicoDaAgenda } from "@/lib/agenda";

export type ClienteResumo = { id: string; nome: string; telefone: string | null };

const NOVO = "novo";

export function DialogoAtendimento({
  aberto,
  aoMudar,
  profissionais,
  servicos,
  clientes,
  inicial,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  profissionais: ProfissionalDaAgenda[];
  servicos: ServicoDaAgenda[];
  clientes: ClienteResumo[];
  inicial: { dia: string; hora: string; profissionalId?: string };
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [clienteId, setClienteId] = useState<string>(NOVO);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "");
  const [profissionalId, setProfissionalId] = useState(
    inicial.profissionalId ?? profissionais[0]?.id ?? "",
  );
  const [dia, setDia] = useState(inicial.dia);
  const [hora, setHora] = useState(inicial.hora);
  const [preco, setPreco] = useState(servicos[0]?.precoCents ?? 0);

  function trocarServico(id: string) {
    setServicoId(id);
    const servico = servicos.find((item) => item.id === id);
    if (servico) setPreco(servico.precoCents);
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await criarAtendimento({
      clienteId: clienteId === NOVO ? undefined : clienteId,
      clienteNome: clienteId === NOVO ? nome : undefined,
      clienteTelefone: clienteId === NOVO ? telefone : undefined,
      servicoId,
      profissionalId,
      dia,
      hora,
      precoCents: preco,
    });
    setSalvando(false);

    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Atendimento marcado.");
    setNome("");
    setTelefone("");
    setClienteId(NOVO);
    aoMudar(false);
  }

  const servico = servicos.find((item) => item.id === servicoId);

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo atendimento</DialogTitle>
          <DialogDescription>
            O horário fica reservado assim que você salvar — o banco não deixa dois no mesmo lugar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {erro ? (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="cliente">Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger id="cliente" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOVO}>+ Novo cliente</SelectItem>
                {clientes.map((cliente) => (
                  <SelectItem key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                    {cliente.telefone ? ` · ${formatarTelefone(cliente.telefone)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {clienteId === NOVO ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="cliente-nome">Nome</Label>
                <Input
                  id="cliente-nome"
                  value={nome}
                  onChange={(evento) => setNome(evento.target.value)}
                  placeholder="Maria Souza"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cliente-telefone">WhatsApp</Label>
                <Input
                  id="cliente-telefone"
                  value={telefone}
                  inputMode="tel"
                  onChange={(evento) => setTelefone(evento.target.value)}
                  placeholder="(66) 99999-9999"
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="servico">Serviço</Label>
              <Select value={servicoId} onValueChange={trocarServico}>
                <SelectTrigger id="servico" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {servicos.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome} · {item.duracaoMin} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profissional-novo">Profissional</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger id="profissional-novo" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {profissionais.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dia-novo">Dia</Label>
              <Input
                id="dia-novo"
                type="date"
                value={dia}
                className="font-mono tabular"
                onChange={(evento) => setDia(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hora-novo">Hora</Label>
              <Input
                id="hora-novo"
                type="time"
                value={hora}
                className="font-mono tabular"
                onChange={(evento) => setHora(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="preco-novo">Valor</Label>
              <CampoDinheiro id="preco-novo" valor={preco} onChange={setPreco} />
            </div>
          </div>

          {servico ? (
            <p className="text-xs text-muted-foreground">
              Reserva de {servico.duracaoMin + servico.bufferMin} minutos na agenda
              {servico.bufferMin > 0
                ? ` (${servico.duracaoMin} de atendimento + ${servico.bufferMin} de preparo)`
                : ""}
              .
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !servicoId || !profissionalId}>
            {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Marcar atendimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
