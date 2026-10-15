"use client";

import { Loader2, MessageSquareText, Plus, SendHorizontal, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { apagarConversa } from "@/app/(app)/app/assistente/acoes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/lib/dates";
import { cn } from "@/lib/utils";

import {
  lerEventos,
  TAMANHO_MAXIMO_DA_PERGUNTA,
  type ConversaDaLista,
  type CotaDoAssistente,
  type EventoAssistente,
  type MensagemDaTela,
} from "./protocolo";
import { FontesDaResposta, TextoDaResposta } from "./resposta";

export const PERGUNTAS_PRONTAS = [
  "Como foi meu último mês?",
  "Quais serviços mais deram resultado nos últimos 3 meses?",
  "Em que dia da semana a agenda fica mais vazia?",
  "Quanto preciso faturar por mês para cobrir os custos fixos?",
  "O que está em alta no meu segmento na minha cidade e vale a pena oferecer?",
];

const RODAPE =
  "Sugestões geradas por IA podem conter erros. Confira os números no Financeiro e fale com seu contador antes de decisões sobre impostos.";

type Mensagem = MensagemDaTela & {
  recusa?: string;
  aviso?: string;
  erro?: string;
  emAndamento?: boolean;
};

let sequencia = 0;
const idLocal = () => `local-${++sequencia}`;

function rolagemSuave() {
  return typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ListaDeConversas({
  conversas,
  atual,
  fuso,
  ocupado,
  aoApagar,
}: {
  conversas: ConversaDaLista[];
  atual: string | null;
  fuso: string;
  ocupado: boolean;
  aoApagar: (conversa: ConversaDaLista) => void;
}) {
  if (conversas.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {conversas.map((c) => (
        <li key={c.id} className="group flex items-center gap-1">
          <Link
            href={`/app/assistente?c=${c.id}`}
            aria-current={c.id === atual ? "page" : undefined}
            aria-disabled={ocupado || undefined}
            onClick={(e) => {
              if (ocupado) e.preventDefault();
            }}
            className={cn(
              "flex min-w-0 flex-1 flex-col rounded-md px-2 py-1.5 text-sm hover:bg-accent",
              c.id === atual && "bg-primary/10 text-primary dark:bg-primary/15",
            )}
          >
            <span className="truncate">{c.titulo}</span>
            <span className="font-mono text-xs tabular text-muted-foreground">{formatarData(c.atualizadaEm, fuso)}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Apagar a conversa "${c.titulo}"`}
            disabled={ocupado}
            onClick={() => aoApagar(c)}
          >
            <Trash2 aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ChatDoAssistente({
  conversaInicial,
  perguntaInicial = null,
  conversas: conversasIniciais,
  cota: cotaInicial,
  bloqueio,
  fuso,
}: {
  conversaInicial: { id: string; mensagens: MensagemDaTela[] } | null;
  /** Vinda do link do painel (?pergunta=): preenche o campo, sem enviar sozinha. */
  perguntaInicial?: string | null;
  conversas: ConversaDaLista[];
  cota: CotaDoAssistente | null;
  /** Mensagem do modo somente leitura; com ela, nada é enviado. */
  bloqueio: string | null;
  fuso: string;
}) {
  const router = useRouter();
  const [conversaId, setConversaId] = useState<string | null>(conversaInicial?.id ?? null);
  const [mensagens, setMensagens] = useState<Mensagem[]>(conversaInicial?.mensagens ?? []);
  const [conversas, setConversas] = useState(conversasIniciais);
  const [cota, setCota] = useState(cotaInicial);
  const [pergunta, setPergunta] = useState(perguntaInicial ?? "");
  const [enviando, setEnviando] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [apagando, setApagando] = useState<ConversaDaLista | null>(null);
  const [processando, iniciar] = useTransition();

  const controlador = useRef<AbortController | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const registro = useRef<HTMLDivElement>(null);

  const esgotada = cota !== null && cota.usados >= cota.limite;
  const travado = Boolean(bloqueio) || esgotada;

  // Parar o pedido se a pessoa sair da página no meio da resposta.
  useEffect(() => () => controlador.current?.abort(), []);

  // Pergunta vinda do painel: o campo já vem preenchido e focado, com o cursor
  // no fim, e o parâmetro sai do endereço (recarregar não traz a pergunta de volta).
  useEffect(() => {
    if (!perguntaInicial) return;
    const el = campo.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    window.history.replaceState(null, "", "/app/assistente");
  }, [perguntaInicial]);

  // Acompanha a resposta enquanto ela chega.
  useEffect(() => {
    const el = registro.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: rolagemSuave() ? "smooth" : "auto" });
  }, [mensagens, status]);

  function atualizarResposta(id: string, mudar: (m: Mensagem) => Mensagem) {
    setMensagens((lista) => lista.map((m) => (m.id === id ? mudar(m) : m)));
  }

  function voltarParaNova() {
    setConversaId(null);
    window.history.replaceState(null, "", "/app/assistente");
  }

  async function enviar(texto: string) {
    const limpa = texto.trim();
    if (!limpa || enviando || travado) return;

    const idResposta = idLocal();
    setMensagens((lista) => [
      ...lista,
      { id: idLocal(), papel: "usuario", texto: limpa, fontes: [] },
      { id: idResposta, papel: "assistente", texto: "", fontes: [], emAndamento: true },
    ]);
    setPergunta("");
    setEnviando(true);
    setStatus("Preparando a análise…");
    // O botão acionado (pergunta pronta ou Enviar) some neste render: o foco vai
    // para o campo, de onde o Tab chega ao "Parar", em vez de cair no <body>.
    requestAnimationFrame(() => campo.current?.focus());

    const abortar = new AbortController();
    controlador.current = abortar;
    // Mudam dentro do leitor de eventos: num objeto, para o TypeScript não presumir o valor inicial.
    const pedido: { criada: string | null; terminou: boolean } = { criada: null, terminou: false };

    try {
      const resposta = await fetch("/api/assistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(conversaId ? { conversaId, pergunta: limpa } : { pergunta: limpa }),
        signal: abortar.signal,
      });

      if (!resposta.ok || !resposta.body) {
        const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string; codigo?: string };
        atualizarResposta(idResposta, (m) => ({
          ...m,
          erro: corpo.erro ?? "Não foi possível falar com o assistente. Tente de novo.",
        }));
        if (corpo.codigo === "consentimento" || corpo.codigo === "somente_leitura") router.refresh();
        if (resposta.status === 404) voltarParaNova();
        return;
      }

      await lerEventos(resposta.body, (evento: EventoAssistente) => {
        switch (evento.tipo) {
          case "inicio":
            setConversaId(evento.conversaId);
            if (evento.nova) {
              pedido.criada = evento.conversaId;
              setConversas((lista) => [
                { id: evento.conversaId, titulo: evento.titulo, atualizadaEm: new Date().toISOString() },
                ...lista,
              ]);
              window.history.replaceState(null, "", `/app/assistente?c=${evento.conversaId}`);
            }
            break;
          case "status":
            setStatus(evento.mensagem);
            break;
          case "texto":
            setStatus(null);
            atualizarResposta(idResposta, (m) => ({ ...m, texto: m.texto + evento.delta }));
            break;
          case "fonte":
            atualizarResposta(idResposta, (m) =>
              m.fontes.some((f) => f.url === evento.url)
                ? m
                : { ...m, fontes: [...m.fontes, { url: evento.url, titulo: evento.titulo }] },
            );
            break;
          case "recusa":
            // O texto parcial some: a resposta recusada não é mostrada nem gravada.
            atualizarResposta(idResposta, (m) => ({ ...m, texto: "", fontes: [], recusa: evento.mensagem }));
            break;
          case "aviso":
            atualizarResposta(idResposta, (m) => ({ ...m, aviso: evento.mensagem }));
            break;
          case "erro":
            atualizarResposta(idResposta, (m) => ({ ...m, erro: evento.mensagem }));
            break;
          case "fim":
            pedido.terminou = true;
            if (evento.cota) setCota(evento.cota);
            if (!evento.salvo && pedido.criada) {
              const removida = pedido.criada;
              setConversas((lista) => lista.filter((c) => c.id !== removida));
              voltarParaNova();
            } else if (evento.salvo) {
              const atual = pedido.criada ?? conversaId;
              setConversas((lista) =>
                lista.map((c) => (c.id === atual ? { ...c, atualizadaEm: new Date().toISOString() } : c)),
              );
            }
            break;
        }
      });
      if (!pedido.terminou) {
        atualizarResposta(idResposta, (m) => ({
          ...m,
          erro: m.erro ?? "A conexão caiu antes do fim da resposta. Tente de novo.",
        }));
      }
    } catch (err) {
      const parado = err instanceof DOMException && err.name === "AbortError";
      atualizarResposta(idResposta, (m) =>
        parado
          ? { ...m, aviso: "Resposta interrompida. Ela não fica gravada na conversa." }
          : { ...m, erro: "Não foi possível falar com o assistente. Confira a conexão e tente de novo." },
      );
      if (pedido.criada) {
        // Parada no meio: o servidor descarta a conversa nova que ficou vazia.
        const removida = pedido.criada;
        setConversas((lista) => lista.filter((c) => c.id !== removida));
        voltarParaNova();
      }
    } finally {
      controlador.current = null;
      atualizarResposta(idResposta, (m) => ({ ...m, emAndamento: false }));
      setEnviando(false);
      setStatus(null);
      campo.current?.focus();
    }
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    void enviar(pergunta);
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar(pergunta);
    }
  }

  function novaConversa() {
    if (enviando) return;
    setMensagens([]);
    setPergunta("");
    setConversaId(null);
    router.push("/app/assistente");
    campo.current?.focus();
  }

  function confirmarApagar(conversa: ConversaDaLista) {
    iniciar(async () => {
      const resposta = await apagarConversa(conversa.id);
      setApagando(null);
      if (resposta.erro) {
        toast.error(resposta.erro);
        return;
      }
      toast.success(resposta.aviso ?? "Conversa apagada.");
      setConversas((lista) => lista.filter((c) => c.id !== conversa.id));
      if (conversa.id === conversaId) {
        setMensagens([]);
        setConversaId(null);
        router.push("/app/assistente");
      }
    });
  }

  const lista = (
    <ListaDeConversas
      conversas={conversas}
      atual={conversaId}
      fuso={fuso}
      ocupado={enviando || processando}
      aoApagar={setApagando}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3" aria-label="Conversas">
        <Button variant="outline" onClick={novaConversa} disabled={enviando} className="justify-start">
          <Plus aria-hidden />
          Nova conversa
        </Button>
        <details className="rounded-lg border border-border p-2 lg:hidden">
          <summary className="cursor-pointer px-1 py-1 text-sm font-medium">
            Conversas anteriores ({conversas.length})
          </summary>
          <div className="pt-2">{lista}</div>
        </details>
        <div className="hidden lg:block">
          <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Conversas anteriores</p>
          {lista}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card" aria-label="Conversa com o assistente">
        <div
          ref={registro}
          role="log"
          aria-live="polite"
          aria-busy={enviando}
          aria-label="Mensagens da conversa"
          className="flex h-[min(62dvh,42rem)] min-h-80 flex-col gap-4 overflow-y-auto p-4 md:p-6"
        >
          {mensagens.length === 0 ? (
            <div className="m-auto flex max-w-xl flex-col items-center gap-4 text-center">
              <MessageSquareText className="size-8 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">O que você quer saber sobre o seu negócio?</h2>
                <p className="text-sm text-muted-foreground">
                  Escolha uma pergunta pronta ou escreva a sua. O assistente consulta o financeiro, a agenda e os
                  serviços antes de responder.
                </p>
              </div>
              <ul className="flex w-full flex-col gap-2">
                {PERGUNTAS_PRONTAS.map((p) => (
                  <li key={p}>
                    <Button
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                      disabled={enviando || travado}
                      onClick={() => void enviar(p)}
                    >
                      {p}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            mensagens.map((m) =>
              m.papel === "usuario" ? (
                <div key={m.id} className="ml-auto max-w-[85%] rounded-lg bg-primary/10 px-4 py-3 text-sm dark:bg-primary/15">
                  <span className="sr-only">Você perguntou: </span>
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                </div>
              ) : (
                <div key={m.id} className="max-w-full rounded-lg border border-border bg-background px-4 py-3 text-sm">
                  <span className="sr-only">Resposta do assistente: </span>
                  {m.texto ? <TextoDaResposta texto={m.texto} /> : null}
                  {m.recusa ? <p className="text-muted-foreground">{m.recusa}</p> : null}
                  {m.emAndamento && !m.texto ? (
                    <p className="text-muted-foreground" aria-hidden>
                      …
                    </p>
                  ) : null}
                  <FontesDaResposta fontes={m.fontes} />
                  {m.aviso ? <p className="mt-3 text-xs text-warning">{m.aviso}</p> : null}
                  {m.erro ? <p className="mt-3 text-sm text-destructive">{m.erro}</p> : null}
                </div>
              ),
            )
          )}
        </div>

        <p role="status" className="min-h-6 px-4 text-sm text-muted-foreground md:px-6">
          {status ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {status}
            </span>
          ) : null}
        </p>

        <form onSubmit={aoEnviar} className="flex flex-col gap-2 border-t border-border p-4 md:px-6">
          {bloqueio ? (
            <Alert>
              <AlertTitle>Modo somente leitura</AlertTitle>
              <AlertDescription>{bloqueio}</AlertDescription>
            </Alert>
          ) : null}
          {!bloqueio && esgotada && cota ? (
            <Alert>
              <AlertTitle>Franquia do mês usada</AlertTitle>
              <AlertDescription>
                Você usou as {cota.limite} perguntas do seu plano neste mês. A franquia renova no dia 1º; para mais
                perguntas, veja os planos em Assinatura.
              </AlertDescription>
            </Alert>
          ) : null}
          <Label htmlFor="pergunta-assistente">Sua pergunta</Label>
          <Textarea
            id="pergunta-assistente"
            ref={campo}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={aoTeclar}
            maxLength={TAMANHO_MAXIMO_DA_PERGUNTA}
            rows={2}
            disabled={travado}
            placeholder="Ex.: Quanto entrou e quanto saiu em setembro, comparado com agosto?"
            aria-describedby="pergunta-assistente-ajuda"
            className="max-h-48"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="pergunta-assistente-ajuda" className="text-xs text-muted-foreground">
              Enter envia; Shift+Enter quebra a linha.
              {cota ? (
                <>
                  {" "}
                  <span className="font-mono tabular">
                    {cota.usados} de {cota.limite}
                  </span>{" "}
                  perguntas usadas neste mês.
                </>
              ) : null}
            </p>
            {enviando ? (
              <Button type="button" variant="outline" onClick={() => controlador.current?.abort()}>
                <Square aria-hidden />
                Parar
              </Button>
            ) : (
              <Button type="submit" disabled={travado || !pergunta.trim()}>
                <SendHorizontal aria-hidden />
                Enviar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{RODAPE}</p>
        </form>
      </section>

      {apagando ? (
        <AlertDialog open onOpenChange={(aberto) => !aberto && setApagando(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar esta conversa?</AlertDialogTitle>
              <AlertDialogDescription>
                “{apagando.titulo}” e todas as respostas dela saem do Bossa. Não dá para desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={processando}
                onClick={(e) => {
                  e.preventDefault();
                  confirmarApagar(apagando);
                }}
              >
                Apagar conversa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
