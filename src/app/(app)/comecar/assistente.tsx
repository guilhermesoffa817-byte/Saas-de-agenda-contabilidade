"use client";

import { ArrowLeft, ArrowRight, Check, Copy, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  atualizarSlug,
  concluirOnboarding,
  convidarPessoa,
  criarEmpresa,
  salvarEquipeEExpediente,
  salvarServicos,
} from "./acoes";
import { PassoExpediente, PassoNegocio, PassoRegime, PassoServicos, type FaixaDia, type ServicoForm } from "./passos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Enums } from "@/lib/supabase/database.types";
import { SERVICOS_SUGERIDOS, type Segmento } from "@/lib/segmentos";
import { sugerirSlug } from "@/lib/validacao/empresa";

const PASSOS = [
  { titulo: "Seu negócio", descricao: "Como seus clientes conhecem você." },
  { titulo: "Como você trabalha", descricao: "Isso define os relatórios do contador." },
  { titulo: "Quem atende e quando", descricao: "A base da sua agenda." },
  { titulo: "Seus serviços", descricao: "Duração e preço de cada atendimento." },
  { titulo: "Contador e link", descricao: "Últimos ajustes e já pode divulgar." },
] as const;

const EXPEDIENTE_PADRAO: FaixaDia[] = [
  { dia: 0, aberto: false, inicio: "09:00", fim: "13:00" },
  { dia: 1, aberto: true, inicio: "09:00", fim: "18:00" },
  { dia: 2, aberto: true, inicio: "09:00", fim: "18:00" },
  { dia: 3, aberto: true, inicio: "09:00", fim: "18:00" },
  { dia: 4, aberto: true, inicio: "09:00", fim: "18:00" },
  { dia: 5, aberto: true, inicio: "09:00", fim: "18:00" },
  { dia: 6, aberto: true, inicio: "09:00", fim: "13:00" },
];

function servicosDoSegmento(segmento: Segmento): ServicoForm[] {
  return SERVICOS_SUGERIDOS[segmento].map((servico) => ({
    nome: servico.nome,
    duracao: servico.duracao,
    buffer: 0,
    preco: servico.preco,
    online: true,
    escolhido: true,
  }));
}

