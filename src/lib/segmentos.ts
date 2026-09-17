import type { Enums } from "@/lib/supabase/database.types";

export type Segmento = "salao" | "barbearia" | "clinica" | "consultorio" | "personal" | "terapeuta" | "outro";

export const SEGMENTOS: { valor: Segmento; nome: string; icone: string }[] = [
  { valor: "salao", nome: "Salão de beleza", icone: "Scissors" },
  { valor: "barbearia", nome: "Barbearia", icone: "Bean" },
  { valor: "clinica", nome: "Clínica", icone: "Stethoscope" },
  { valor: "consultorio", nome: "Consultório", icone: "HeartPulse" },
  { valor: "personal", nome: "Personal trainer", icone: "Dumbbell" },
  { valor: "terapeuta", nome: "Terapeuta", icone: "Flower2" },
  { valor: "outro", nome: "Outro tipo de negócio", icone: "Store" },
];

export const REGIMES: {
  valor: Enums<"tax_regime">;
  nome: string;
  explicacao: string;
}[] = [
  {
    valor: "pf_autonomo",
    nome: "Autônomo (pessoa física)",
    explicacao: "Você atende no seu CPF e declara no Carnê-Leão.",
  },
  {
    valor: "mei",
    nome: "MEI",
    explicacao: "Tem CNPJ de microempreendedor individual e limite de faturamento por ano.",
  },
  {
    valor: "simples_nacional",
    nome: "Empresa no Simples Nacional",
    explicacao: "ME ou EPP com contador cuidando das guias do Simples.",
  },
  {
    valor: "outro",
    nome: "Outro / não sei ainda",
    explicacao: "Escolha esta opção e ajuste depois junto com seu contador.",
  },
];

/** Serviços sugeridos por segmento, com duração em minutos e preço em centavos. */
export const SERVICOS_SUGERIDOS: Record<Segmento, { nome: string; duracao: number; preco: number }[]> = {
  salao: [
    { nome: "Corte feminino", duracao: 60, preco: 9000 },
    { nome: "Escova", duracao: 45, preco: 6000 },
    { nome: "Coloração", duracao: 120, preco: 22000 },
    { nome: "Hidratação", duracao: 60, preco: 12000 },
  ],
  barbearia: [
    { nome: "Corte masculino", duracao: 30, preco: 5000 },
    { nome: "Barba", duracao: 30, preco: 4000 },
    { nome: "Corte + barba", duracao: 60, preco: 8000 },
    { nome: "Pezinho", duracao: 15, preco: 2000 },
  ],
  clinica: [
    { nome: "Primeira consulta", duracao: 60, preco: 25000 },
    { nome: "Retorno", duracao: 30, preco: 15000 },
    { nome: "Avaliação", duracao: 45, preco: 20000 },
  ],
  consultorio: [
    { nome: "Consulta", duracao: 50, preco: 20000 },
    { nome: "Retorno", duracao: 30, preco: 12000 },
    { nome: "Avaliação inicial", duracao: 60, preco: 25000 },
  ],
  personal: [
    { nome: "Treino individual", duracao: 60, preco: 10000 },
    { nome: "Avaliação física", duracao: 45, preco: 12000 },
    { nome: "Treino em dupla", duracao: 60, preco: 14000 },
  ],
  terapeuta: [
    { nome: "Sessão", duracao: 50, preco: 18000 },
    { nome: "Primeira sessão", duracao: 60, preco: 22000 },
    { nome: "Sessão em casal", duracao: 80, preco: 28000 },
  ],
  outro: [
    { nome: "Atendimento", duracao: 60, preco: 10000 },
    { nome: "Atendimento rápido", duracao: 30, preco: 6000 },
  ],
};

export function nomeDoSegmento(valor: string) {
  return SEGMENTOS.find((item) => item.valor === valor)?.nome ?? "Negócio";
}
