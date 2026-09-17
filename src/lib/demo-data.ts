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
import type { LancamentoParaRelatorio } from "@/lib/reports/tipos";

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

/**
 * Agosto de 2026 vem dos próprios lançamentos de demonstração: o cartão do
 * financeiro, o gráfico e o resumo do mês contam a mesma história, sempre.
 */
function totaisDeAgosto() {
  const lancamentos = lancamentosDemo();
  const somar = (filtro: (item: (typeof lancamentos)[number]) => boolean) =>
    lancamentos.filter(filtro).reduce((soma, item) => soma + item.valorCents, 0);

  return {
    entrouCents: somar((item) => item.tipo === "receita"),
    // A retirada do dono não é despesa do negócio: fica fora do "saiu".
    saiuCents: somar((item) => item.tipo === "despesa" && item.grupo !== "retirada"),
  };
}

const AGOSTO = totaisDeAgosto();

/** Resumo financeiro de demonstração, em centavos (usado na FASE 3 e na página de vendas). */
export const FINANCEIRO_DEMO = {
  entrouCents: AGOSTO.entrouCents,
  saiuCents: AGOSTO.saiuCents,
  anteriorCents: { entrouCents: 1_755_000, saiuCents: 722_800, sobrouCents: 1_032_200 },
  seisMeses: [
    { mes: "2026-03", rotulo: "mar", entrouCents: 1_398_000, saiuCents: 668_400 },
    { mes: "2026-04", rotulo: "abr", entrouCents: 1_512_000, saiuCents: 690_000 },
    { mes: "2026-05", rotulo: "mai", entrouCents: 1_688_000, saiuCents: 705_500 },
    { mes: "2026-06", rotulo: "jun", entrouCents: 1_594_000, saiuCents: 681_200 },
    { mes: "2026-07", rotulo: "jul", entrouCents: 1_755_000, saiuCents: 722_800 },
    { mes: "2026-08", rotulo: "ago", entrouCents: AGOSTO.entrouCents, saiuCents: AGOSTO.saiuCents },
  ],
  maioresDespesas: [
    { categoria: "Aluguel do espaço", valorCents: 280_000 },
    { categoria: "Materiais e insumos", valorCents: 164_500 },
    { categoria: "Salários e encargos", valorCents: 130_000 },
    { categoria: "Energia, água e internet", valorCents: 78_745 },
    { categoria: "Taxas de maquininha e bancárias", valorCents: 58_000 },
  ],
};

