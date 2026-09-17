/**
 * Dados de demonstração — nomes, serviços e valores brasileiros realistas.
 * Usados na página de vendas (modo demonstração, somente leitura) e para conferir
 * as telas sem depender do banco. Nunca entram no banco de ninguém.
 */
import type {
  AtendimentoNaAgenda,
  BloqueioNaAgenda,
  ProfissionalDaAgenda,
  ServicoDaAgenda,
} from "@/lib/agenda";

export const EMPRESA_DEMO = {
  nome: "Studio Ana Ribeiro",
  slug: "studio-ana-ribeiro",
  fuso: "America/Cuiaba",
  cidade: "Cuiabá",
  estado: "MT",
  segmento: "salao",
};

export const PROFISSIONAIS_DEMO: ProfissionalDaAgenda[] = [
  { id: "demo-prof-1", nome: "Ana Ribeiro", cor: "#0F3D2E" },
  { id: "demo-prof-2", nome: "Camila Duarte", cor: "#B8872B" },
  { id: "demo-prof-3", nome: "Rafael Nunes", cor: "#2F7A4D" },
];

export const SERVICOS_DEMO: ServicoDaAgenda[] = [
  { id: "demo-serv-1", nome: "Escova + hidratação", duracaoMin: 90, bufferMin: 10, precoCents: 12000 },
  { id: "demo-serv-2", nome: "Corte feminino", duracaoMin: 60, bufferMin: 0, precoCents: 9000 },
  { id: "demo-serv-3", nome: "Coloração", duracaoMin: 120, bufferMin: 15, precoCents: 22000 },
  { id: "demo-serv-4", nome: "Manicure", duracaoMin: 45, bufferMin: 0, precoCents: 5500 },
];

/** Expediente de segunda a sábado, das 9h às 19h (sábado até 14h). */
export const EXPEDIENTE_DEMO = PROFISSIONAIS_DEMO.flatMap((profissional) =>
  [1, 2, 3, 4, 5, 6].map((dia) => ({
    profissionalId: profissional.id,
    diaSemana: dia,
    inicio: "09:00",
    fim: dia === 6 ? "14:00" : "19:00",
  })),
);

type ModeloDeAtendimento = {
  profissional: number;
  hora: string;
  duracao: number;
  cliente: string;
  telefone: string;
  servico: number;
  status: AtendimentoNaAgenda["status"];
  faltas?: number;
  origem?: string;
};

const MODELOS: ModeloDeAtendimento[] = [
  { profissional: 0, hora: "09:00", duracao: 60, cliente: "Juliana Prado", telefone: "+5565999120045", servico: 1, status: "concluido" },
  { profissional: 0, hora: "10:30", duracao: 100, cliente: "Marina Alves", telefone: "+5565998877001", servico: 0, status: "confirmado", origem: "link_publico" },
  { profissional: 0, hora: "14:00", duracao: 135, cliente: "Beatriz Camargo", telefone: "+5565991234567", servico: 2, status: "agendado" },
  { profissional: 1, hora: "09:30", duracao: 45, cliente: "Sônia Meireles", telefone: "+5565992003344", servico: 3, status: "concluido" },
  { profissional: 1, hora: "11:00", duracao: 60, cliente: "Patrícia Lemos", telefone: "+5565993456789", servico: 1, status: "faltou", faltas: 2 },
  { profissional: 1, hora: "15:00", duracao: 100, cliente: "Renata Figueiredo", telefone: "+5565994567890", servico: 0, status: "confirmado" },
  { profissional: 2, hora: "10:00", duracao: 45, cliente: "Luiza Ferraz", telefone: "+5565995678901", servico: 3, status: "agendado", origem: "link_publico" },
  { profissional: 2, hora: "13:30", duracao: 60, cliente: "Helena Barbosa", telefone: "+5565996789012", servico: 1, status: "agendado" },
  { profissional: 2, hora: "16:00", duracao: 100, cliente: "Vitória Andrade", telefone: "+5565997890123", servico: 0, status: "cancelado" },
];

/** Atendimentos de um dia, montados no fuso da empresa demonstrada. */
export function atendimentosDemo(dia: string): AtendimentoNaAgenda[] {
  return MODELOS.map((modelo, indice) => {
    const inicio = new Date(`${dia}T${modelo.hora}:00-04:00`);
    const fim = new Date(inicio.getTime() + modelo.duracao * 60_000);
    const servico = SERVICOS_DEMO[modelo.servico];

    return {
      id: `demo-atend-${indice}`,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      status: modelo.status,
      precoCents: servico.precoCents,
      origem: modelo.origem ?? "interno",
      confirmadoEm: modelo.status === "confirmado" ? inicio.toISOString() : null,
      lembreteEnviadoEm: null,
      profissionalId: PROFISSIONAIS_DEMO[modelo.profissional].id,
      cliente: {
        id: `demo-cli-${indice}`,
        nome: modelo.cliente,
        telefone: modelo.telefone,
        faltas: modelo.faltas ?? 0,
      },
      servico: { id: servico.id, nome: servico.nome, duracaoMin: servico.duracaoMin },
    };
  });
}

export function bloqueiosDemo(dia: string): BloqueioNaAgenda[] {
  return [
    {
      id: "demo-bloqueio-1",
      profissionalId: PROFISSIONAIS_DEMO[0].id,
      inicio: new Date(`${dia}T12:00:00-04:00`).toISOString(),
      fim: new Date(`${dia}T13:00:00-04:00`).toISOString(),
      motivo: "Almoço",
    },
  ];
}

export const CLIENTES_DEMO = MODELOS.map((modelo, indice) => ({
  id: `demo-cli-${indice}`,
  nome: modelo.cliente,
  telefone: modelo.telefone,
}));

/** Resumo financeiro de demonstração, em centavos (usado na FASE 3 e na página de vendas). */
export const FINANCEIRO_DEMO = {
  entrouCents: 1_843_000,
  saiuCents: 711_245,
  anteriorCents: { entrouCents: 1_755_000, saiuCents: 722_800, sobrouCents: 1_032_200 },
  seisMeses: [
    { mes: "2026-03", rotulo: "mar", entrouCents: 1_398_000, saiuCents: 668_400 },
    { mes: "2026-04", rotulo: "abr", entrouCents: 1_512_000, saiuCents: 690_000 },
    { mes: "2026-05", rotulo: "mai", entrouCents: 1_688_000, saiuCents: 705_500 },
    { mes: "2026-06", rotulo: "jun", entrouCents: 1_594_000, saiuCents: 681_200 },
    { mes: "2026-07", rotulo: "jul", entrouCents: 1_755_000, saiuCents: 722_800 },
    { mes: "2026-08", rotulo: "ago", entrouCents: 1_843_000, saiuCents: 711_245 },
  ],
  maioresDespesas: [
    { categoria: "Aluguel do espaço", valorCents: 280_000 },
    { categoria: "Materiais e insumos", valorCents: 164_500 },
    { categoria: "Salários e encargos", valorCents: 130_000 },
    { categoria: "Energia, água e internet", valorCents: 78_745 },
    { categoria: "Taxas de maquininha", valorCents: 58_000 },
  ],
};
