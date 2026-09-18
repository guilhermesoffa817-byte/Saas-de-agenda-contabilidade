"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { salvarCodigosDeTributacao } from "@/app/contador/acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ServicoParaTributar = {
  id: string;
  nome: string;
  lc116: string | null;
  codigoMunicipal: string | null;
  cnae: string | null;
  descricao: string | null;
};

function LinhaDoServico({ empresaId, servico }: { empresaId: string; servico: ServicoParaTributar }) {
  const [lc116, setLc116] = useState(servico.lc116 ?? "");
  const [municipal, setMunicipal] = useState(servico.codigoMunicipal ?? "");
  const [cnae, setCnae] = useState(servico.cnae ?? "");
  const [descricao, setDescricao] = useState(servico.descricao ?? "");
  const [salvando, setSalvando] = useState(false);

  const mudou =
    (servico.lc116 ?? "") !== lc116.trim() ||
    (servico.codigoMunicipal ?? "") !== municipal.trim() ||
    (servico.cnae ?? "") !== cnae.trim() ||
    (servico.descricao ?? "") !== descricao.trim();

  async function salvar() {
    setSalvando(true);
    const resposta = await salvarCodigosDeTributacao({
      empresaId,
      servicoId: servico.id,
      lc116: lc116.trim(),
      codigoMunicipal: municipal.trim(),
      cnae: cnae.trim(),
      descricao: descricao.trim(),
    });
    setSalvando(false);
    if (resposta.erro) toast.error(resposta.erro);
    else toast.success(resposta.aviso ?? "Salvo.");
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <span className="font-medium">{servico.nome}</span>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`lc116-${servico.id}`} className="text-xs">
            Item da LC 116
          </Label>
          <Input
            id={`lc116-${servico.id}`}
            value={lc116}
            placeholder="06.01"
            className="font-mono text-sm tabular"
            onChange={(evento) => setLc116(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`municipal-${servico.id}`} className="text-xs">
            Código do município
          </Label>
          <Input
            id={`municipal-${servico.id}`}
            value={municipal}
            placeholder="0601"
            className="font-mono text-sm tabular"
            onChange={(evento) => setMunicipal(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cnae-${servico.id}`} className="text-xs">
            CNAE
          </Label>
          <Input
            id={`cnae-${servico.id}`}
            value={cnae}
            placeholder="9602501"
            className="font-mono text-sm tabular"
            onChange={(evento) => setCnae(evento.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`descricao-${servico.id}`} className="text-xs">
          Discriminação que sai na nota
        </Label>
        <Input
          id={`descricao-${servico.id}`}
          value={descricao}
          placeholder="Serviços de cabeleireiro"
          onChange={(evento) => setDescricao(evento.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={!mudou || salvando} onClick={salvar}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

/**
 * Códigos de tributação por serviço. O Alicerce não calcula imposto: ele manda
 * ao provedor da nota exatamente o que está escrito aqui.
 */
export function CodigosDeTributacao({
  empresaId,
  servicos,
}: {
  empresaId: string;
  servicos: ServicoParaTributar[];
}) {
  if (servicos.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Este cliente ainda não cadastrou serviços. Assim que cadastrar, os códigos aparecem aqui.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          O Alicerce não calcula imposto. Ele manda ao provedor da nota exatamente o que estiver
          escrito aqui, por serviço.
        </AlertDescription>
      </Alert>

      {servicos.map((servico) => (
        <LinhaDoServico key={servico.id} empresaId={empresaId} servico={servico} />
      ))}
    </div>
  );
}
