"use client";

import { useState } from "react";

import { BarraDaAgenda, type Visao } from "./barra";
import { DialogoAtendimento, type ClienteResumo } from "./dialogo-atendimento";
import { DialogoBloqueio } from "./dialogo-bloqueio";
import { GradeDoDia, type FaixaDeExpediente } from "./grade-dia";
import { VisaoLista } from "./lista";
import { VisaoSemana } from "./semana";
import type {
  AtendimentoNaAgenda,
  BloqueioNaAgenda,
  ContextoFinanceiro,
  ProfissionalDaAgenda,
  ServicoDaAgenda,
} from "@/lib/agenda";

export function PainelDaAgenda({
  dia,
  visao,
  titulo,
  fuso,
  nomeDaEmpresa,
  financeiro,
  profissionalId,
  profissionais,
  servicos,
  clientes,
  atendimentos,
  bloqueios,
  expediente,
}: {
  dia: string;
  visao: Visao;
  titulo: string;
  fuso: string;
  nomeDaEmpresa: string;
  financeiro: ContextoFinanceiro;
  profissionalId?: string;
  profissionais: ProfissionalDaAgenda[];
  servicos: ServicoDaAgenda[];
  clientes: ClienteResumo[];
  atendimentos: AtendimentoNaAgenda[];
  bloqueios: BloqueioNaAgenda[];
  expediente: FaixaDeExpediente[];
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [bloqueioAberto, setBloqueioAberto] = useState(false);
  const [inicial, setInicial] = useState({ dia, hora: "09:00", profissionalId });

  const mostrados = profissionalId
    ? profissionais.filter((item) => item.id === profissionalId)
    : profissionais;

  function abrirNovo(profissional: string, hora: string, diaEscolhido = dia) {
    setInicial({ dia: diaEscolhido, hora, profissionalId: profissional || profissionais[0]?.id });
    setNovoAberto(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <BarraDaAgenda
        dia={dia}
        visao={visao}
        titulo={titulo}
        profissionalId={profissionalId}
        profissionais={profissionais}
        onNovo={() => abrirNovo(profissionalId ?? profissionais[0]?.id ?? "", "09:00")}
        onBloquear={() => setBloqueioAberto(true)}
      />

      {visao === "dia" ? (
        <GradeDoDia
          dia={dia}
          fuso={fuso}
          nomeDaEmpresa={nomeDaEmpresa}
          financeiro={financeiro}
          profissionais={mostrados}
          atendimentos={atendimentos}
          bloqueios={bloqueios}
          expediente={expediente}
          aoClicarVazio={(profissional, hora) => abrirNovo(profissional, hora)}
        />
      ) : null}

      {visao === "semana" ? (
        <VisaoSemana
          dia={dia}
          fuso={fuso}
          nomeDaEmpresa={nomeDaEmpresa}
          financeiro={financeiro}
          atendimentos={atendimentos}
          profissionais={profissionais}
          aoClicarVazio={(profissional, hora, diaEscolhido) =>
            abrirNovo(profissional, hora, diaEscolhido)
          }
        />
      ) : null}

      {visao === "lista" ? (
        <VisaoLista
          atendimentos={atendimentos}
          profissionais={profissionais}
          fuso={fuso}
          nomeDaEmpresa={nomeDaEmpresa}
          financeiro={financeiro}
        />
      ) : null}

      {/* Montados só quando abertos: o estado do formulário nasce já com o horário clicado. */}
      {novoAberto ? (
        <DialogoAtendimento
          key={`${inicial.dia}-${inicial.hora}-${inicial.profissionalId ?? ""}`}
          aberto
          aoMudar={setNovoAberto}
          profissionais={profissionais}
          servicos={servicos}
          clientes={clientes}
          inicial={inicial}
        />
      ) : null}

      {bloqueioAberto ? (
        <DialogoBloqueio
          key={dia}
          aberto
          aoMudar={setBloqueioAberto}
          profissionais={profissionais}
          dia={dia}
        />
      ) : null}
    </div>
  );
}