/** Lançamentos de demonstração para os relatórios da página de vendas. */
export function lancamentosDemo(): LancamentoParaRelatorio[] {
  const base = {
    situacao: "pago" as const,
    vencimento: null,
    codigoDaCategoria: null,
    codigoDaConta: null,
    conta: "Conta bancária",
    documentoDoCliente: null,
    tipoDeReceita: "servico" as const,
    notaFiscalEmitida: false,
    reciboSaudeEmitido: false,
    comprovante: null,
    dedutivelSugerido: false,
  };

  // Um mês inteiro de um salão com três profissionais, dia a dia: o que entra tem
  // de cobrir aluguel, insumos, salários e a retirada do dono, senão a
  // demonstração não é honesta. Domingo o salão não abre.
  const AGENDA_DA_SEMANA: Record<number, { servico: string; valorCents: number }[]> = {
    1: [
      { servico: "Escova + hidratação", valorCents: 12000 },
      { servico: "Corte feminino", valorCents: 9000 },
      { servico: "Manicure", valorCents: 5500 },
    ],
    2: [
      { servico: "Escova + hidratação", valorCents: 12000 },
      { servico: "Coloração", valorCents: 22000 },
      { servico: "Corte feminino", valorCents: 9000 },
    ],
    3: [
      { servico: "Coloração", valorCents: 22000 },
      { servico: "Escova + hidratação", valorCents: 12000 },
      { servico: "Corte feminino", valorCents: 9000 },
      { servico: "Manicure e pedicure", valorCents: 9000 },
    ],
    4: [
      { servico: "Progressiva", valorCents: 32000 },
      { servico: "Escova + hidratação", valorCents: 12000 },
      { servico: "Corte feminino", valorCents: 9000 },
    ],
    5: [
      { servico: "Mechas + corte", valorCents: 45000 },
      { servico: "Coloração", valorCents: 22000 },
      { servico: "Escova + hidratação", valorCents: 12000 },
      { servico: "Corte feminino", valorCents: 9000 },
    ],
    6: [
      { servico: "Pacote de noiva", valorCents: 68000 },
      { servico: "Progressiva", valorCents: 32000 },
      { servico: "Coloração", valorCents: 22000 },
      { servico: "Escova + hidratação", valorCents: 12000 },
    ],
  };

  const CLIENTES_DO_MES = [
    "Marina Alves",
    "Juliana Prado",
    "Beatriz Camargo",
    "Sônia Meireles",
    "Patrícia Lemos",
    "Renata Figueiredo",
    "Camila Duarte",
    "Larissa Nogueira",
    "Vanessa Prado",
    "Aline Bezerra",
    "Júlia Antunes",
    "Carla Siqueira",
    "Elaine Barros",
    "Tatiane Moraes",
  ];

  const receitas: { descricao: string; valorCents: number; dia: string }[] = [];
  for (let diaDoMes = 1; diaDoMes <= 31; diaDoMes += 1) {
    const data = new Date(Date.UTC(2026, 7, diaDoMes));
    const atendimentos = AGENDA_DA_SEMANA[data.getUTCDay()];
    if (!atendimentos) continue; // domingo
    const dia = `2026-08-${String(diaDoMes).padStart(2, "0")}`;
    for (const atendimento of atendimentos) {
      const cliente = CLIENTES_DO_MES[receitas.length % CLIENTES_DO_MES.length];
      receitas.push({
        descricao: `${atendimento.servico} — ${cliente}`,
        valorCents: atendimento.valorCents,
        dia,
      });
    }
  }

  const despesas = [
    { descricao: "Aluguel do espaço", valorCents: 280000, categoria: "Aluguel do espaço", grupo: "operacional" as const, dedutivel: true, dia: "2026-08-05" },
    { descricao: "Materiais e insumos", valorCents: 164500, categoria: "Materiais e insumos", grupo: "operacional" as const, dedutivel: true, dia: "2026-08-08" },
    { descricao: "Salários e encargos", valorCents: 130000, categoria: "Salários e encargos", grupo: "operacional" as const, dedutivel: true, dia: "2026-08-05" },
    { descricao: "Energia, água e internet", valorCents: 78745, categoria: "Energia, água e internet", grupo: "operacional" as const, dedutivel: true, dia: "2026-08-10" },
    { descricao: "DAS do MEI", valorCents: 7600, categoria: "Impostos (DAS, ISS, Carnê-Leão)", grupo: "imposto" as const, dedutivel: false, dia: "2026-08-20" },
    { descricao: "Taxas de maquininha", valorCents: 58000, categoria: "Taxas de maquininha e bancárias", grupo: "financeiro" as const, dedutivel: false, dia: "2026-08-31" },
    { descricao: "Retirada do dono", valorCents: 450000, categoria: "Retirada do dono", grupo: "retirada" as const, dedutivel: false, dia: "2026-08-28" },
  ];

  return [
    ...receitas.map((item, indice) => ({
      ...base,
      id: `demo-rec-${indice}`,
      tipo: "receita" as const,
      descricao: item.descricao,
      valorCents: item.valorCents,
      competencia: item.dia,
      pagoEm: item.dia,
      categoria: "Atendimentos",
      grupo: "operacional" as const,
      formaDePagamento: indice % 2 === 0 ? "pix" : "cartao_credito",
      pagador: "pf" as const,
      cliente: item.descricao.split("— ")[1] ?? null,
    })),
    ...despesas.map((item, indice) => ({
      ...base,
      id: `demo-desp-${indice}`,
      tipo: "despesa" as const,
      descricao: item.descricao,
      valorCents: item.valorCents,
      competencia: item.dia,
      pagoEm: item.dia,
      categoria: item.categoria,
      grupo: item.grupo,
      dedutivelSugerido: item.dedutivel,
      formaDePagamento: "transferencia",
      pagador: null,
      cliente: null,
    })),
  ];
}
