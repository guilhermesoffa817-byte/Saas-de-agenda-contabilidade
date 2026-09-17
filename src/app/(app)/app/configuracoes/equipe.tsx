"use client";

import { Copy, Loader2, Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { alterarPapel, cancelarConvite, convidarMembro, removerMembro } from "./acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatarData } from "@/lib/dates";
import type { Enums } from "@/lib/supabase/database.types";

const PAPEIS: { valor: Enums<"member_role">; nome: string; explicacao: string }[] = [
  { valor: "dono", nome: "Dono", explicacao: "Vê e faz tudo, inclusive financeiro e assinatura." },
  { valor: "recepcao", nome: "Recepção", explicacao: "Agenda, clientes e recebimentos. Sem relatórios." },
  { valor: "profissional", nome: "Profissional", explicacao: "Agenda e clientes. Sem financeiro." },
  { valor: "contador", nome: "Contador", explicacao: "Só leitura do financeiro e dos relatórios." },
];

export type MembroDaEquipe = {
  userId: string;
  nome: string;
  email: string;
  papel: Enums<"member_role">;
  desde: string;
};

export type ConvitePendente = {
  id: string;
  email: string;
  papel: Enums<"member_role">;
  expiraEm: string;
};

export function Equipe({
  empresaId,
  fuso,
  membros,
  convites,
  souEuId,
}: {
  empresaId: string;
  fuso: string;
  membros: MembroDaEquipe[];
  convites: ConvitePendente[];
  souEuId: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Enums<"member_role">>("contador");
  const [link, setLink] = useState<string | null>(null);
  const [processando, iniciar] = useTransition();

  function rodar(acao: () => Promise<{ erro?: string; aviso?: string }>) {
    setErro(null);
    iniciar(async () => {
      const resposta = await acao();
      if (resposta.erro) setErro(resposta.erro);
      if (resposta.aviso) toast.success(resposta.aviso);
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <Label htmlFor="convite-email">Convidar pessoa</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="convite-email"
            type="email"
            inputMode="email"
            placeholder="contador@escritorio.com.br"
            className="min-w-56 flex-1"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
          <Select value={papel} onValueChange={(valor) => setPapel(valor as Enums<"member_role">)}>
            <SelectTrigger className="w-44" aria-label="Tipo de acesso">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPEIS.map((item) => (
                <SelectItem key={item.valor} value={item.valor}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={processando || email.trim() === ""}
            onClick={() =>
              rodar(async () => {
                const resposta = await convidarMembro(empresaId, { email, papel });
                if (resposta.dados) {
                  setLink(resposta.dados.link);
                  setEmail("");
                  toast.success(
                    resposta.dados.enviado
                      ? "Convite enviado por e-mail."
                      : "Convite criado. Copie o link e mande para a pessoa.",
                  );
                }
                return resposta;
              })
            }
          >
            {processando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Convidar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {PAPEIS.find((item) => item.valor === papel)?.explicacao}
        </p>
        {link ? (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs break-all">{link}</span>
              <Button type="button" variant="outline" size="xs" onClick={() => copiar(link)}>
                <Copy aria-hidden />
                Copiar
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Quem tem acesso</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membros.map((membro) => (
                <TableRow key={membro.userId}>
                  <TableCell>
                    <span className="block">{membro.nome}</span>
                    <span className="text-xs text-muted-foreground">{membro.email}</span>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={membro.papel}
                      disabled={processando}
                      onValueChange={(valor) =>
                        rodar(() => alterarPapel(empresaId, membro.userId, valor as Enums<"member_role">))
                      }
                    >
                      <SelectTrigger className="w-40" aria-label={`Acesso de ${membro.nome}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPEIS.map((item) => (
                          <SelectItem key={item.valor} value={item.valor}>
                            {item.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {formatarData(membro.desde, fuso)}
                  </TableCell>
                  <TableCell className="text-right">
                    {membro.userId === souEuId ? (
                      <Badge variant="secondary">Você</Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover ${membro.nome}`}
                        disabled={processando}
                        onClick={() => rodar(() => removerMembro(empresaId, membro.userId))}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {convites.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Convites aguardando resposta</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Vale até</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convites.map((convite) => (
                  <TableRow key={convite.id}>
                    <TableCell>{convite.email}</TableCell>
                    <TableCell>{PAPEIS.find((p) => p.valor === convite.papel)?.nome}</TableCell>
                    <TableCell className="font-mono text-xs tabular">
                      {formatarData(convite.expiraEm, fuso)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={processando}
                        onClick={() => rodar(() => cancelarConvite(empresaId, convite.id))}
                      >
                        Cancelar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
