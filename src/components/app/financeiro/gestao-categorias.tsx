"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { salvarCategoria, salvarConta } from "@/app/(app)/app/financeiro/acoes";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROTULO_GRUPO } from "@/lib/validacao/financeiro";

export type CategoriaDaTabela = {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  grupo: "operacional" | "imposto" | "financeiro" | "retirada";
  dedutivel: boolean;
  codigoContabil: string | null;
};

export type ContaDaTabela = {
  id: string;
  nome: string;
  tipo: "caixa" | "banco" | "maquininha";
  codigoContabil: string | null;
  ativa: boolean;
};

function FormularioCategoria({
  categoria,
  aoFechar,
}: {
  categoria: CategoriaDaTabela | null;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(categoria?.nome ?? "");
  const [tipo, setTipo] = useState<"receita" | "despesa">(categoria?.tipo ?? "despesa");
  const [grupo, setGrupo] = useState(categoria?.grupo ?? "operacional");
  const [dedutivel, setDedutivel] = useState(categoria?.dedutivel ?? false);
  const [codigo, setCodigo] = useState(categoria?.codigoContabil ?? "");

  return (
    <>
      <div className="flex flex-col gap-4">
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="nome-categoria">Nome</Label>
          <Input
            id="nome-categoria"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Materiais e insumos"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tipo-categoria">Tipo</Label>
            <Select value={tipo} onValueChange={(valor) => setTipo(valor as "receita" | "despesa")}>
              <SelectTrigger id="tipo-categoria" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Entrada</SelectItem>
                <SelectItem value="despesa">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="grupo-categoria">Grupo no relatório</Label>
            <Select
              value={grupo}
              onValueChange={(valor) => setGrupo(valor as CategoriaDaTabela["grupo"])}
            >
              <SelectTrigger id="grupo-categoria" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULO_GRUPO).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Switch id="dedutivel-categoria" checked={dedutivel} onCheckedChange={setDedutivel} />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="dedutivel-categoria" className="font-normal">
              Costuma ser dedutível no Livro-Caixa
            </Label>
            <span className="text-xs text-muted-foreground">
              É só uma sugestão para o relatório. Quem confirma é o seu contador.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="codigo-categoria">Código no plano de contas (opcional)</Label>
          <Input
            id="codigo-categoria"
            value={codigo}
            className="font-mono"
            onChange={(evento) => setCodigo(evento.target.value)}
            placeholder="3.1.01"
          />
          <p className="text-xs text-muted-foreground">
            Quem preenche normalmente é o contador, para a exportação sair no padrão dele.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button
          disabled={salvando}
          onClick={async () => {
            setErro(null);
            setSalvando(true);
            const resposta = await salvarCategoria({
              categoriaId: categoria?.id,
              nome,
              tipo,
              grupo,
              sugestaoDedutivel: dedutivel,
              codigoContabil: codigo,
            });
            setSalvando(false);
            if (resposta.erro) {
              setErro(resposta.erro);
              return;
            }
            toast.success(resposta.aviso ?? "Categoria salva.");
            aoFechar();
          }}
        >
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar categoria
        </Button>
      </DialogFooter>
    </>
  );
}

