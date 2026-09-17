"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { criarBloqueio } from "@/app/(app)/app/agenda/acoes";
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
import type { ProfissionalDaAgenda } from "@/lib/agenda";

export function DialogoBloqueio({
  aberto,
  aoMudar,
  profissionais,
  dia,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  profissionais: ProfissionalDaAgenda[];
  dia: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [profissionalId, setProfissionalId] = useState(profissionais[0]?.id ?? "");
  const [diaEscolhido, setDiaEscolhido] = useState(dia);
  const [inicio, setInicio] = useState("12:00");
  const [fim, setFim] = useState("13:00");
  const [motivo, setMotivo] = useState("");

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resposta = await criarBloqueio({
      profissionalId,
      dia: diaEscolhido,
      inicio,
      fim,
      motivo,
    });
    setSalvando(false);

    if (resposta.erro) {
      setErro(resposta.erro);
      return;
    }
    toast.success(resposta.aviso ?? "Horário bloqueado.");
    setMotivo("");
    aoMudar(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear horário</DialogTitle>
          <DialogDescription>
            Almoço, médico, folga: o horário deixa de aparecer para quem agenda pelo link.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {erro ? (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="profissional-bloqueio">Profissional</Label>
            <Select value={profissionalId} onValueChange={setProfissionalId}>
              <SelectTrigger id="profissional-bloqueio" className="w-full">
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dia-bloqueio">Dia</Label>
              <Input
                id="dia-bloqueio"
                type="date"
                value={diaEscolhido}
                className="font-mono tabular"
                onChange={(evento) => setDiaEscolhido(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="inicio-bloqueio">Das</Label>
              <Input
                id="inicio-bloqueio"
                type="time"
                value={inicio}
                className="font-mono tabular"
                onChange={(evento) => setInicio(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fim-bloqueio">Até</Label>
              <Input
                id="fim-bloqueio"
                type="time"
                value={fim}
                className="font-mono tabular"
                onChange={(evento) => setFim(evento.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motivo-bloqueio">Motivo (opcional)</Label>
            <Input
              id="motivo-bloqueio"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Almoço"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !profissionalId}>
            {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
