export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: PaginationMeta;
};

export type RifaResumo = {
  id: string;
  descricao: string;
  valor_premio: number;
  valor_numero: number;
  lucro_desejado: number;
  faturamento_alvo: number;
  quantidade_numeros: number;
  data_sorteio: string;
  status: "ativa" | "sorteada" | "cancelada";
  criada_em: string;
  total_numeros: number;
  vendidos: number;
  disponiveis: number;
  total_arrecadado: number;
  atingiu_meta: number;
};

export type DashboardResponse = {
  totais: {
    totalRifas: number;
    rifasAtivas: number;
    rifasSorteadas: number;
    faturamentoAlvoGeral: number;
    premiosGeral: number;
    arrecadadoGeral: number;
  };
};

export type RifaDetalhe = {
  id: string;
  descricao: string;
  valor_premio: number;
  valor_numero: number;
  lucro_desejado: number;
  faturamento_alvo: number;
  quantidade_numeros: number;
  data_sorteio: string;
  status: "ativa" | "sorteada" | "cancelada";
};

export type RifaDetalheResponse = {
  rifa: RifaDetalhe;
  resumo: {
    total_numeros: number;
    vendidos: number;
    disponiveis: number;
    total_arrecadado: number;
    pagos: number;
  };
  sorteio: {
    id: string;
    numero: string;
    vencedor_nome: string;
    vencedor_telefone: string;
    criada_em: string;
  } | null;
};

export type NumeroRifa = {
  id: string;
  numero: string;
  pessoa_id: string | null;
  pago: number;
  valor_pago: number | null;
  vendido_em: string | null;
  criado_em: string;
  nome: string | null;
  telefone: string | null;
};

export type Pessoa = {
  id: string;
  nome: string;
  telefone: string;
  criada_em: string;
  atualizada_em: string;
};

export type CandidatoSorteio = {
  id: string;
  numero: string;
  nome: string;
  telefone: string;
};

export type SorteioResponse = {
  rifa: {
    id: string;
    descricao: string;
  };
  candidatos: CandidatoSorteio[];
  vencedor: {
    numero: string;
    nome: string;
    telefone: string;
  };
};
