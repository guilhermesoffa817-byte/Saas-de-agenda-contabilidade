"use client";

import { AlertTriangle, Archive, Loader2, Pencil, Plus, Search, ShieldX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  apagarDadosDoCliente,
  arquivarCliente,
  registrarLeituraDeAnotacao,
  salvarCliente,
} from "./acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/lib/dates";
import { formatarTelefone } from "@/lib/telefone";

export type ClienteDaTabela = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  documento: string | null;
  tipoPagador: "pf" | "pj";
  aceitaWhatsApp: boolean;
  anotacoes: string | null;
  faltas: number;
  criadoEm: string;
};

function FormularioCliente({
  cliente,
  aoFechar,
}: {
  cliente: ClienteDaTabela | null;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [telefone, setTelefone] = useState(formatarTelefone(cliente?.telefone) || "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [documento, setDocumento] = useState(cliente?.documento ?? "");
  const [tipoPagador, setTipoPagador] = useState<"pf" | "pj">(cliente?.tipoPagador ?? "pf");
  const [aceita, setAceita] = useState(cliente?.aceitaWhatsApp ?? false);
  const [anotacoes, setAnotacoes] = useState(cliente?.anotacoes ?? "");

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await salvarCliente({
      clienteId: cliente?.id,
      nome,
      telefone,
      email,
      documento,
      tipoPagador,
      aceitaWhatsApp: aceita,
      anotacoes,
    });
    setSalvando(false);
    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Cliente salvo.");
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
            <Label htmlFor="cliente-nome-campo">Nome</Label>
            <Input
              id="cliente-nome-campo"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Maria Souza"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cliente-telefone-campo">WhatsApp</Label>
            <Input
              id="cliente-telefone-campo"
              value={telefone}
              inputMode="tel"
              onChange={(evento) => setTelefone(evento.target.value)}
              placeholder="(66) 99999-9999"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cliente-email-campo">E-mail (opcional)</Label>
            <Input
              id="cliente-email-campo"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cliente-documento-campo">CPF ou CNPJ (opcional)</Label>
            <Input
              id="cliente-documento-campo"
              value={documento}
              inputMode="numeric"
              className="font-mono tabular"
              onChange={(evento) => setDocumento(evento.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cliente-pagador">Quem paga</Label>
          <Select value={tipoPagador} onValueChange={(valor) => setTipoPagador(valor as "pf" | "pj")}>
            <SelectTrigger id="cliente-pagador" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pf">Pessoa física</SelectItem>
              <SelectItem value="pj">Empresa (pessoa jurídica)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Separar pessoa física de empresa é o que o contador precisa no Livro-Caixa e na nota.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Switch id="cliente-optin" checked={aceita} onCheckedChange={setAceita} />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="cliente-optin" className="font-normal">
              Aceita receber lembretes pelo WhatsApp
            </Label>
            <span className="text-xs text-muted-foreground">
              Marque só com o consentimento do cliente. A data fica registrada.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cliente-anotacoes">Anotações administrativas</Label>
          <Textarea
            id="cliente-anotacoes"
            value={anotacoes}
            rows={3}
            onChange={(evento) => setAnotacoes(evento.target.value)}
            placeholder="Prefere atendimento pela manhã. Indicada pela Júlia."
          />
          <p className="text-xs text-muted-foreground">
            Não use para dados de saúde: o Alicerce não é prontuário eletrônico.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar cliente
        </Button>
      </DialogFooter>
    </>
  );
}

export function TabelaDeClientes({
  clientes,
  fuso,
  busca,
  souDono = false,
}: {
  clientes: ClienteDaTabela[];
  fuso: string;
  busca: string;
  /** Apagar dados pessoais é direito do titular, mas o botão é só do dono. */
  souDono?: boolean;
}) {
  const [apagando, setApagando] = useState<ClienteDaTabela | null>(null);
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();

  const [texto, setTexto] = useState(busca);
  const [emEdicao, setEmEdicao] = useState<ClienteDaTabela | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [arquivando, iniciar] = useTransition();

  function buscar(valor: string) {
    const novos = new URLSearchParams(parametros.toString());
    if (valor.trim() === "") novos.delete("q");
    else novos.set("q", valor.trim());
    router.push(`${caminho}?${novos.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            buscar(texto);
          }}
        >
          <Input
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar por nome ou WhatsApp"
            className="w-64"
            aria-label="Buscar cliente"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
            <Search aria-hidden />
          </Button>
        </form>

        <Button onClick={() => setNovoAberto(true)}>
          <Plus aria-hidden />
          Novo cliente
        </Button>
      </div>

      {clientes.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Lembretes</TableHead>
                <TableHead>Faltas</TableHead>
                <TableHead>Cliente desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => (
                <TableRow key={cliente.id}>
                  <TableCell>
                    <span className="block">{cliente.nome}</span>
                    {cliente.tipoPagador === "pj" ? (
                      <span className="text-xs text-muted-foreground">Empresa</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {formatarTelefone(cliente.telefone) || "—"}
                  </TableCell>
                  <TableCell>
                    {cliente.aceitaWhatsApp ? (
                      <Badge variant="outline">Autorizado</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem autorização</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {cliente.faltas > 0 ? (
                      <span className="flex items-center gap-1.5 text-sm text-warning">
                        <AlertTriangle className="size-4" aria-hidden />
                        {cliente.faltas}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {formatarData(cliente.criadoEm, fuso)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${cliente.nome}`}
                        onClick={() => {
                          setEmEdicao(cliente);
                          // Quem abriu a anotação fica registrado: é o campo mais
                          // sensível do sistema, mesmo não sendo prontuário.
                          if (cliente.anotacoes) void registrarLeituraDeAnotacao(cliente.id);
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Arquivar ${cliente.nome}`}
                        disabled={arquivando}
                        onClick={() =>
                          iniciar(async () => {
                            const resposta = await arquivarCliente(cliente.id);
                            if (resposta.erro) toast.error(resposta.erro);
                            else toast.success(resposta.aviso ?? "Cliente arquivado.");
                          })
                        }
                      >
                        <Archive aria-hidden />
                      </Button>
                      {souDono ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Apagar dados de ${cliente.nome}`}
                          disabled={arquivando}
                          onClick={() => setApagando(cliente)}
                        >
                          <ShieldX aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {busca
            ? "Nenhum cliente encontrado com esse termo."
            : "Nenhum cliente ainda. Eles entram sozinhos quando alguém agenda pelo seu link."}
        </p>
      )}

      {novoAberto ? (
        <Dialog open onOpenChange={setNovoAberto}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo cliente</DialogTitle>
              <DialogDescription>
                O WhatsApp é o que identifica o cliente na hora de agendar.
              </DialogDescription>
            </DialogHeader>
            <FormularioCliente cliente={null} aoFechar={() => setNovoAberto(false)} />
          </DialogContent>
        </Dialog>
      ) : null}

      {emEdicao ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setEmEdicao(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{emEdicao.nome}</DialogTitle>
              <DialogDescription>Dados do cliente e autorização de lembretes.</DialogDescription>
            </DialogHeader>
            <FormularioCliente cliente={emEdicao} aoFechar={() => setEmEdicao(null)} />
          </DialogContent>
        </Dialog>
      ) : null}

      {apagando ? (
        <AlertDialog open onOpenChange={(aberto) => !aberto && setApagando(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar os dados de {apagando.nome}?</AlertDialogTitle>
              <AlertDialogDescription>
                Nome, telefone, e-mail, CPF e anotações somem para sempre, e a autorização de
                lembrete é retirada. Os atendimentos e os lançamentos continuam, sem identificar a
                pessoa — é o que o seu contador precisa guardar. Não dá para desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  iniciar(async () => {
                    const resposta = await apagarDadosDoCliente(apagando.id);
                    setApagando(null);
                    if (resposta.erro) toast.error(resposta.erro);
                    else toast.success(resposta.aviso ?? "Dados apagados.");
                  })
                }
              >
                Apagar os dados
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