function FormularioConta({ conta, aoFechar }: { conta: ContaDaTabela | null; aoFechar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [tipo, setTipo] = useState(conta?.tipo ?? "banco");
  const [codigo, setCodigo] = useState(conta?.codigoContabil ?? "");
  const [ativa, setAtiva] = useState(conta?.ativa ?? true);

  return (
    <>
      <div className="flex flex-col gap-4">
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="nome-conta">Nome</Label>
          <Input
            id="nome-conta"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Conta do banco"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tipo-conta">Tipo</Label>
          <Select value={tipo} onValueChange={(valor) => setTipo(valor as ContaDaTabela["tipo"])}>
            <SelectTrigger id="tipo-conta" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="caixa">Caixa (dinheiro na mão)</SelectItem>
              <SelectItem value="banco">Conta bancária</SelectItem>
              <SelectItem value="maquininha">Maquininha</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="codigo-conta">Código no plano de contas (opcional)</Label>
          <Input
            id="codigo-conta"
            value={codigo}
            className="font-mono"
            onChange={(evento) => setCodigo(evento.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Switch id="ativa-conta" checked={ativa} onCheckedChange={setAtiva} />
          <Label htmlFor="ativa-conta" className="font-normal">
            Conta em uso
          </Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button
          disabled={salvando}
          onClick={async () => {
            setErro(null);
            setSalvando(true);
            const resposta = await salvarConta({
              contaId: conta?.id,
              nome,
              tipo,
              codigoContabil: codigo,
              ativa,
            });
            setSalvando(false);
            if (resposta.erro) {
              setErro(resposta.erro);
              return;
            }
            toast.success(resposta.aviso ?? "Conta salva.");
            aoFechar();
          }}
        >
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar conta
        </Button>
      </DialogFooter>
    </>
  );
}

export function GestaoDeCategorias({
  categorias,
  contas,
}: {
  categorias: CategoriaDaTabela[];
  contas: ContaDaTabela[];
}) {
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [categoriaEmEdicao, setCategoriaEmEdicao] = useState<CategoriaDaTabela | null>(null);
  const [novaConta, setNovaConta] = useState(false);
  const [contaEmEdicao, setContaEmEdicao] = useState<ContaDaTabela | null>(null);

  const entradas = categorias.filter((categoria) => categoria.tipo === "receita");
  const saidas = categorias.filter((categoria) => categoria.tipo === "despesa");

  return (
    <Tabs defaultValue="categorias">
      <TabsList>
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
        <TabsTrigger value="contas">Contas</TabsTrigger>
      </TabsList>

      <TabsContent value="categorias" className="flex flex-col gap-6 pt-6">
        <div className="flex justify-end">
          <Button onClick={() => setNovaCategoria(true)}>
            <Plus aria-hidden />
            Nova categoria
          </Button>
        </div>

        {[
          { titulo: "Entradas", lista: entradas },
          { titulo: "Saídas", lista: saidas },
        ].map((secao) => (
          <div key={secao.titulo} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">{secao.titulo}</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Livro-Caixa</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {secao.lista.map((categoria) => (
                    <TableRow key={categoria.id}>
                      <TableCell>{categoria.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ROTULO_GRUPO[categoria.grupo]}
                      </TableCell>
                      <TableCell>
                        {categoria.dedutivel ? (
                          <Badge variant="outline">Costuma ser dedutível</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {categoria.codigoContabil ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${categoria.nome}`}
                          onClick={() => setCategoriaEmEdicao(categoria)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          A marca “costuma ser dedutível” segue a lista do Livro-Caixa para autônomos. A palavra final
          é sempre do seu contador.
        </p>
      </TabsContent>

      <TabsContent value="contas" className="flex flex-col gap-4 pt-6">
        <div className="flex justify-end">
          <Button onClick={() => setNovaConta(true)}>
            <Plus aria-hidden />
            Nova conta
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.map((conta) => (
                <TableRow key={conta.id}>
                  <TableCell>{conta.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {conta.tipo === "caixa"
                      ? "Caixa"
                      : conta.tipo === "banco"
                        ? "Conta bancária"
                        : "Maquininha"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{conta.codigoContabil ?? "—"}</TableCell>
                  <TableCell>
                    {conta.ativa ? (
                      <Badge variant="secondary">Em uso</Badge>
                    ) : (
                      <Badge variant="outline">Desativada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${conta.nome}`}
                      onClick={() => setContaEmEdicao(conta)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {novaCategoria ? (
        <Dialog open onOpenChange={setNovaCategoria}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova categoria</DialogTitle>
              <DialogDescription>Como esse dinheiro aparece nos relatórios.</DialogDescription>
            </DialogHeader>
            <FormularioCategoria categoria={null} aoFechar={() => setNovaCategoria(false)} />
          </DialogContent>
        </Dialog>
      ) : null}

      {categoriaEmEdicao ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setCategoriaEmEdicao(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{categoriaEmEdicao.nome}</DialogTitle>
              <DialogDescription>Ajustar grupo, dedutibilidade e código.</DialogDescription>
            </DialogHeader>
            <FormularioCategoria
              categoria={categoriaEmEdicao}
              aoFechar={() => setCategoriaEmEdicao(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {novaConta ? (
        <Dialog open onOpenChange={setNovaConta}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova conta</DialogTitle>
              <DialogDescription>Onde o dinheiro entra e de onde ele sai.</DialogDescription>
            </DialogHeader>
            <FormularioConta conta={null} aoFechar={() => setNovaConta(false)} />
          </DialogContent>
        </Dialog>
      ) : null}

      {contaEmEdicao ? (
        <Dialog open onOpenChange={(aberto) => !aberto && setContaEmEdicao(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{contaEmEdicao.nome}</DialogTitle>
              <DialogDescription>Ajustar tipo, código e situação.</DialogDescription>
            </DialogHeader>
            <FormularioConta conta={contaEmEdicao} aoFechar={() => setContaEmEdicao(null)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </Tabs>
  );
}