export function AssistenteInicial({
  nomeDoUsuario,
  enderecoDoSite,
  empresaExistente,
}: {
  nomeDoUsuario: string;
  enderecoDoSite: string;
  empresaExistente: { id: string; nome: string; slug: string; segmento: string; fuso: string } | null;
}) {
  const [passo, setPasso] = useState(empresaExistente ? 2 : 0);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [empresaId, setEmpresaId] = useState<string | null>(empresaExistente?.id ?? null);
  const [nome, setNome] = useState(empresaExistente?.nome ?? "");
  const [segmento, setSegmento] = useState<Segmento>((empresaExistente?.segmento as Segmento) ?? "salao");
  const [fuso, setFuso] = useState(empresaExistente?.fuso ?? "America/Sao_Paulo");
  const [regime, setRegime] = useState<Enums<"tax_regime">>("mei");
  const [profissionais, setProfissionais] = useState([{ nome: nomeDoUsuario }]);
  const [dias, setDias] = useState<FaixaDia[]>(EXPEDIENTE_PADRAO);
  const [servicos, setServicos] = useState<ServicoForm[]>(servicosDoSegmento(segmento));

  const [slug, setSlug] = useState(empresaExistente?.slug ?? "");
  const [emailConvite, setEmailConvite] = useState("");
  const [papelConvite, setPapelConvite] = useState<Enums<"member_role">>("contador");
  const [linkConvite, setLinkConvite] = useState<string | null>(null);

  const slugAtual = slug || sugerirSlug(nome);
  const linkAgendamento = `${enderecoDoSite}/agendar/${slugAtual || "seu-negocio"}`;

  function trocarSegmento(novo: Segmento) {
    setSegmento(novo);
    // Só troca as sugestões se a pessoa ainda não mexeu na lista.
    setServicos((atuais) => {
      const eraSugestao = atuais.every((servico) =>
        SERVICOS_SUGERIDOS[segmento].some(
          (sugerido) => sugerido.nome === servico.nome && sugerido.preco === servico.preco,
        ),
      );
      return eraSugestao ? servicosDoSegmento(novo) : atuais;
    });
  }

  async function copiar(texto: string, mensagem: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(mensagem);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  async function avancar() {
    setErro(null);
    setSalvando(true);
    try {
      if (passo === 0) {
        if (nome.trim().length < 2) {
          setErro("Digite o nome do seu negócio.");
          return;
        }
        setPasso(1);
        return;
      }

      if (passo === 1) {
        if (!empresaId) {
          const resposta = await criarEmpresa({
            nome: nome.trim(),
            slug: sugerirSlug(nome),
            segmento,
            regime,
            fuso,
          });
          if (resposta.erro) {
            setErro(resposta.erro);
            return;
          }
          setEmpresaId(resposta.dados!.empresaId);
          setSlug(sugerirSlug(nome));
        }
        setPasso(2);
        return;
      }

      if (passo === 2 && empresaId) {
        const resposta = await salvarEquipeEExpediente(empresaId, {
          profissionais: profissionais
            .filter((profissional) => profissional.nome.trim().length >= 2)
            .map((profissional) => ({ nome: profissional.nome.trim() })),
          dias,
        });
        if (resposta.erro) {
          setErro(resposta.erro);
          return;
        }
        setPasso(3);
        return;
      }

      if (passo === 3 && empresaId) {
        const escolhidos = servicos
          .filter((servico) => servico.escolhido && servico.nome.trim().length >= 2)
          .map((servico) => ({
            nome: servico.nome.trim(),
            duracao: servico.duracao,
            buffer: servico.buffer,
            preco: servico.preco,
            online: servico.online,
          }));

        if (!escolhidos.length) {
          setErro("Escolha pelo menos um serviço.");
          return;
        }

        const resposta = await salvarServicos(empresaId, { servicos: escolhidos });
        if (resposta.erro) {
          setErro(resposta.erro);
          return;
        }
        setPasso(4);
        return;
      }

      if (passo === 4 && empresaId) {
        if (slugAtual !== empresaExistente?.slug) {
          const resposta = await atualizarSlug(empresaId, slugAtual);
          if (resposta.erro) {
            setErro(resposta.erro);
            return;
          }
        }
        await concluirOnboarding();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function enviarConvite() {
    if (!empresaId) return;
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await convidarPessoa(empresaId, { email: emailConvite, papel: papelConvite });
      if (resposta.erro) {
        setErro(resposta.erro);
        return;
      }
      setLinkConvite(resposta.dados!.link);
      setEmailConvite("");
      toast.success(
        resposta.dados!.enviado
          ? "Convite enviado por e-mail."
          : "Convite criado. Copie o link e mande para a pessoa.",
      );
    } finally {
      setSalvando(false);
    }
  }

  const atual = PASSOS[passo];
  const podePular = passo >= 2;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Passo {passo + 1} de {PASSOS.length}
          </p>
          {podePular ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => (passo === 4 ? concluirOnboarding() : setPasso(passo + 1))}
            >
              Pular por agora
            </Button>
          ) : null}
        </div>
        <Progress value={((passo + 1) / PASSOS.length) * 100} />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{atual.titulo}</h1>
        <p className="text-muted-foreground">{atual.descricao}</p>
      </div>

      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      {passo === 0 ? (
        <PassoNegocio
          nome={nome}
          segmento={segmento}
          fuso={fuso}
          onChange={(mudanca) => {
            if (mudanca.nome !== undefined) setNome(mudanca.nome);
            if (mudanca.segmento !== undefined) trocarSegmento(mudanca.segmento);
            if (mudanca.fuso !== undefined) setFuso(mudanca.fuso);
          }}
        />
      ) : null}

      {passo === 1 ? <PassoRegime regime={regime} onChange={setRegime} /> : null}

      {passo === 2 ? (
        <PassoExpediente
          profissionais={profissionais}
          dias={dias}
          onProfissionais={setProfissionais}
          onDias={setDias}
        />
      ) : null}

      {passo === 3 ? <PassoServicos servicos={servicos} onChange={setServicos} /> : null}

      {passo === 4 ? (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Label htmlFor="link-agendamento">Seu link de agendamento</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{enderecoDoSite}/agendar/</span>
              <Input
                id="link-agendamento"
                value={slugAtual}
                className="w-56"
                onChange={(evento) => setSlug(evento.target.value.toLowerCase())}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copiar(linkAgendamento, "Link copiado. Cole na bio do Instagram ou no WhatsApp.")}
              >
                <Copy aria-hidden />
                Copiar link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              É por esse link que o cliente marca sozinho, sem você responder mensagem.
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <Label htmlFor="email-convite">Convidar alguém (opcional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="email-convite"
                type="email"
                inputMode="email"
                className="min-w-56 flex-1"
                placeholder="contador@escritorio.com.br"
                value={emailConvite}
                onChange={(evento) => setEmailConvite(evento.target.value)}
              />
              <Select
                value={papelConvite}
                onValueChange={(valor) => setPapelConvite(valor as Enums<"member_role">)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contador">Contador</SelectItem>
                  <SelectItem value="recepcao">Recepção</SelectItem>
                  <SelectItem value="profissional">Profissional</SelectItem>
                  <SelectItem value="dono">Dono</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                disabled={salvando || emailConvite.trim() === ""}
                onClick={enviarConvite}
              >
                {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                Convidar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O contador entra de graça e vê só o financeiro e os relatórios — nunca o telefone nem as
              anotações dos seus clientes.
            </p>

            {linkConvite ? (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs break-all">{linkConvite}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => copiar(linkConvite, "Link do convite copiado.")}
                  >
                    <Copy aria-hidden />
                    Copiar
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
        <Button
          type="button"
          variant="ghost"
          disabled={passo === 0 || salvando}
          onClick={() => setPasso(Math.max(passo - 1, 0))}
        >
          <ArrowLeft aria-hidden />
          Voltar
        </Button>
        <Button type="button" onClick={avancar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {passo === PASSOS.length - 1 ? (
            <>
              Ir para o sistema
              <Check aria-hidden />
            </>
          ) : (
            <>
              Continuar
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
