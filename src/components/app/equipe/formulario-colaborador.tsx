"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DADOS_PESSOAIS_VAZIOS,
  type ColaboradorDaTela,
  type DadosPessoaisDaTela,
  type ProfissionalDaAgenda,
} from "./tipos";
import { salvarColaborador } from "@/app/(app)/app/equipe/acoes";
import { CampoDinheiro } from "@/components/app/campo-dinheiro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TERMOS_POR_VINCULO, VINCULOS, bpsParaTexto, type Contrato } from "@/lib/equipe";

const SEM_AGENDA = "sem-agenda";

export function FormularioColaborador({
  colaborador,
  pessoais,
  contratos,
  profissionais,
  hoje,
  aoFechar,
}: {
  colaborador: ColaboradorDaTela | null;
  pessoais: DadosPessoaisDaTela | null;
  /** Vínculos que fazem sentido para o segmento do negócio. */
  contratos: Contrato[];
  /** Profissionais da agenda que ainda podem ser ligados a este colaborador. */
  profissionais: ProfissionalDaAgenda[];
  hoje: string;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState(colaborador?.nome ?? "");
  const [cargo, setCargo] = useState(colaborador?.cargo ?? "");
  const [contrato, setContrato] = useState<Contrato>(colaborador?.contrato ?? contratos[0] ?? "clt");
  const [inicio, setInicio] = useState(colaborador?.inicio ?? hoje);
  const [fim, setFim] = useState(colaborador?.fim ?? "");
  const [profissionalId, setProfissionalId] = useState(colaborador?.profissionalId ?? SEM_AGENDA);
  const [fixoCents, setFixoCents] = useState(colaborador?.fixoCents ?? 0);
  const [percentual, setPercentual] = useState(
    colaborador && colaborador.percentualBps > 0 ? bpsParaTexto(colaborador.percentualBps) : "",
  );
  const [porAtendimentoCents, setPorAtendimentoCents] = useState(
    colaborador?.porAtendimentoCents ?? 0,
  );
  const [dados, setDados] = useState<DadosPessoaisDaTela>(pessoais ?? DADOS_PESSOAIS_VAZIOS);

  const termos = TERMOS_POR_VINCULO[contrato];

  function alterarDado(campo: keyof DadosPessoaisDaTela, valor: string) {
    setDados((atuais) => ({ ...atuais, [campo]: valor }));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await salvarColaborador({
      colaboradorId: colaborador?.id,
      nome,
      cargo,
      contrato,
      inicio,
      fim,
      profissionalId: profissionalId === SEM_AGENDA ? "" : profissionalId,
      fixoCents,
      percentual,
      porAtendimentoCents,
      dadosPessoais: dados,
    });
    setSalvando(false);
    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Colaborador salvo.");
    aoFechar();
  }

  return (
    <>
      <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="colaborador-nome">Nome</Label>
            <Input
              id="colaborador-nome"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Juliana Prado"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="colaborador-cargo">Cargo ou função</Label>
            <Input
              id="colaborador-cargo"
              value={cargo}
              onChange={(evento) => setCargo(evento.target.value)}
              placeholder="Cabeleireira"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="colaborador-vinculo">Vínculo</Label>
          <Select value={contrato} onValueChange={(valor) => setContrato(valor as Contrato)}>
            <SelectTrigger id="colaborador-vinculo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contratos.map((opcao) => (
                <SelectItem key={opcao} value={opcao}>
                  {VINCULOS[opcao].rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{VINCULOS[contrato].descricao}</p>
          <p className="text-xs text-muted-foreground">
            O Bossa registra o vínculo que você informar; quem define o enquadramento correto é o seu
            contador.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="colaborador-inicio">Início</Label>
            <Input
              id="colaborador-inicio"
              type="date"
              className="font-mono tabular"
              value={inicio}
              onChange={(evento) => setInicio(evento.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="colaborador-fim">Último dia (se já saiu)</Label>
            <Input
              id="colaborador-fim"
              type="date"
              className="font-mono tabular"
              value={fim}
              min={inicio}
              onChange={(evento) => setFim(evento.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="colaborador-agenda">Atende na agenda como</Label>
          <Select value={profissionalId} onValueChange={setProfissionalId}>
            <SelectTrigger id="colaborador-agenda" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_AGENDA}>Não atende na agenda</SelectItem>
              {profissionais.map((profissional) => (
                <SelectItem key={profissional.id} value={profissional.id}>
                  {profissional.nome}
                  {profissional.ativo ? "" : " (inativo)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Ligado à agenda, o Bossa soma o que entrou dos atendimentos dessa pessoa para sugerir o
            valor do mês, e as ausências bloqueiam os horários dela.
          </p>
        </div>

        <Separator />

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-sm font-medium">O que foi combinado</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {termos.fixo ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="colaborador-fixo">{termos.fixo.rotulo}</Label>
                <CampoDinheiro id="colaborador-fixo" valor={fixoCents} onChange={setFixoCents} />
                <p className="text-xs text-muted-foreground">{termos.fixo.ajuda}</p>
              </div>
            ) : null}
            {termos.percentual ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="colaborador-percentual">{termos.percentual.rotulo}</Label>
                <div className="relative">
                  <Input
                    id="colaborador-percentual"
                    inputMode="decimal"
                    className="pr-8 font-mono tabular"
                    value={percentual}
                    onChange={(evento) => setPercentual(evento.target.value)}
                    placeholder={contrato === "parceria" ? "60" : "10"}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{termos.percentual.ajuda}</p>
              </div>
            ) : null}
            {termos.porAtendimento ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="colaborador-por-atendimento">{termos.porAtendimento.rotulo}</Label>
                <CampoDinheiro
                  id="colaborador-por-atendimento"
                  valor={porAtendimentoCents}
                  onChange={setPorAtendimentoCents}
                />
                <p className="text-xs text-muted-foreground">{termos.porAtendimento.ajuda}</p>
              </div>
            ) : null}
          </div>
          {contrato === "clt" ? (
            <p className="text-xs text-muted-foreground">
              Salário líquido, descontos e encargos vêm do contador. Aqui fica só o combinado, para
              você acompanhar o que paga.
            </p>
          ) : null}
        </fieldset>

        <Separator />

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-medium">Dados pessoais (opcional)</legend>
          <p className="text-xs text-muted-foreground">
            Só o dono vê estes dados; o contador não tem acesso. Guarde apenas o que precisa para pagar e falar com a
            pessoa.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="colaborador-documento">CPF ou CNPJ</Label>
              <Input
                id="colaborador-documento"
                inputMode="numeric"
                className="font-mono tabular"
                value={dados.documento}
                onChange={(evento) => alterarDado("documento", evento.target.value)}
                placeholder="000.000.000-00"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="colaborador-pix">Chave Pix</Label>
              <Input
                id="colaborador-pix"
                value={dados.pix}
                onChange={(evento) => alterarDado("pix", evento.target.value)}
                placeholder="juliana.prado@email.com.br"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="colaborador-telefone">Telefone</Label>
              <Input
                id="colaborador-telefone"
                type="tel"
                className="font-mono tabular"
                value={dados.telefone}
                onChange={(evento) => alterarDado("telefone", evento.target.value)}
                placeholder="(11) 98765-4321"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="colaborador-email">E-mail</Label>
              <Input
                id="colaborador-email"
                type="email"
                value={dados.email}
                onChange={(evento) => alterarDado("email", evento.target.value)}
                placeholder="juliana.prado@email.com.br"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="colaborador-observacoes">Observações</Label>
            <Textarea
              id="colaborador-observacoes"
              rows={3}
              maxLength={1000}
              value={dados.observacoes}
              onChange={(evento) => alterarDado("observacoes", evento.target.value)}
              placeholder="Prefere receber às sextas-feiras."
            />
            <p className="text-xs text-muted-foreground">
              Não registre diagnóstico, CID nem detalhes de saúde.
            </p>
          </div>
        </fieldset>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar colaborador
        </Button>
      </DialogFooter>
    </>
  );
}
